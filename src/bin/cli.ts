#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  collectDeps,
  collectDeclaredDependencyNames,
  collectWorkspaceInfo,
  copyDependencies,
  expandDependenciesToCopy,
  findOutDirEntry,
  findServiceEntry,
  getOutDir,
  parsePackageLock,
  parseTsConfig,
  readPackageJson,
} from '../helpers';
import { Timer } from '../Timer';
import { PackageJsonLike } from '../types';

type CliOptions = {
  entryPoint?: string;
  service?: string;
  output: string;
  nodeModulesOutput?: string;
  verbose: boolean;
  dryRun: boolean;
  json: boolean;
  exclude: string;
  tsconfig: string;
  entryStrategy: 'runtime' | 'main';
};

async function main() {
  const { version } = await import('../../package.json');

  const program = new Command();
  program
    .description('Быстрая установка зависимостей для сборки сервисов в моно-репозитории')
    .version(version)
    .option('--entryPoint <string>', 'Точка входа (например, services/AuthService/start.ts)')
    .option('--service <string>', 'Папка сервиса (например, services/AuthService)')
    .option('--output <string>', 'Папка, внутри которой будет создан node_modules (по умолчанию — outDir)', '')
    .option('--nodeModulesOutput <string>', 'Прямой путь к целевому node_modules')
    .option('--verbose', 'Вывод логов', false)
    .option('--dryRun', 'Не выполнять копирование, только лог', false)
    .option('--json', 'Machine-readable dry-run output (implies --dryRun)', false)
    .option('--exclude <string>', 'Папки для исключения (через запятую)', 'frontend')
    .option('--tsconfig <string>', 'Название tsconfig файла', 'tsconfig.json')
    .option('--entryStrategy <runtime|main>', 'Стратегия выбора entrypoint для --service', 'runtime')
    .showHelpAfterError();

  program.parse();
  const options = program.opts<CliOptions>();

  if (!options.entryPoint && !options.service) {
    throw new Error('Укажите --entryPoint или --service');
  }

  const excludeDirs = parseCommaSeparatedList(options.exclude);
  const dryRun = options.dryRun || options.json;
  const collectOptions = { verbose: options.verbose && !options.json };
  const cwd = process.cwd();
  const workDirInput = options.entryPoint ? path.dirname(options.entryPoint) : options.service;
  if (!workDirInput) throw new Error('Укажите --entryPoint или --service');
  const workDir = path.resolve(workDirInput);

  if (isExcludedWorkDir({ cwd, workDir, excludeDirs })) {
    console.warn(`Каталог ${workDir} исключён через --exclude`);
    process.exit(0);
  }

  const entryPoint = options.entryPoint
    ? path.resolve(cwd, options.entryPoint)
    : await findServiceEntry({ workDir, verbose: options.verbose, strategy: options.entryStrategy });
  process.chdir(workDir);

  const totalTimer = new Timer('TOTAL');
  const prepareTimer = new Timer('Prepare');
  const scanTimer = new Timer('Scan');
  const copyTimer = new Timer('Copy');

  totalTimer.start();
  prepareTimer.start();

  const tsConfig = await parseTsConfig({ workDir, configName: options.tsconfig });
  const outDir = await getOutDir({ workDir, tsConfig });

  const preparedEntry = await findOutDirEntry({ workDir, tsConfig, entryPoint, verbose: collectOptions.verbose });
  const targetNodeModules = resolveTargetNodeModules({
    output: options.output,
    nodeModulesOutput: options.nodeModulesOutput,
    outDir,
  });

  if (collectOptions.verbose) {
    console.log({ cwd, workDir, outDir, preparedEntry, targetNodeModules });
  }

  if (!dryRun) {
    await fs.rm(targetNodeModules, { recursive: true, force: true }).catch(err => {
      if (collectOptions.verbose) console.warn(`Ошибка удаления ${targetNodeModules}:`, err.message);
    });
  }

  prepareTimer.end();
  scanTimer.start();
  //
  const packageLock = await parsePackageLock(cwd);
  if (collectOptions.verbose) console.log(`Using package-lock ${path.join(cwd, 'package-lock.json')}`);
  const workspaceInfo = await collectWorkspaceInfo(cwd);
  const deps = collectDeps({
    entrypoint: preparedEntry,
    baseDir: outDir,
    packageLock,
    cwd,
    options: collectOptions,
  });

  const pkg = await readPackageJson(cwd);
  let targetPkg: PackageJsonLike | undefined;
  try {
    targetPkg = await readPackageJson(workDir);
  } catch {
    targetPkg = undefined;
  }

  const declaredDeps = collectDeclaredDependencyNames({
    rootPackage: pkg,
    targetPackage: targetPkg,
    workspaceInfo,
    firstOrderDeps: deps.firstOrderDeps,
  });

  const initialDepsToCopy = [
    ...deps.firstOrderDeps,
    ...deps.higherOrderDeps,
    ...deps.optionalPeerDeps.filter(p => declaredDeps.has(p)),
  ];
  const depsToCopy = expandDependenciesToCopy({
    deps: initialDepsToCopy,
    packageLock,
    workspaceInfo,
    options: collectOptions,
  });
  const missing = deps.firstOrderDeps.filter(dep => !declaredDeps.has(dep));

  scanTimer.end();

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          entrypoint: preparedEntry,
          targetNodeModules,
          deps: depsToCopy,
          missing,
          workDir,
          outDir,
          firstOrderDeps: deps.firstOrderDeps,
          higherOrderDeps: deps.higherOrderDeps,
          optionalPeerDeps: deps.optionalPeerDeps,
        },
        null,
        2,
      ),
    );

    if (missing.length > 0) process.exitCode = 1;
    return;
  }

  if (missing.length > 0) {
    throw new Error(`Отсутствующие зависимости в package.json:\n${missing.join('\n')}`);
  }

  if (depsToCopy.length > 0) {
    copyTimer.start();
    console.log(
      dryRun
        ? `Будет скопировано ${depsToCopy.length} зависимостей → ${targetNodeModules}`
        : `Копирование ${depsToCopy.length} зависимостей → ${targetNodeModules}`,
    );

    if (dryRun) {
      console.log(depsToCopy.join('\n'));
    } else {
      await copyDependencies({
        deps: depsToCopy,
        cwd,
        targetNodeModules,
        workspaceInfo,
        options: collectOptions,
      });
    }
    copyTimer.end();
  }

  totalTimer.end();
  prepareTimer.print();
  scanTimer.print();
  copyTimer.print();
  totalTimer.print();
}

main().catch(err => {
  if (shouldPrintStack()) console.error(err);
  else console.error(formatCliError(err));
  process.exit(1);
});

function parseCommaSeparatedList(value: string): string[] {
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function isExcludedWorkDir(data: { cwd: string; workDir: string; excludeDirs: string[] }): boolean {
  const { cwd, workDir, excludeDirs } = data;
  const relativeWorkDir = path.relative(cwd, workDir);
  const pathParts = relativeWorkDir.split(path.sep).filter(Boolean);

  return excludeDirs.some(excludeDir => {
    const normalizedExclude = path.normalize(excludeDir);
    if (normalizedExclude.includes(path.sep)) {
      return relativeWorkDir === normalizedExclude || relativeWorkDir.startsWith(`${normalizedExclude}${path.sep}`);
    }

    return pathParts.includes(normalizedExclude);
  });
}

function resolveTargetNodeModules(data: {
  output: string;
  nodeModulesOutput?: string;
  outDir: string;
}): string {
  const { output, nodeModulesOutput, outDir } = data;
  if (output && nodeModulesOutput) {
    throw new Error('Use either --output or --nodeModulesOutput, not both');
  }

  if (nodeModulesOutput) return path.resolve(nodeModulesOutput);
  return path.resolve(output || outDir, 'node_modules');
}

function shouldPrintStack(): boolean {
  return process.argv.includes('--verbose') || Boolean(process.env.DEBUG);
}

function formatCliError(err: unknown): string {
  if (err instanceof Error) return `Error: ${err.message}`;
  return `Error: ${String(err)}`;
}
