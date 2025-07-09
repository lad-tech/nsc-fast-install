import { exec, ExecException, ExecOptions } from 'child_process';
import cabinet from 'filing-cabinet';
import * as fss from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import precinct from 'precinct';

import { CollectOptions, isPackageLockV3, PackageJsonLike, PackageLockLike, TsConfigLike } from './types';

export interface ParseTsConfigParams {
  workDir: string;
  configName: string;
}

/** Загружает и парсит tsconfig.json */
export async function parseTsConfig(data: ParseTsConfigParams): Promise<TsConfigLike> {
  const { workDir, configName } = data;
  const list = await fs.readdir(workDir);
  if (!list.includes(configName)) {
    throw new Error(`tsconfig.json not found in ${workDir} directory. Use --tsconfig for custom config name`);
  }
  try {
    return (await import(path.resolve(workDir, configName))) as TsConfigLike;
  } catch (e: any) {
    throw new Error(`tsconfig.json parsing error: ${e.message}`);
  }
}

/** Определяет outDir из tsconfig и проверяет его существование */
export async function getOutDir(data: { tsConfig: TsConfigLike; workDir: string }): Promise<string> {
  const outDir = data.tsConfig.compilerOptions?.outDir;
  if (!outDir) throw new Error('No outDir specified in tsconfig.json');

  const fullPath = path.resolve(data.workDir, outDir);
  try {
    await fs.access(fullPath);
    return fullPath;
  } catch {
    throw new Error(`Dist dir not found at ${fullPath}. Did you forget to build?`);
  }
}

/** Возвращает путь к js-файлу entrypoint-а внутри outDir */
export async function findOutDirEntry(data: {
  tsConfig: TsConfigLike;
  workDir: string;
  entryPoint: string;
  verbose?: boolean;
}): Promise<string> {
  const { workDir, tsConfig, entryPoint, verbose } = data;
  const baseName = path.basename(entryPoint).replace(/\.ts$/, '.js');
  let outDir = path.resolve(workDir, tsConfig.compilerOptions?.outDir || 'dist');

  if (tsConfig.compilerOptions?.baseUrl) {
    const rel = path.relative(path.resolve(workDir, tsConfig.compilerOptions.baseUrl), workDir);
    outDir = path.resolve(outDir, rel);
    if (verbose) console.log('[findOutDirEntry] adjusted outDir:', outDir);
  }

  await fs.access(outDir);
  return path.resolve(outDir, baseName);
}

const DEFAULT_ENTRY_POINTS = ['start.ts', 'service.ts', 'index.ts'];

/** Автоматически находит entrypoint сервиса */
export async function findServiceEntry(data: { workDir: string; verbose: boolean }): Promise<string> {
  const { workDir, verbose } = data;
  const list = await fs.readdir(workDir);

  if (list.includes('package.json')) {
    try {
      const pkg = (await import(path.resolve(workDir, 'package.json'))) as PackageJsonLike;
      if (pkg.main) {
        const entry = path.resolve(workDir, pkg.main);
        await fs.access(entry);
        if (verbose) console.log(`Entry from package.json found: ${entry}`);
        return entry;
      }
    } catch (err) {
      if (verbose) console.warn('Failed to resolve main from package.json:', err);
    }
  }

  for (const file of DEFAULT_ENTRY_POINTS) {
    const entry = path.resolve(workDir, file);
    try {
      await fs.access(entry);
      if (verbose) console.log(`Fallback entry found: ${entry}`);
      return entry;
    } catch {
      if (verbose) console.log(`Checked entry: ${entry} - not found`);
    }
  }

  throw new Error(`Entry for ${workDir} not found. Use --entryPoint explicitly.`);
}

/** Парсит package-lock.json */
export async function parsePackageLock(dir: string): Promise<PackageLock> {
  const packageLockFile = path.join(dir, 'package-lock.json');
  try {
    const lock = await import(packageLockFile);
    console.log(`Using package-lock ${packageLockFile}`);
    return lock;
  } catch {
    throw new Error(`package-lock.json not found in ${dir}`);
  }
}

/** Выполняет shell-команду */
export async function execCmd(
  command: string,
  options?: {
    encoding?: BufferEncoding;
  } & ExecOptions,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    exec(command, options ?? {}, (error: ExecException | null) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

/** Разбирает имя зависимости на namespace и name */
export function parseDepName(dep: string): { namespace: string | null; name: string } {
  const [namespace, name] = dep.split('/');
  return {
    namespace: name ? namespace : null,
    name: name ?? namespace,
  };
}

/** Извлекает список импортов из файла и пытается их разрешить */
function extractFileDeps(file: string, baseDir: string) {
  const resolved: string[] = [];
  const notFound: string[] = [];
  let dependencies: string[];

  try {
    dependencies = precinct.paperwork(file, { includeCore: false });
  } catch (err) {
    console.log(`Error getting deps in ${file}`, err);
    return { resolved, notFound };
  }

  for (const dep of dependencies) {
    let result;
    try {
      result = cabinet({
        partial: dep,
        filename: file,
        directory: baseDir,
      });
    } catch (err) {
      console.warn(`Failed to resolve ${dep} in ${file}:`, err);
    }

    if (result && fss.existsSync(result)) {
      resolved.push(result);
    } else {
      notFound.push(dep);
    }
  }

  return { resolved, notFound };
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
    const { resolved: localResolved, notFound } = extractFileDeps(file, baseDir);

    for (const missing of notFound) notResolved.add(missing);

    for (const dep of localResolved) {
      if (visited.has(dep)) continue;
      visited.add(dep);

      const parts = dep.split('/');
      const nodeModulesIdx = parts.indexOf('node_modules');
      const isExternal = nodeModulesIdx !== -1;

      if (isExternal) {
        const depth = parts.filter(p => p === 'node_modules').length;
        if (depth === 1) {
          const depName = parts[nodeModulesIdx + 1]?.startsWith('@')
            ? `${parts[nodeModulesIdx + 1]}/${parts[nodeModulesIdx + 2]}`
            : parts[nodeModulesIdx + 1];
          resolved.add(depName);
        }
      } else {
        visit(dep);
      }
    }
  }

  visit(entrypoint);

  const { requiredPeerDeps, optionalPeerDeps } = collectPeerDeps(resolved, cwd);
  requiredPeerDeps.forEach(d => resolved.add(d));

  if (notResolved.size) {
    throw new Error(`Unresolved imports:\n${Array.from(notResolved).join('\n')}`);
  }

  const higherOrderDeps = collectHigherOrderDeps(resolved, packageLock, cwd, options);

  return {
    firstOrderDeps: Array.from(resolved),
    higherOrderDeps: Array.from(higherOrderDeps),
    optionalPeerDeps: Array.from(optionalPeerDeps),
  };
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

function collectHigherOrderDeps(
  firstOrderDeps: Set<string>,
  packageLock: PackageLockLike,
  cwd: string,
  options: { verbose: any },
) {
  if (!packageLock) {
    throw new Error('collectHigherOrderDeps(): No package-lock');
  }

  const isV3 = isPackageLockV3(packageLock);

  const rootDependencies = isV3 ? packageLock.packages?.['']?.dependencies : packageLock.dependencies;

  if (firstOrderDeps.size > 0 && !rootDependencies) {
    throw new Error('collectHigherOrderDeps(): No dependencies field in package-lock root');
  }

  const ret = new Set<string>();
  const visitedNodes = new Set<string>();
  const verbose = options.verbose;

  function visitNode(node: any, parents: string | any[]) {
    if (visitedNodes.has(node)) {
      return;
    }

    visitedNodes.add(node);

    const requires = Object.keys(node.requires || {});
    const deps = node.dependencies || {};

    for (const require of requires) {
      let nodeWithDep = null;
      let nextParents: any = null;

      if (deps[require]) {
        nodeWithDep = node;
        nextParents = [node, ...parents];
      } else {
        for (let i = 0; i < parents.length; i++) {
          const parent = parents[i];

          const parentDeps = isV3 ? parent.packages?.['']?.dependencies || {} : parent.dependencies || {};

          if (parentDeps[require]) {
            nodeWithDep = parent;
            nextParents = parents.slice(i);
            break;
          }
        }
      }

      if (!nodeWithDep) {
        throw new Error(
          `collectHigherOrderDeps(): cannot find where "${require}" is installed. ` +
            'Looks like package-lock.json is corrupted.',
        );
      }

      const isRoot = isV3 ? nodeWithDep === packageLock.packages?.[''] : nodeWithDep === packageLock;

      if (isRoot && !firstOrderDeps.has(require)) {
        if (verbose) {
          console.log(`Found higher order dep ${require}`);
        }

        ret.add(require);
      }

      const nextNode = isV3 ? nodeWithDep.packages?.[require] : nodeWithDep.dependencies?.[require];

      visitNode(nextNode, nextParents);
    }
  }

  for (const dep of firstOrderDeps) {
    const node = isV3 ? packageLock.packages?.[dep] : packageLock.dependencies?.[dep];

    if (!node) {
      throw new Error(`collectHigherOrderDeps(): Dependency description for ${dep} not found in package-lock`);
    }

    visitNode(node, [packageLock]);
  }

  return Array.from(ret);
}
