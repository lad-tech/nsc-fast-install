import * as fss from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';

import { readPackageJson } from './packageJson';
import { TsConfigLike } from './types';
import { pathExists } from './utils';

export type EntryStrategy = 'runtime' | 'main';

const DEFAULT_ENTRY_POINTS = ['start.ts', 'service.ts', 'index.ts'];

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

  if (resolvedEntry.endsWith('.js') && (await pathExists(resolvedEntry))) {
    return resolvedEntry;
  }

  await fs.access(outDir);
  const candidates = getOutDirEntryCandidates({ workDir, tsConfig, outDir, resolvedEntry });

  for (const candidate of candidates) {
    if (verbose) console.log(`[findOutDirEntry] checking ${candidate.file} (${candidate.reason})`);
    if (await pathExists(candidate.file)) return candidate.file;
  }

  const tried = candidates.map(candidate => `- ${candidate.file} (${candidate.reason})`).join('\n');
  throw new Error(`Compiled entrypoint not found for ${resolvedEntry}. Tried:\n${tried}`);
}

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

type EntryCandidate = {
  readonly file: string;
  readonly reason: string;
};

function resolveEntryPointPath(workDir: string, entryPoint: string): string {
  if (path.isAbsolute(entryPoint)) return entryPoint;

  const entryFromCwd = path.resolve(process.cwd(), entryPoint);
  if (fss.existsSync(entryFromCwd)) return entryFromCwd;

  return path.resolve(workDir, entryPoint);
}

function getOutDirEntryCandidates(data: {
  workDir: string;
  tsConfig: TsConfigLike;
  outDir: string;
  resolvedEntry: string;
}): EntryCandidate[] {
  const { workDir, tsConfig, outDir, resolvedEntry } = data;
  const bases: EntryCandidate[] = [];

  addEntryBase(bases, tsConfig.compilerOptions?.rootDir, 'rootDir');
  addEntryBase(bases, workDir, 'service directory');
  // baseUrl is not an emit root, but old service builds in this repo rely on it as the common source directory.
  addEntryBase(bases, tsConfig.compilerOptions?.baseUrl, 'baseUrl compatibility fallback');

  return bases.map(base => ({
    file: mapSourceEntryToOutDir({ sourceBase: base.file, outDir, resolvedEntry }),
    reason: base.reason,
  }));
}

function addEntryBase(target: EntryCandidate[], sourceBase: string | undefined, reason: string): void {
  if (!sourceBase) return;

  const resolvedSourceBase = path.resolve(sourceBase);
  if (target.some(candidate => candidate.file === resolvedSourceBase)) return;
  target.push({ file: resolvedSourceBase, reason });
}

function mapSourceEntryToOutDir(data: { sourceBase: string; outDir: string; resolvedEntry: string }): string {
  const { sourceBase, outDir, resolvedEntry } = data;
  const relativeEntry = path.relative(sourceBase, resolvedEntry);
  const relativeOutEntry =
    relativeEntry.startsWith('..') || path.isAbsolute(relativeEntry) ? path.basename(resolvedEntry) : relativeEntry;

  return path.resolve(outDir, relativeOutEntry.replace(/\.[cm]?tsx?$/, '.js'));
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
