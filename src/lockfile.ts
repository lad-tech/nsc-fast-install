import * as path from 'path';

import {
  CollectOptions,
  isPackageLockV3,
  PackageLockLike,
  PackageLockLikeV2,
  PackageLockLikeV3,
} from './types';
import { getErrorMessage, isRecord, readJsonObject } from './utils';

export async function parsePackageLock(dir: string): Promise<PackageLockLike> {
  const packageLockFile = path.join(dir, 'package-lock.json');
  try {
    const lock = await readJsonObject(packageLockFile);
    if (!isPackageLockLike(lock)) {
      throw new Error('unsupported package-lock.json format');
    }
    return lock;
  } catch (err) {
    throw new Error(`package-lock.json not found or invalid in ${dir}: ${getErrorMessage(err)}`);
  }
}

export function collectHigherOrderDeps(
  firstOrderDeps: Set<string>,
  packageLock: PackageLockLike,
  options: CollectOptions,
): Array<string> {
  const result = new Set<string>();
  const visited = new Set<string>();

  function traverse(depName: string): void {
    const normalizedDepName = normalizeLockDepName(depName);
    if (visited.has(normalizedDepName)) return;
    visited.add(normalizedDepName);

    for (const subDep of getLockfileSubDependencyNames(normalizedDepName, packageLock)) {
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

export function getLockfileSubDependencyNames(depName: string, packageLock: PackageLockLike): string[] {
  return isPackageLockV3(packageLock) ? getV3SubDepPaths(depName, packageLock) : getV2SubDepNames(depName, packageLock);
}

export function normalizeLockDepName(depName: string): string {
  return depName.startsWith('node_modules/') ? depName.replace(/^node_modules\//, '') : depName;
}

function isPackageLockLike(value: unknown): value is PackageLockLike {
  if (!isRecord(value)) return false;
  if (typeof value.lockfileVersion !== 'number') return false;
  if (value.lockfileVersion >= 3) return isRecord(value.packages);
  return isRecord(value.dependencies);
}

function getV2SubDepNames(name: string, packageLock: PackageLockLikeV2): string[] {
  const node = packageLock.dependencies?.[name];
  if (!node) return [];
  return Object.keys(node.requires || node.dependencies || {});
}

function getV3SubDepPaths(depName: string, packageLock: PackageLockLikeV3): string[] {
  const preparedName = depName.startsWith('node_modules/') ? depName : `node_modules/${depName}`;
  const node = packageLock.packages?.[preparedName];
  if (!node?.dependencies) return [];

  const result: string[] = [];
  for (const subDep of Object.keys(node.dependencies)) {
    const nestedPath = `${preparedName}/node_modules/${subDep}`;
    if (nestedPath in packageLock.packages) {
      result.push(nestedPath);
      continue;
    }

    const flatPath = `node_modules/${subDep}`;
    if (flatPath in packageLock.packages) result.push(flatPath);
  }

  return result;
}
