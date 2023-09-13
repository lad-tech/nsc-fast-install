#! /usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import {
  collectDeps,
  execCmd,
  findOutDirEntry,
  findServiceEntry,
  getOutDir,
  parseDepName,
  parsePackageLock,
  parseTsConfig,
} from '../helpers';
import { Timer } from '../Timer';
import { PackageJsonLike } from '../types';

const MAX_SHELL_COMMAND_LENGTH = 100000;
async function main() {
  try {
    const program = new Command();
    program
      .description('Быстрая установка зависимостей для сборки сервисов в моно репозиториях')
      .option('--entryPoint  <string>', 'Путь от корня проекта (services/ExampleService/index.ts)')
      .option('--service  <string>', 'Путь от корня проекта до сервиса (services/ExampleService)')
      .option('--verbose <boolean>', 'Расширенные логи')
      .option('--exclude <string>', 'Папки, которые нужно исключить через ","', 'frontend')
      .option('--tsconfig <string>', 'Название конфига для сборки');

    program.parse();

    const options = program.opts();
    if (!options.entryPoint && !options.service) {
      throw ' Use --entryPoint or --service for fast deps install';
    }
    const excludeDirs: string[] = options.exclude ? options.exclude.split(',') : [];

    const verbose = options.verbose || false;
    const configName = options.tsconfig || 'tsconfig.json';
    let workDir = '';
    if (options.entryPoint) {
      workDir = path.dirname(path.resolve(options.entryPoint));
    } else {
      workDir = path.resolve(options.service);
    }
    const cwd = process.cwd();
    if (verbose) {
      console.log('cwd', cwd, 'workDir', workDir);
    }
    excludeDirs.forEach(dir => {
      if (workDir.match(dir)) {
        console.warn(`${dir} exclude. Finish`);
        process.exit(0);
      }
    });
    if (!options.entryPoint) {
      options.entryPoint = await findServiceEntry({
        verbose,
        workDir,
      });
    }

    const prepareTimer = new Timer('Prepare');
    const scanTimer = new Timer('Scan');
    const copyTimer = new Timer('Copy');
    const totalTimer = new Timer('TOTAL');

    totalTimer.start();
    prepareTimer.start();

    process.chdir(workDir);

    const tsConfig = await parseTsConfig({
      workDir,
      configName,
    });

    const outDir = await getOutDir({ workDir, tsConfig });
    if (!outDir) {
      throw 'Dist dir not found. Did you forget to build?';
    }

    const preparedEntry = await findOutDirEntry({ workDir, tsConfig, entryPoint: options.entryPoint, verbose });

    console.log(`Building node_modules in ${outDir}`);
    if (verbose) {
      console.log({ cwd, workDir, outDir, preparedEntry });
    }

    const packageLock = await parsePackageLock(cwd);
    const globalNodeModulesDir = path.join(cwd, 'node_modules');
    const localNodeModulesDir = path.join(outDir, 'node_modules');

    await execCmd(`rm -rf ${localNodeModulesDir}`);
    prepareTimer.end();
    scanTimer.start();
    const { firstOrderDeps, higherOrderDeps, optionalPeerDeps } = collectDeps({
      entrypoint: preparedEntry,
      baseDir: outDir,
      packageLock,
      cwd,
      options: {
        verbose,
      },
    });
    const packageJsonFile = path.join(cwd, 'package.json');
    let packageJson: PackageJsonLike;

    scanTimer.end();
    try {
      packageJson = require(packageJsonFile);
    } catch {
      console.error(`Error loading package.json in ${cwd}`);
      process.exit(1);
    }
    const packageJsonDeps = packageJson.dependencies || {};
    const missingDeps: string[] = [];

    for (const dep of firstOrderDeps) {
      if (!packageJsonDeps[dep]) {
        missingDeps.push(dep);
      }
    }

    if (missingDeps.length > 0) {
      console.error('The following deps are missing in package.json:');
      console.error(missingDeps.join('\n'));
      process.exit(1);
    }

    const missingOptionalDeps = optionalPeerDeps.filter(depName => !packageJsonDeps[depName]);
    if (missingOptionalDeps.length) {
      console.warn('The following peer deps are missing in package.json:');
      console.error(missingOptionalDeps.join('\n'));
    }
    const depsToCopy: string[] = [
      ...firstOrderDeps,
      ...higherOrderDeps,
      ...optionalPeerDeps.filter(depName => !missingOptionalDeps.includes(depName)),
    ];

    if (depsToCopy.length > 0) {
      copyTimer.start();
      await fs.promises.mkdir(localNodeModulesDir);

      const namespaceDirs = new Set<string>();

      for (const dep of depsToCopy) {
        const { namespace } = parseDepName(dep);

        if (namespace) {
          namespaceDirs.add(namespace);
        }
      }

      if (namespaceDirs.size > 0) {
        await Promise.all(
          Array.from(namespaceDirs).map(namespaceDir =>
            fs.promises.mkdir(path.join(localNodeModulesDir, namespaceDir)),
          ),
        );
      }

      console.log(`Copying ${depsToCopy.length} deps to ${localNodeModulesDir}`);

      let currentCommand: any[] = [];
      let currentCommandLength = 0;
      const copyCommands: string[][] = [currentCommand];

      for (const dep of depsToCopy) {
        const { namespace } = parseDepName(dep);
        const source = path.join(globalNodeModulesDir, dep);
        const dest = namespace ? path.join(localNodeModulesDir, namespace) : localNodeModulesDir;
        const command = `cp -RL ${source} ${dest}`;

        if (currentCommandLength + command.length + 4 > MAX_SHELL_COMMAND_LENGTH) {
          currentCommand = [];
          currentCommandLength = 0;
          copyCommands.push(currentCommand);
        }

        currentCommand.push(command);
        currentCommandLength += command.length + 4;
      }

      for (const commandsGroup of copyCommands) {
        await execCmd(commandsGroup.join(' && '));
      }

      copyTimer.end();
    }

    totalTimer.end();

    prepareTimer.print();
    scanTimer.print();
    copyTimer.print();
    totalTimer.print();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main().catch(console.error);
