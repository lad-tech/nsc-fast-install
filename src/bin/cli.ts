#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  collectDeps,
  findOutDirEntry,
  findServiceEntry,
  getOutDir,
  parseDepName,
  parsePackageLock,
  parseTsConfig,
} from '../helpers';
import { Timer } from '../Timer';
import { PackageJsonLike } from '../types';

async function main() {
  const program = new Command();
  program
    .description('Быстрая установка зависимостей для сборки сервисов в моно-репозитории')
    .option('--entryPoint <string>', 'Точка входа (например, services/AuthService/start.ts)')
    .option('--service <string>', 'Папка сервиса (например, services/AuthService)')
    .option('--output <string>', 'Папка для node_modules (по умолчанию — dist)', '')
    .option('--verbose', 'Вывод логов', false)
    .option('--dryRun', 'Не выполнять копирование, только лог', false)
    .option('--exclude <string>', 'Папки для исключения (через запятую)', 'frontend')
    .option('--tsconfig <string>', 'Название tsconfig файла', 'tsconfig.json')
    .showHelpAfterError();

  program.parse();
  const options = program.opts();

  if (!options.entryPoint && !options.service) {
    throw new Error('Укажите --entryPoint или --service');
  }

  const excludeDirs: string[] = options.exclude.split(',');
  const cwd = process.cwd();
  const workDir = path.resolve(options.entryPoint ? path.dirname(options.entryPoint) : options.service);

  if (excludeDirs.some((dir) => workDir.includes(dir))) {
    console.warn(`Каталог ${workDir} исключён через --exclude`);
    process.exit(0);
  }

  const entryPoint = options.entryPoint || (await findServiceEntry({ workDir, verbose: options.verbose }));
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
  const globalNodeModules = path.join(cwd, 'node_modules');

  if (options.verbose) {
    console.log({ cwd, workDir, outDir, preparedEntry, targetNodeModules });
  }

  await fs.rm(targetNodeModules, { recursive: true, force: true }).catch((err) => {
    if (options.verbose) console.warn(`Ошибка удаления ${targetNodeModules}:`, err.message);
  });
  await fs.mkdir(targetNodeModules, { recursive: true });

  prepareTimer.end();
  scanTimer.start();

  const packageLock = await parsePackageLock(cwd);
  const deps = collectDeps({
    entrypoint: preparedEntry,
    baseDir: outDir,
    packageLock,
    cwd,
    options: { verbose: options.verbose },
  });

  const pkgPath = path.join(cwd, 'package.json');
  const pkgRaw = await fs.readFile(pkgPath, 'utf-8');
  const pkg: PackageJsonLike = JSON.parse(pkgRaw);
  const depsInPkg = pkg.dependencies || {};

  const missing = deps.firstOrderDeps.filter((dep) => !depsInPkg[dep]);
  if (missing.length > 0) {
    console.error('Отсутствующие зависимости в package.json:');
    console.error(missing.join('\n'));
    process.exit(1);
  }

  scanTimer.end();

  const depsToCopy = [
    ...deps.firstOrderDeps,
    ...deps.higherOrderDeps,
    ...deps.optionalPeerDeps.filter((p) => depsInPkg[p]),
  ];

  if (depsToCopy.length > 0) {
    copyTimer.start();
    console.log(`Копирование ${depsToCopy.length} зависимостей → ${targetNodeModules}`);

    if (options.dryRun) {
      console.log(depsToCopy.join('\n'));
    } else {
      const namespaces = new Set(
        depsToCopy.map(parseDepName).map(({ namespace }) => namespace).filter(Boolean)
      );
      await Promise.all(
        [...namespaces].map((ns) => fs.mkdir(path.join(targetNodeModules, ns||''), { recursive: true }))
      );

      for (const dep of depsToCopy) {
        const { namespace } = parseDepName(dep);
        const src = path.join(globalNodeModules, dep);
        const dst = namespace
          ? path.join(targetNodeModules, namespace, dep.split('/')[1])
          : path.join(targetNodeModules, dep);

        await fs.cp(src, dst, { recursive: true });
      }
    }
    copyTimer.end();
  }

  totalTimer.end();
  prepareTimer.print();
  scanTimer.print();
  copyTimer.print();
  totalTimer.print();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});