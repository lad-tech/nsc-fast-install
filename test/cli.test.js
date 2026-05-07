const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const cliPath = path.join(repoRoot, 'dist', 'src', 'bin', 'cli.js');

async function makeTempProject(options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nsc-fast-install-cli-'));
  const serviceDir = path.join(root, 'services', 'MailService');
  await fs.mkdir(path.join(serviceDir, 'dist'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture' }));
  await fs.writeFile(path.join(root, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: { '': {} } }));
  await fs.writeFile(path.join(serviceDir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { outDir: 'dist' } }));
  if (options.compiledEntry) {
    await fs.writeFile(path.join(serviceDir, 'dist', 'start.js'), '"use strict";\n');
  }
  return { root, serviceDir };
}

test('CLI returns non-zero when compiled entrypoint is missing', async () => {
  const { root } = await makeTempProject();
  const result = spawnSync(process.execPath, [cliPath, '--entryPoint', 'services/MailService/start.ts', '--dryRun'], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Compiled entrypoint not found/);
  assert.doesNotMatch(result.stderr, /^\s+at /m);
});

test('CLI does not exclude every service when --exclude is empty', async () => {
  const { root } = await makeTempProject();
  const result = spawnSync(
    process.execPath,
    [cliPath, '--entryPoint', 'services/MailService/start.ts', '--exclude', '', '--dryRun'],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );

  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stderr + result.stdout, /исключён через --exclude/);
});

test('CLI prints machine-readable dry-run JSON', async () => {
  const { root, serviceDir } = await makeTempProject({ compiledEntry: true });
  const result = spawnSync(process.execPath, [cliPath, '--entryPoint', 'services/MailService/start.ts', '--json'], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');

  const payload = JSON.parse(result.stdout);
  const realServiceDir = await fs.realpath(serviceDir);
  assert.equal(payload.entrypoint, path.join(realServiceDir, 'dist', 'start.js'));
  assert.equal(payload.targetNodeModules, path.join(realServiceDir, 'dist', 'node_modules'));
  assert.deepEqual(payload.deps, []);
  assert.deepEqual(payload.missing, []);
});

test('CLI keeps --output semantics as a parent directory for node_modules', async () => {
  const { root, serviceDir } = await makeTempProject({ compiledEntry: true });
  const result = spawnSync(
    process.execPath,
    [cliPath, '--entryPoint', 'services/MailService/start.ts', '--output', 'runtime', '--json'],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );

  assert.equal(result.status, 0);

  const payload = JSON.parse(result.stdout);
  const realServiceDir = await fs.realpath(serviceDir);
  assert.equal(payload.targetNodeModules, path.join(realServiceDir, 'runtime', 'node_modules'));
});

test('CLI supports --nodeModulesOutput as a direct node_modules path', async () => {
  const { root, serviceDir } = await makeTempProject({ compiledEntry: true });
  const result = spawnSync(
    process.execPath,
    [cliPath, '--entryPoint', 'services/MailService/start.ts', '--nodeModulesOutput', 'runtime-node-modules', '--json'],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );

  assert.equal(result.status, 0);

  const payload = JSON.parse(result.stdout);
  const realServiceDir = await fs.realpath(serviceDir);
  assert.equal(payload.targetNodeModules, path.join(realServiceDir, 'runtime-node-modules'));
});

test('CLI rejects --output and --nodeModulesOutput together', async () => {
  const { root } = await makeTempProject({ compiledEntry: true });
  const result = spawnSync(
    process.execPath,
    [
      cliPath,
      '--entryPoint',
      'services/MailService/start.ts',
      '--output',
      'runtime',
      '--nodeModulesOutput',
      'runtime-node-modules',
      '--json',
    ],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Use either --output or --nodeModulesOutput/);
  assert.doesNotMatch(result.stderr, /^\s+at /m);
});
