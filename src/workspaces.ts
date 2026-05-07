import * as fss from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';

import { getPackageDependencyNames, readPackageJson } from './packageJson';
import { PackageJsonLike } from './types';

export interface WorkspaceInfo {
  packageNames: Set<string>;
  packageDirs: Map<string, string>;
  packageJsons: Map<string, PackageJsonLike>;
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

function addPackageDependencyNames(target: Set<string>, pkg: PackageJsonLike) {
  for (const depName of getPackageDependencyNames(pkg)) {
    target.add(depName);
  }
}
