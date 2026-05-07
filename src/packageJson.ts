import * as path from 'path';

import { PackageJsonLike } from './types';
import { readJsonObject } from './utils';

export async function readPackageJson(dir: string): Promise<PackageJsonLike> {
  return (await readJsonObject(path.join(dir, 'package.json'))) as PackageJsonLike;
}

export function getPackageDependencyNames(pkg: PackageJsonLike): string[] {
  return Object.keys({
    ...(pkg.dependencies || {}),
    ...(pkg.optionalDependencies || {}),
  });
}
