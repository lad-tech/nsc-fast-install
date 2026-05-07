import * as fs from 'fs/promises';
import { createRequire } from 'module';
import * as path from 'path';
import { parse as parseJsonc, ParseError, printParseErrorCode } from 'jsonc-parser';

import { TsCompilerOptionsLike, TsConfigLike } from './types';
import { isRecord, pathExists } from './utils';

export interface ParseTsConfigParams {
  workDir: string;
  configName: string;
}

type TsConfigFile = {
  readonly extends?: string | string[];
  readonly compilerOptions?: TsCompilerOptionsLike;
};

export async function parseTsConfig(data: ParseTsConfigParams): Promise<TsConfigLike> {
  const { workDir, configName } = data;
  const configPath = path.resolve(workDir, configName);

  try {
    await fs.access(configPath);
  } catch {
    throw new Error(`${configName} not found in ${workDir} directory. Use --tsconfig for custom config name`);
  }

  return readTsConfig(configPath, new Set());
}

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

async function readTsConfig(configPath: string, visited: Set<string>): Promise<TsConfigLike> {
  const resolvedConfigPath = path.resolve(configPath);
  if (visited.has(resolvedConfigPath)) {
    throw new Error(`Circular tsconfig extends detected at ${resolvedConfigPath}`);
  }

  visited.add(resolvedConfigPath);
  const rawConfig = normalizeTsConfigPathOptions(await readJsoncConfig(resolvedConfigPath), path.dirname(resolvedConfigPath));
  const extendsList = toExtendsList(rawConfig.extends);
  let mergedConfig: TsConfigFile = {};

  for (const extendsPath of extendsList) {
    const baseConfigPath = await resolveTsConfigExtends(resolvedConfigPath, extendsPath);
    mergedConfig = mergeTsConfigs(mergedConfig, await readTsConfig(baseConfigPath, visited));
  }

  visited.delete(resolvedConfigPath);
  return {
    ...mergeTsConfigs(mergedConfig, rawConfig),
    configPath: resolvedConfigPath,
  };
}

async function readJsoncConfig(configPath: string): Promise<TsConfigFile> {
  const errors: ParseError[] = [];
  const content = await fs.readFile(configPath, 'utf8');
  const parsed = parseJsonc(content, errors, { allowTrailingComma: true }) as unknown;

  if (errors.length > 0) {
    const message = errors.map(error => `${printParseErrorCode(error.error)} at offset ${error.offset}`).join(', ');
    throw new Error(`tsconfig.json parsing error in ${configPath}: ${message}`);
  }

  if (!isRecord(parsed)) throw new Error(`tsconfig.json parsing error in ${configPath}: expected object`);
  return parsed as TsConfigFile;
}

function normalizeTsConfigPathOptions(config: TsConfigFile, configDir: string): TsConfigFile {
  if (!config.compilerOptions) return config;

  const compilerOptions: { -readonly [K in keyof TsCompilerOptionsLike]?: TsCompilerOptionsLike[K] } = {
    ...config.compilerOptions,
  };
  for (const key of ['baseUrl', 'outDir', 'rootDir'] as const) {
    const value = compilerOptions[key];
    if (typeof value === 'string') {
      compilerOptions[key] = path.resolve(configDir, value);
    }
  }

  return {
    ...config,
    compilerOptions,
  };
}

function mergeTsConfigs(base: TsConfigFile, override: TsConfigFile): TsConfigFile {
  return {
    ...base,
    ...override,
    compilerOptions: {
      ...(base.compilerOptions || {}),
      ...(override.compilerOptions || {}),
    },
  };
}

function toExtendsList(extendsValue: string | string[] | undefined): string[] {
  if (!extendsValue) return [];
  return Array.isArray(extendsValue) ? extendsValue : [extendsValue];
}

async function resolveTsConfigExtends(configPath: string, extendsPath: string): Promise<string> {
  if (extendsPath.startsWith('.') || extendsPath.startsWith('/') || extendsPath.startsWith('..')) {
    return resolveTsConfigPathCandidate(path.dirname(configPath), extendsPath);
  }

  const requireFromConfig = createRequire(configPath);
  for (const candidate of getTsConfigExtendsCandidates(extendsPath)) {
    try {
      return requireFromConfig.resolve(candidate);
    } catch {
      continue;
    }
  }

  throw new Error(`Cannot resolve tsconfig extends "${extendsPath}" from ${configPath}`);
}

async function resolveTsConfigPathCandidate(configDir: string, extendsPath: string): Promise<string> {
  for (const candidate of getTsConfigExtendsCandidates(path.resolve(configDir, extendsPath))) {
    if (await pathExists(candidate)) return candidate;
  }

  throw new Error(`Cannot resolve tsconfig extends "${extendsPath}" from ${configDir}`);
}

function getTsConfigExtendsCandidates(value: string): string[] {
  if (path.extname(value)) return [value];
  return [value, `${value}.json`, path.join(value, 'tsconfig.json')];
}
