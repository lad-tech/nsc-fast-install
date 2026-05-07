import { exec, ExecException, ExecOptions } from 'child_process';
import cabinet from 'filing-cabinet';
import * as fss from 'fs';
import * as fs from 'fs/promises';
import { createRequire } from 'module';
import * as path from 'path';
import precinct from 'precinct';

import {
  CollectOptions,
  isPackageLockV3,
  PackageJsonLike,
  PackageLockLike,
  PackageLockLikeV2,
  PackageLockLikeV3,
  TsConfigLike,
} from './types';

export interface ParseTsConfigParams {
  workDir: string;
  configName: string;
}

export type EntryStrategy = 'runtime' | 'main';

export interface WorkspaceInfo {
  packageNames: Set<string>;
  packageDirs: Map<string, string>;
  packageJsons: Map<string, PackageJsonLike>;
}

export async function readPackageJson(dir: string): Promise<PackageJsonLike> {
  return readJsonFile(path.join(dir, 'package.json'));
}

async function readJsonFile<T = any>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
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
  const resolvedEntry = resolveEntryPointPath(workDir, entryPoint);
  const outDir = path.resolve(workDir, tsConfig.compilerOptions?.outDir || 'dist');

  if (resolvedEntry.endsWith('.js') && fss.existsSync(resolvedEntry)) {
    return resolvedEntry;
  }

  let sourceBase = tsConfig.compilerOptions?.rootDir
    ? path.resolve(workDir, tsConfig.compilerOptions.rootDir)
    : workDir;

  if (tsConfig.compilerOptions?.baseUrl) {
    sourceBase = path.resolve(workDir, tsConfig.compilerOptions.baseUrl);
    if (verbose) console.log('[findOutDirEntry] source base:', sourceBase);
  }

  await fs.access(outDir);
  const relativeEntry = path.relative(sourceBase, resolvedEntry);
  const relativeOutEntry =
    relativeEntry.startsWith('..') || path.isAbsolute(relativeEntry) ? path.basename(resolvedEntry) : relativeEntry;

  return path.resolve(outDir, relativeOutEntry.replace(/\.[cm]?tsx?$/, '.js'));
}

const DEFAULT_ENTRY_POINTS = ['start.ts', 'service.ts', 'index.ts'];

/** Автоматически находит entrypoint сервиса */
export async function findServiceEntry(data: {
  workDir: string;
  verbose: boolean;
  strategy?: EntryStrategy;
}): Promise<string> {
  const { workDir, verbose } = data;
  const strategy = data.strategy ?? 'runtime';
  if (!['runtime', 'main'].includes(strategy)) {
    throw new Error(`Unknown entry strategy "${strategy}". Use "runtime" or "main".`);
  }

  const list = await fs.readdir(workDir);

  if (strategy === 'runtime') {
    const runtimeEntry = await findRuntimeEntry(workDir, verbose);
    if (runtimeEntry) return runtimeEntry;
  }

  const mainEntry = await findPackageMainEntry(workDir, list, verbose);
  if (mainEntry) return mainEntry;

  if (strategy === 'main') {
    const runtimeEntry = await findRuntimeEntry(workDir, verbose);
    if (runtimeEntry) return runtimeEntry;
  }

  throw new Error(`Entry for ${workDir} not found. Use --entryPoint explicitly.`);
}

function resolveEntryPointPath(workDir: string, entryPoint: string): string {
  if (path.isAbsolute(entryPoint)) return entryPoint;

  const entryFromCwd = path.resolve(process.cwd(), entryPoint);
  if (fss.existsSync(entryFromCwd)) return entryFromCwd;

  return path.resolve(workDir, entryPoint);
}

async function findPackageMainEntry(workDir: string, list: string[], verbose: boolean): Promise<string | undefined> {
  if (!list.includes('package.json')) return undefined;

  try {
    const pkg = await readPackageJson(workDir);
    if (pkg.main) {
      const entry = path.resolve(workDir, pkg.main);
      await fs.access(entry);
      if (verbose) console.log(`Entry from package.json found: ${entry}`);
      return entry;
    }
  } catch (err) {
    if (verbose) console.warn('Failed to resolve main from package.json:', err);
  }

  return undefined;
}

async function findRuntimeEntry(workDir: string, verbose: boolean): Promise<string | undefined> {
  for (const file of DEFAULT_ENTRY_POINTS) {
    const entry = path.resolve(workDir, file);
    try {
      await fs.access(entry);
      if (verbose) console.log(`Runtime entry found: ${entry}`);
      return entry;
    } catch {
      if (verbose) console.log(`Checked entry: ${entry} - not found`);
    }
  }

  return undefined;
}

/** Парсит package-lock.json */
export async function parsePackageLock(dir: string): Promise<PackageLockLike> {
  const packageLockFile = path.join(dir, 'package-lock.json');
  try {
    const lock = await import(packageLockFile);
    console.log(`Using package-lock ${packageLockFile}`);
    return lock;
  } catch {
    throw new Error(`package-lock.json not found in ${dir}`);
  }
}

export async function collectWorkspaceInfo(cwd: string): Promise<WorkspaceInfo> {
  const info: WorkspaceInfo = {
    packageNames: new Set(),
    packageDirs: new Map(),
    packageJsons: new Map(),
  };

  let rootPackage: PackageJsonLike;
  try {
    rootPackage = await readPackageJson(cwd);
  } catch {
    return info;
  }

  const workspacePatterns = getWorkspacePatterns(rootPackage);
  const workspaceDirs = new Set<string>();

  for (const pattern of workspacePatterns) {
    const dirs = await expandWorkspacePattern(cwd, pattern);
    dirs.forEach(dir => workspaceDirs.add(dir));
  }

  for (const dir of workspaceDirs) {
    try {
      const pkg = await readPackageJson(dir);
      if (!pkg.name) continue;
      info.packageNames.add(pkg.name);
      info.packageDirs.set(pkg.name, dir);
      info.packageJsons.set(pkg.name, pkg);
    } catch {
      continue;
    }
  }

  return info;
}

function getWorkspacePatterns(pkg: PackageJsonLike): string[] {
  if (Array.isArray(pkg.workspaces)) return pkg.workspaces.filter(pattern => !pattern.startsWith('!'));
  return pkg.workspaces?.packages?.filter(pattern => !pattern.startsWith('!')) || [];
}

async function expandWorkspacePattern(cwd: string, pattern: string): Promise<string[]> {
  const segments = pattern.split(/[\\/]/).filter(Boolean);
  const dirs = await expandWorkspaceSegments(cwd, segments);
  return dirs.filter(dir => fss.existsSync(path.join(dir, 'package.json')));
}

async function expandWorkspaceSegments(currentDir: string, segments: string[]): Promise<string[]> {
  if (segments.length === 0) return [currentDir];

  const [segment, ...rest] = segments;
  if (segment === '**') {
    const childDirs = await listChildDirs(currentDir);
    const matchesHere = await expandWorkspaceSegments(currentDir, rest);
    const matchesBelow = (
      await Promise.all(childDirs.map(childDir => expandWorkspaceSegments(childDir, segments)))
    ).flat();
    return [...matchesHere, ...matchesBelow];
  }

  if (!segment.includes('*')) {
    return expandWorkspaceSegments(path.join(currentDir, segment), rest);
  }

  const matcher = new RegExp(`^${segment.split('*').map(escapeRegExp).join('.*')}$`);
  const childDirs = await listChildDirs(currentDir);
  const matchedDirs = childDirs.filter(childDir => matcher.test(path.basename(childDir)));
  return (await Promise.all(matchedDirs.map(childDir => expandWorkspaceSegments(childDir, rest)))).flat();
}

async function listChildDirs(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory() && entry.name !== 'node_modules')
      .map(entry => path.join(dir, entry.name));
  } catch {
    return [];
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
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
function extractFileDeps(file: string, baseDir: string, cwd: string, options: CollectOptions) {
  const resolved: Array<{ file: string; packageName: string | null }> = [];
  const notFound: string[] = [];
  let dependencies: string[];

  try {
    dependencies = precinct.paperwork(file, { includeCore: false });
  } catch (err) {
    console.log(`Error getting deps in ${file}`, err);
    return { resolved, notFound };
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

export function collectDeclaredDependencyNames(data: {
  rootPackage: PackageJsonLike;
  targetPackage?: PackageJsonLike;
  workspaceInfo: WorkspaceInfo;
  firstOrderDeps: string[];
}): Set<string> {
  const { rootPackage, targetPackage, workspaceInfo, firstOrderDeps } = data;
  const declared = new Set<string>();
  const visitedWorkspaces = new Set<string>();

  addPackageDependencyNames(declared, rootPackage);
  if (targetPackage) addPackageDependencyNames(declared, targetPackage);
  workspaceInfo.packageNames.forEach(name => declared.add(name));

  function visitWorkspace(depName: string) {
    if (visitedWorkspaces.has(depName)) return;
    visitedWorkspaces.add(depName);

    const workspacePackage = workspaceInfo.packageJsons.get(depName);
    if (!workspacePackage) return;

    for (const dependencyName of getPackageDependencyNames(workspacePackage)) {
      declared.add(dependencyName);
      if (workspaceInfo.packageNames.has(dependencyName)) visitWorkspace(dependencyName);
    }
  }

  firstOrderDeps.forEach(depName => {
    if (workspaceInfo.packageNames.has(depName)) visitWorkspace(depName);
  });

  return declared;
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
  const isV3 = isPackageLockV3(packageLock);

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

    const requires = isV3 ? getV3SubDep(depName, packageLock) : getV2SubDep(depName, packageLock);
    for (const subDep of Object.keys(requires)) {
      enqueue(subDep);
    }
  }

  return Array.from(result);
}

export async function copyDependencies(data: {
  deps: string[];
  cwd: string;
  targetNodeModules: string;
  workspaceInfo: WorkspaceInfo;
  options: CollectOptions;
}): Promise<void> {
  const { deps, cwd, targetNodeModules, workspaceInfo, options } = data;

  await fs.mkdir(targetNodeModules, { recursive: true });

  for (const dep of deps) {
    const src = await resolveDependencySource(cwd, dep, workspaceInfo);
    const dst = path.join(targetNodeModules, dep);
    const isWorkspace = workspaceInfo.packageNames.has(dep);

    if (options.verbose) console.log(`Копирование ${src} → ${dst}`);

    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.cp(src, dst, {
      recursive: true,
      dereference: true,
      filter: isWorkspace ? source => !source.split(path.sep).includes('node_modules') : undefined,
    });
  }
}

async function resolveDependencySource(cwd: string, depName: string, workspaceInfo: WorkspaceInfo): Promise<string> {
  const installedPath = path.join(cwd, 'node_modules', depName);

  try {
    const stat = await fs.lstat(installedPath);
    if (stat.isSymbolicLink()) return fs.realpath(installedPath);
    return installedPath;
  } catch {
    const workspaceDir = workspaceInfo.packageDirs.get(depName);
    if (workspaceDir) return workspaceDir;
    throw new Error(`Dependency ${depName} not found at ${installedPath}`);
  }
}

function addPackageDependencyNames(target: Set<string>, pkg: PackageJsonLike) {
  for (const depName of getPackageDependencyNames(pkg)) {
    target.add(depName);
  }
}

function getPackageDependencyNames(pkg: PackageJsonLike): string[] {
  return Object.keys({
    ...(pkg.dependencies || {}),
    ...(pkg.optionalDependencies || {}),
  });
}

function collectHigherOrderDeps(
  firstOrderDeps: Set<string>,
  packageLock: PackageLockLike,
  options: CollectOptions,
): Array<string> {
  const isV3 = isPackageLockV3(packageLock);
  const result = new Set<string>();
  const visited = new Set<string>();
  function traverse(depName: string): void {
    const normalizedDepName = normalizeLockDepName(depName);
    if (visited.has(normalizedDepName)) return;
    visited.add(normalizedDepName);
    const requires = isV3 ? getV3SubDep(normalizedDepName, packageLock) : getV2SubDep(normalizedDepName, packageLock);
    for (const subDep of Object.keys(requires)) {
      const normalizedSubDep = normalizeLockDepName(subDep);
      if (!firstOrderDeps.has(normalizedSubDep)) {
        if (!result.has(normalizedSubDep) && options.verbose) console.log(`↳ higher-order dep: ${normalizedSubDep}`);
        result.add(normalizedSubDep);
      }
      traverse(normalizedSubDep);
    }
  }

  for (const dep of firstOrderDeps) {
    traverse(dep);
  }

  return Array.from(result);
}

function normalizeLockDepName(depName: string): string {
  return depName.startsWith('node_modules/') ? depName.replace(/^node_modules\//, '') : depName;
}

function getV2SubDep(name: string, packageLock: PackageLockLikeV2): Record<string, string> {
  const node = packageLock.dependencies?.[name];
  if (!node) return {};
  return node.requires || node.dependencies || {};
}

function getV3SubDep(depName: string, packageLock: PackageLockLikeV3): Record<string, unknown> {
  const preparedName = depName.startsWith('node_modules/') ? depName : `node_modules/${depName}`;

  const node = packageLock.packages?.[preparedName];
  if (!node?.dependencies) return {};

  const result: Record<string, unknown> = {};

  for (const subDep of Object.keys(node.dependencies)) {
    const nestedPath = `${preparedName}/node_modules/${subDep}`;
    if (nestedPath in packageLock.packages) {
      result[nestedPath] = packageLock.packages[nestedPath];
    } else {
      const flatPath = `node_modules/${subDep}`;
      result[flatPath] = packageLock.packages?.[flatPath];
    }
  }

  return result;
}
