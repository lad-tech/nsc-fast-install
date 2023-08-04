import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { collectDeps, execCmd, findOutDir, findOutDirEntry, parseDepName, parsePackageLock } from '../helpers';
import { Timer } from '../Timer';

const MAX_SHELL_COMMAND_LENGTH = 100000;
async function main() {
  try {
    const program = new Command();
    program
      .description('Быстрая установка зависимостей для сборки сервисов в моно репозиториях')
      .requiredOption('--entryPoint  <path>', 'Название стартового файла (index.ts)')
      .option('--verbose <boolean>', 'Расширенные логи')
      .option('--tsconfig <string>', 'Название конфига для сборки');


    program.parse();

    const options = program.opts();
    const verbose = options.verbose || false;
    const tsconfig = options.tsconfig || 'tsconfig.json';
    const workDir = path.dirname(path.resolve(options.entryPoint));
    const cwd = process.cwd();

    const prepareTimer = new Timer('Prepare');
    const scanTimer = new Timer('Scan');
    const copyTimer = new Timer('Copy');

    const totalTimer = new Timer('TOTAL');
    totalTimer.start();
    prepareTimer.start();

    process.chdir(workDir);
    const outDir = await findOutDir(workDir, tsconfig);
    if (outDir == null) {
      throw 'Dist dir not found. Did you forget to build?';
    }
    const preparedEntry = path.resolve(
      await findOutDirEntry(workDir, tsconfig),
      path.basename(options.entryPoint).replace('ts', 'js'),
    );

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
