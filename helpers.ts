import { exec, ExecException, ExecOptions } from 'child_process';
import * as cabinet from 'filing-cabinet';
import * as fss from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
// @ts-ignore
import * as precinct from 'precinct';
import { PackageLockLike } from './types';

export type TsConfigLike = {
  compilerOptions?: {
    outDir?: string;
    baseUrl?: string;
  };
};
export async function findOutDir(workDir: string, configName: string) {
  const list = await fs.readdir(workDir);
  if (!list.includes(configName)) {
    throw new Error(`tsconfig.json not found in ${workDir} directory. Use --tsconfig for custom config name `);
  }
  let tsConfig: TsConfigLike;
  try {
    tsConfig = await import(path.resolve(workDir, configName));
  } catch (e) {
    console.error('Parse tsconfig error:', e);
    return null;
  }

  if (tsConfig?.compilerOptions?.outDir) {
    const outDir = path.resolve(workDir, tsConfig.compilerOptions?.outDir);
    // if (tsConfig?.compilerOptions?.baseUrl) {
    //   const b = path.resolve(workDir, tsConfig?.compilerOptions?.baseUrl);
    //   const c = path.normalize(path.relative(b, workDir));
    //   outDir = path.resolve(workDir, tsConfig.compilerOptions?.outDir, c);
    // }

    try {
      await fs.access(outDir);
      return outDir;
    } catch (err: any) {
      return null;
    }
  }
  return null;
}
export async function findOutDirEntry(workDir: string, configName: string) {
  const list = await fs.readdir(workDir);
  if (!list.includes(configName)) {
    throw new Error(`tsconfig.json not found in ${workDir} directory. Use --tsconfig for custom config name `);
  }
  let tsConfig: TsConfigLike;
  try {
    tsConfig = await import(path.resolve(workDir, configName));
  } catch (e) {
    console.error('Parse tsconfig error:', e);
    throw e;
  }

  if (tsConfig?.compilerOptions?.outDir) {
    let outDir = path.resolve(workDir, tsConfig.compilerOptions?.outDir);
    if (tsConfig?.compilerOptions?.baseUrl) {
      const b = path.resolve(workDir, tsConfig?.compilerOptions?.baseUrl);
      const c = path.normalize(path.relative(b, workDir));
      outDir = path.resolve(workDir, tsConfig.compilerOptions?.outDir, c);
    }

    await fs.access(outDir);
    return outDir;
  }
  return path.resolve(workDir);
}

export async function parsePackageLock(dir: string) {
  const packageLockFile = path.join(dir, 'package-lock.json');
  let packageLock;

  try {
    packageLock = await import(packageLockFile);
    console.log(`Using package-lock ${packageLockFile}`);
    return packageLock;
  } catch {
    console.error(`package-lock.json not found in ${dir}`);
    process.exit(1);
  }
}

export async function execCmd(
  command: string,
  options?: {
    encoding: BufferEncoding;
  } & ExecOptions,
) {
  return new Promise<void>((resolve, reject) => {
    const callback = (error: ExecException | null, stdout: string, stderr: string) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    if (options) {
      exec(command, options, callback);
    } else {
      exec(command, callback);
    }
  });
}
export function parseDepName(dep: string) {
  const [namespace, name] = dep.split('/');

  return {
    namespace: name ? namespace : null,
    name: name ? name : namespace,
  };
}

function extractFileDeps(file: string, baseDir: string) {
  const resolved: string[] = [];
  const notFound: string[] = [];
  let dependencies: string[];

  try {
    dependencies = precinct.paperwork(file, {
      type: 'commonjs',
      includeCore: false,
    });
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

        ast: precinct.ast,
      });
    } catch {
      // Do nothing
    }

    if (result && fss.existsSync(result)) {
      resolved.push(result);
    } else {
      console.log({
        partial: dep,
        filename: file,
        directory: baseDir,

        result,
      });
      console.warn(`Could not resolve ${dep} in ${file}`);
      notFound.push(dep);
    }
  }

  return { resolved, notFound };
}
function count(array: any, predicate: { (part: any): boolean; (arg0: any): any }) {
  let ret = 0;

  for (const item of array) {
    if (predicate(item)) {
      ret += 1;
    }
  }

  return ret;
}
function extractDepName(parts: { [x: string]: any }, nodeModulesIdx: number) {
  let depName = parts[nodeModulesIdx + 1];

  if (!depName) {
    throw new Error('Some shit happened');
  }

  if (depName.startsWith('@')) {
    depName += `/${parts[nodeModulesIdx + 2]}`;
  }

  return depName;
}
function collectPeerDeps(firstOrderDeps: Set<string>, cwd: string) {
  const ret = new Set<string>();

  for (const dep of firstOrderDeps) {
    const packageJsonFile = path.join(cwd, 'node_modules', dep, 'package.json');
    let packageJson;
    try {
      packageJson = require(packageJsonFile) || {};
    } catch {
      throw new Error(`Error reading package.json of first order dep ${dep}`);
    }
    Object.keys(packageJson.peerDependencies || {}).forEach(ret.add);
  }

  return ret;
}
function collectFirstOrderDeps(data: { entrypoint: string; baseDir: string; cwd: string }) {
  const { cwd, baseDir, entrypoint } = data;
  const ret = new Set<string>();
  const visited = new Set();
  const nonExistent = new Set();

  function visitFile(file: string) {
    const { resolved, notFound } = extractFileDeps(file, baseDir);

    for (const dep of notFound) {
      nonExistent.add(dep);
    }

    for (const dep of resolved) {
      if (visited.has(dep)) {
        continue;
      }

      visited.add(dep);

      const parts = dep.split('/');
      const nodeModulesIdx = parts.indexOf('node_modules');
      const isExternal = nodeModulesIdx !== -1;

      if (isExternal) {
        const depth = count(parts, part => part === 'node_modules');

        if (depth === 1) {
          const depName = extractDepName(parts, nodeModulesIdx);

          ret.add(depName);
        }
      } else {
        visitFile(dep);
      }
    }
  }

  visitFile(entrypoint);

  const peerDeps = collectPeerDeps(ret, cwd);

  for (const peerDep of peerDeps) {
    ret.add(peerDep);
  }

  return { resolved: ret, nonExistent };
}
export function collectDeps(data: {
  entrypoint: string;
  baseDir: string;
  packageLock: PackageLockLike;
  cwd: string;
  options: { verbose: boolean };
}) {
  const { cwd, packageLock, options, baseDir, entrypoint } = data;
  const { resolved: firstOrderDeps, nonExistent } = collectFirstOrderDeps({
    entrypoint,
    baseDir,
    cwd,
  });

  if (nonExistent.size > 0) {
    throw new Error(`Failed to resolve dependencies:\n${Array.from(nonExistent).join('\n')}`);
  }

  const higherOrderDeps = collectHigherOrderDeps(firstOrderDeps, packageLock, cwd, options);

  console.log(`Found ${firstOrderDeps.size} first order deps and ${higherOrderDeps.length} higher order deps`);

  return {
    firstOrderDeps: Array.from(firstOrderDeps) as string[],
    higherOrderDeps: higherOrderDeps as string[],
  };
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

  if (firstOrderDeps.size > 0 && !packageLock.dependencies) {
    throw new Error('collectHigherOrderDeps(): No dependencies field in package-lock root');
  }

  const ret = new Set();
  const visitedNodes = new Set();
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
          const parentDeps = parent.dependencies || {};

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

      if (nodeWithDep === packageLock && !firstOrderDeps.has(require)) {
        if (verbose) {
          console.log(`Found higher order dep ${require}`);
        }

        ret.add(require);
      }

      visitNode(nodeWithDep.dependencies[require], nextParents);
    }
  }

  for (const dep of firstOrderDeps) {
    const node = packageLock.dependencies[dep];

    if (!node) {
      throw new Error(`collectHigherOrderDeps(): Dependency description for ${dep} not found in package-lock`);
    }

    visitNode(node, [packageLock]);
  }

  return Array.from(ret);
}
