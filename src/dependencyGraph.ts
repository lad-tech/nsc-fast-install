import cabinet from 'filing-cabinet';
import * as fss from 'fs';
import { createRequire } from 'module';
import * as path from 'path';
import precinct from 'precinct';

import { collectHigherOrderDeps, getLockfileSubDependencyNames, normalizeLockDepName } from './lockfile';
import { getPackageDependencyNames } from './packageJson';
import { CollectOptions, PackageJsonLike, PackageLockLike } from './types';
import { getErrorMessage } from './utils';
import { WorkspaceInfo } from './workspaces';

/** Разбирает имя зависимости на namespace и name */
export function parseDepName(dep: string): { namespace: string | null; name: string } {
  const [namespace, name] = dep.split('/');
  return {
    namespace: name ? namespace : null,
    name: name ?? namespace,
  };
}

/** Собирает зависимости (первичные, вложенные и peer-опциональные) */
export function collectDeps(data: {
  entrypoint: string;
  baseDir: string;
  packageLock: PackageLockLike;
  cwd: string;
  options: CollectOptions;
}) {
  const { entrypoint, baseDir, packageLock, cwd, options } = data;

  const resolved = new Set<string>();
  const notResolved = new Set<string>();
  const visited = new Set<string>();

  function visit(file: string) {
    const { resolved: localResolved, notFound } = extractFileDeps(file, baseDir, cwd, options);

    for (const missing of notFound) notResolved.add(missing);

    for (const dep of localResolved) {
      if (dep.packageName) resolved.add(dep.packageName);

      const realFile = resolveRealPath(dep.file);
      if (visited.has(realFile)) continue;
      visited.add(realFile);

      const depNameFromNodeModules = getPackageNameFromNodeModules(dep.file);
      if (depNameFromNodeModules) resolved.add(depNameFromNodeModules);

      if (depNameFromNodeModules && !isLinkedPackage(cwd, depNameFromNodeModules)) continue;
      if (!isScannableFile(realFile)) continue;

      visit(realFile);
    }
  }

  visit(entrypoint);

  const { requiredPeerDeps, optionalPeerDeps } = collectPeerDeps(resolved, cwd);
  requiredPeerDeps.forEach(d => resolved.add(d));

  if (notResolved.size) {
    throw new Error(`Unresolved imports:\n${Array.from(notResolved).join('\n')}`);
  }

  const higherOrderDeps = collectHigherOrderDeps(resolved, packageLock, options);

  return {
    higherOrderDeps,
    firstOrderDeps: Array.from(resolved),
    optionalPeerDeps: Array.from(optionalPeerDeps),
  };
}

export function expandDependenciesToCopy(data: {
  deps: string[];
  packageLock: PackageLockLike;
  workspaceInfo: WorkspaceInfo;
  options: CollectOptions;
}): string[] {
  const { packageLock, workspaceInfo, options } = data;
  const result = new Set<string>();
  const queue = data.deps.map(normalizeLockDepName);

  function enqueue(depName: string) {
    const normalizedDepName = normalizeLockDepName(depName);
    if (result.has(normalizedDepName) || queue.includes(normalizedDepName)) return;
    queue.push(normalizedDepName);
  }

  while (queue.length > 0) {
    const depName = queue.shift();
    if (!depName || result.has(depName)) continue;

    result.add(depName);

    const workspacePackage = workspaceInfo.packageJsons.get(depName);
    if (workspacePackage) {
      for (const workspaceDep of getPackageDependencyNames(workspacePackage)) {
        if (options.verbose) console.log(`↳ workspace dep: ${depName} -> ${workspaceDep}`);
        enqueue(workspaceDep);
      }
    }

    for (const subDep of getLockfileSubDependencyNames(depName, packageLock)) {
      enqueue(subDep);
    }
  }

  return Array.from(result);
}

type ExtractFileDepsResult = {
  readonly resolved: Array<{ file: string; packageName: string | null }>;
  readonly notFound: string[];
};

function extractFileDeps(file: string, baseDir: string, cwd: string, options: CollectOptions): ExtractFileDepsResult {
  const resolved: Array<{ file: string; packageName: string | null }> = [];
  const notFound: string[] = [];
  let dependencies: string[];

  if (!fss.existsSync(file)) {
    throw new Error(`Dependency scan target not found: ${file}`);
  }

  try {
    dependencies = precinct.paperwork(file, { includeCore: false });
  } catch (err) {
    throw new Error(`Failed to scan dependencies in ${file}: ${getErrorMessage(err)}`);
  }

  for (const dep of dependencies) {
    let result: string | undefined;
    try {
      result = resolveImport(dep, file, baseDir, cwd);
    } catch (err) {
      console.warn(`Failed to resolve ${dep} in ${file}:`, err);
    }

    if (result && fss.existsSync(result)) {
      const importedPackageName = getImportedPackageName(dep);
      resolved.push({
        file: result,
        packageName:
          importedPackageName && isPackageResolution(cwd, result, importedPackageName) ? importedPackageName : null,
      });
      if (options.verbose) console.log(`[resolve] ${dep} in ${file} -> ${result}`);
    } else {
      notFound.push(dep);
    }
  }

  return { resolved, notFound };
}

function resolveImport(dep: string, file: string, baseDir: string, cwd: string): string | undefined {
  try {
    const rootRequire = createRequire(path.join(cwd, 'package.json'));
    const fileRequire = createRequire(file);
    if (!getImportedPackageName(dep)) return fileRequire.resolve(dep);

    try {
      return rootRequire.resolve(dep);
    } catch {
      return fileRequire.resolve(dep);
    }
  } catch {
    return cabinet({
      partial: dep,
      filename: file,
      directory: baseDir,
    });
  }
}

function getImportedPackageName(dep: string): string | null {
  if (dep.startsWith('.') || dep.startsWith('/') || dep.startsWith('#')) return null;

  const [namespaceOrName, name] = dep.split('/');
  if (!namespaceOrName) return null;
  if (namespaceOrName.startsWith('@')) return name ? `${namespaceOrName}/${name}` : null;
  return namespaceOrName;
}

function isScannableFile(file: string): boolean {
  return ['.js', '.cjs', '.mjs', '.jsx'].includes(path.extname(file));
}

function isPackageResolution(cwd: string, resolvedFile: string, packageName: string): boolean {
  if (getPackageNameFromNodeModules(resolvedFile)) return true;

  try {
    const linkedPackageRealPath = fss.realpathSync(path.join(cwd, 'node_modules', packageName));
    const resolvedRealPath = resolveRealPath(resolvedFile);
    return (
      resolvedRealPath === linkedPackageRealPath || resolvedRealPath.startsWith(`${linkedPackageRealPath}${path.sep}`)
    );
  } catch {
    return false;
  }
}

function resolveRealPath(file: string): string {
  try {
    return fss.realpathSync(file);
  } catch {
    return file;
  }
}

function getPackageNameFromNodeModules(file: string): string | null {
  const parts = file.split(path.sep);
  const nodeModulesIdx = parts.indexOf('node_modules');
  if (nodeModulesIdx === -1) return null;

  const first = parts[nodeModulesIdx + 1];
  if (!first) return null;
  return first.startsWith('@') ? `${first}/${parts[nodeModulesIdx + 2]}` : first;
}

function isLinkedPackage(cwd: string, depName: string): boolean {
  try {
    return fss.lstatSync(path.join(cwd, 'node_modules', depName)).isSymbolicLink();
  } catch {
    return false;
  }
}

function collectPeerDeps(firstOrderDeps: Set<string>, cwd: string) {
  const required = new Set<string>();
  const optional = new Set<string>();

  for (const dep of firstOrderDeps) {
    const pkgFile = path.join(cwd, 'node_modules', dep, 'package.json');
    let json: PackageJsonLike;

    try {
      json = require(pkgFile);
    } catch {
      continue;
    }

    const peers = json.peerDependencies || {};
    const meta = json.peerDependenciesMeta || {};

    for (const key of Object.keys(peers)) {
      if (meta[key]?.optional) optional.add(key);
      else required.add(key);
    }
  }

  return { requiredPeerDeps: required, optionalPeerDeps: optional };
}
