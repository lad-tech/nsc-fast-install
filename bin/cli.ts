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

const MAX_SHELL_COMMAND_LENGTH = 100000;
async function main() {
  try {
    const program = new Command();
    program
      .description('Быстрая установка зависимостей для сборки сервисов в моно репозиториях')
      .option('--entryPoint  <path>', 'Путь от корня проекта (services/ExampleService/index.ts)')
      .option('--service  <path>', 'Путь от корня проекта до сервиса (services/ExampleService)')
      .option('--verbose <boolean>', 'Расширенные логи')
      .option('--tsconfig <string>', 'Название конфига для сборки');

    program.parse();

    const options = program.opts();
    if (!options.entryPoint && !options.service) {
      throw ' Use --entryPoint or --service for fast deps install';
    }

    const verbose = options.verbose || false;
    const configName = options.tsconfig || 'tsconfig.json';
    const workDir = path.resolve(options.entryPoint || options.service);
    const cwd = process.cwd();
    console.log('cwd', cwd, options.service);
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

    const preparedEntry = await findOutDirEntry({ workDir, tsConfig, entryPoint: options.entryPoint });

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
    const { firstOrderDeps, higherOrderDeps } = collectDeps({
      entrypoint: preparedEntry,
      baseDir: outDir,
      packageLock,
      cwd,
      options: {
        verbose,
      },
    });
    const packageJsonFile = path.join(cwd, 'package.json');
    let packageJson;

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
    const depsToCopy: string[] = [...firstOrderDeps, ...higherOrderDeps];

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
