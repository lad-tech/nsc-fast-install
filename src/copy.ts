import * as fs from 'fs/promises';
import * as path from 'path';

import { CollectOptions } from './types';
import { WorkspaceInfo } from './workspaces';

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
