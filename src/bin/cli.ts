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

async function main() {
  const { version } = await import('../../package.json');

  const program = new Command();
  program
    .description('Быстрая установка зависимостей для сборки сервисов в моно-репозитории')
    .version(version)
    .option('--entryPoint <string>', 'Точка входа (например, services/AuthService/start.ts)')
    .option('--service <string>', 'Папка сервиса (например, services/AuthService)')
    .option('--output <string>', 'Папка для node_modules (по умолчанию — dist)', '')
    .option('--verbose', 'Вывод логов', false)
    .option('--dryRun', 'Не выполнять копирование, только лог', false)
    .option('--exclude <string>', 'Папки для исключения (через запятую)', 'frontend')
    .option('--tsconfig <string>', 'Название tsconfig файла', 'tsconfig.json')
    .option('--entryStrategy <runtime|main>', 'Стратегия выбора entrypoint для --service', 'runtime')
    .showHelpAfterError();

  program.parse();
  const options = program.opts();

  if (!options.entryPoint && !options.service) {
    throw new Error('Укажите --entryPoint или --service');
  }

  const excludeDirs: string[] = options.exclude.split(',');
  const cwd = process.cwd();
  const workDir = path.resolve(options.entryPoint ? path.dirname(options.entryPoint) : options.service);

  if (excludeDirs.some(dir => workDir.includes(dir))) {
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

  const preparedEntry = await findOutDirEntry({ workDir, tsConfig, entryPoint, verbose: options.verbose });
  const targetNodeModules = path.resolve(options.output || outDir, 'node_modules');

  if (options.verbose) {
    console.log({ cwd, workDir, outDir, preparedEntry, targetNodeModules });
  }

  if (!options.dryRun) {
    await fs.rm(targetNodeModules, { recursive: true, force: true }).catch(err => {
      if (options.verbose) console.warn(`Ошибка удаления ${targetNodeModules}:`, err.message);
    });
  }

  prepareTimer.end();
  scanTimer.start();

  const packageLock = await parsePackageLock(cwd);
  const workspaceInfo = await collectWorkspaceInfo(cwd);
  const deps = collectDeps({
    entrypoint: preparedEntry,
    baseDir: outDir,
    packageLock,
    cwd,
    options: { verbose: options.verbose },
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

  const missing = deps.firstOrderDeps.filter(dep => !declaredDeps.has(dep));
  if (missing.length > 0) {
    console.error('Отсутствующие зависимости в package.json:');
    console.error(missing.join('\n'));
    process.exit(1);
  }

  scanTimer.end();

  const initialDepsToCopy = [
    ...deps.firstOrderDeps,
    ...deps.higherOrderDeps,
    ...deps.optionalPeerDeps.filter(p => declaredDeps.has(p)),
  ];
  const depsToCopy = expandDependenciesToCopy({
    deps: initialDepsToCopy,
    packageLock,
    workspaceInfo,
    options: { verbose: options.verbose },
  });

  if (depsToCopy.length > 0) {
    copyTimer.start();
    console.log(
      options.dryRun
        ? `Будет скопировано ${depsToCopy.length} зависимостей → ${targetNodeModules}`
        : `Копирование ${depsToCopy.length} зависимостей → ${targetNodeModules}`,
    );

    if (options.dryRun) {
      console.log(depsToCopy.join('\n'));
    } else {
      await copyDependencies({
        deps: depsToCopy,
        cwd,
        targetNodeModules,
        workspaceInfo,
        options: { verbose: options.verbose },
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
  console.error(err);
  process.exit(1);
});
