const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const expectedPackFiles = [
  'CHANGELOG.md',
  'README.md',
  'dist/package.json',
  'dist/src/Timer.js',
  'dist/src/Timer.js.map',
  'dist/src/bin/cli.js',
  'dist/src/bin/cli.js.map',
  'dist/src/copy.js',
  'dist/src/copy.js.map',
  'dist/src/dependencyGraph.js',
  'dist/src/dependencyGraph.js.map',
  'dist/src/entrypoint.js',
  'dist/src/entrypoint.js.map',
  'dist/src/helpers.js',
  'dist/src/helpers.js.map',
  'dist/src/lockfile.js',
  'dist/src/lockfile.js.map',
  'dist/src/packageJson.js',
  'dist/src/packageJson.js.map',
  'dist/src/tsconfig.js',
  'dist/src/tsconfig.js.map',
  'dist/src/types.js',
  'dist/src/types.js.map',
  'dist/src/utils.js',
  'dist/src/utils.js.map',
  'dist/src/workspaces.js',
  'dist/src/workspaces.js.map',
  'dist/types/src/Timer.d.ts',
  'dist/types/src/bin/cli.d.ts',
  'dist/types/src/copy.d.ts',
  'dist/types/src/dependencyGraph.d.ts',
  'dist/types/src/entrypoint.d.ts',
  'dist/types/src/helpers.d.ts',
  'dist/types/src/lockfile.d.ts',
  'dist/types/src/packageJson.d.ts',
  'dist/types/src/tsconfig.d.ts',
  'dist/types/src/types.d.ts',
  'dist/types/src/utils.d.ts',
  'dist/types/src/workspaces.d.ts',
  'package.json',
];

function run(command, args, options) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
  }

  return result;
}

test('published tarball installs and exposes a working CLI', { timeout: 120000 }, async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'nsc-fast-install-pack-'));
  const packDir = path.join(root, 'pack');
  const appDir = path.join(root, 'app');
  await fsp.mkdir(packDir, { recursive: true });
  await fsp.mkdir(appDir, { recursive: true });

  const packResult = run('npm', ['pack', '--json', '--pack-destination', packDir], { cwd: repoRoot });
  const [{ filename, files }] = parseNpmPackJson(packResult.stdout);
  assert.deepEqual(
    files.map(file => file.path).sort(),
    [...expectedPackFiles].sort(),
  );

  const tarball = path.join(packDir, filename);

  run('npm', ['init', '-y'], { cwd: appDir });
  run('npm', ['install', tarball, '--omit=dev'], { cwd: appDir });

  const packageDir = path.join(appDir, 'node_modules', '@lad-tech', 'nsc-fast-install');
  assert.equal(fs.existsSync(path.join(packageDir, 'README.md')), true);
  assert.equal(fs.existsSync(path.join(packageDir, 'dist', 'package.json')), true);
  assert.equal(fs.existsSync(path.join(packageDir, 'dist', 'src', 'bin', 'cli.js')), true);
  assert.equal(fs.existsSync(path.join(packageDir, 'dist', 'types', 'src', 'helpers.d.ts')), true);

  const bin = path.join(appDir, 'node_modules', '.bin', process.platform === 'win32' ? 'nsc-fast-install.cmd' : 'nsc-fast-install');
  const versionResult = run(bin, ['--version'], { cwd: appDir });
  assert.match(versionResult.stdout.trim(), /^\d+\.\d+\.\d+$/);
});

function parseNpmPackJson(stdout) {
  const match = stdout.match(/(\[\s*\{[\s\S]*\}\s*\])\s*$/);
  if (!match) throw new Error(`npm pack did not print JSON:\n${stdout}`);
  return JSON.parse(match[1]);
}
