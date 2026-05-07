const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { collectDeps, expandDependenciesToCopy, findOutDirEntry, parseTsConfig } = require('../dist/src/helpers');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'nsc-fast-install-'));
}

test('parseTsConfig resolves extends, comments, trailing commas and path options', async () => {
  const root = await makeTempDir();
  const baseDir = path.join(root, 'config');
  const serviceDir = path.join(root, 'services', 'MailService');
  await fs.mkdir(baseDir, { recursive: true });
  await fs.mkdir(serviceDir, { recursive: true });

  await fs.writeFile(
    path.join(baseDir, 'tsconfig.base.json'),
    `{
      // JSONC is valid in real tsconfig files.
      "compilerOptions": {
        "baseUrl": "base-url",
        "outDir": "base-dist",
        "rootDir": "base-src",
      },
    }`,
  );
  await fs.writeFile(
    path.join(serviceDir, 'tsconfig.json'),
    JSON.stringify({
      extends: '../../config/tsconfig.base.json',
      compilerOptions: {
        baseUrl: '.',
        outDir: 'dist',
        rootDir: 'src',
      },
    }),
  );

  const config = await parseTsConfig({ workDir: serviceDir, configName: 'tsconfig.json' });

  assert.equal(config.configPath, path.join(serviceDir, 'tsconfig.json'));
  assert.equal(config.compilerOptions.outDir, path.join(serviceDir, 'dist'));
  assert.equal(config.compilerOptions.rootDir, path.join(serviceDir, 'src'));
  assert.equal(config.compilerOptions.baseUrl, serviceDir);
});

test('findOutDirEntry prefers rootDir over baseUrl', async () => {
  const root = await makeTempDir();
  const serviceDir = path.join(root, 'services', 'MailService');
  const srcDir = path.join(serviceDir, 'src');
  const distDir = path.join(serviceDir, 'dist');
  await fs.mkdir(srcDir, { recursive: true });
  await fs.mkdir(path.join(distDir, 'src'), { recursive: true });
  await fs.writeFile(path.join(srcDir, 'start.ts'), 'export {};');
  await fs.writeFile(path.join(distDir, 'start.js'), '"use strict";');
  await fs.writeFile(path.join(distDir, 'src', 'start.js'), '"wrong";');

  const entry = await findOutDirEntry({
    workDir: serviceDir,
    entryPoint: path.join(srcDir, 'start.ts'),
    tsConfig: {
      configPath: path.join(serviceDir, 'tsconfig.json'),
      compilerOptions: {
        baseUrl: serviceDir,
        outDir: distDir,
        rootDir: srcDir,
      },
    },
  });

  assert.equal(entry, path.join(distDir, 'start.js'));
});

test('findOutDirEntry keeps a baseUrl compatibility fallback for legacy service output', async () => {
  const root = await makeTempDir();
  const servicesDir = path.join(root, 'services');
  const serviceDir = path.join(servicesDir, 'MailService');
  const distDir = path.join(serviceDir, 'dist');
  await fs.mkdir(serviceDir, { recursive: true });
  await fs.mkdir(path.join(distDir, 'MailService'), { recursive: true });
  await fs.writeFile(path.join(serviceDir, 'start.ts'), 'export {};');
  await fs.writeFile(path.join(distDir, 'MailService', 'start.js'), '"use strict";');

  const entry = await findOutDirEntry({
    workDir: serviceDir,
    entryPoint: path.join(serviceDir, 'start.ts'),
    tsConfig: {
      configPath: path.join(serviceDir, 'tsconfig.json'),
      compilerOptions: {
        baseUrl: servicesDir,
        outDir: distDir,
      },
    },
  });

  assert.equal(entry, path.join(distDir, 'MailService', 'start.js'));
});

test('findOutDirEntry fails when compiled entrypoint is missing', async () => {
  const root = await makeTempDir();
  const serviceDir = path.join(root, 'services', 'MailService');
  const distDir = path.join(serviceDir, 'dist');
  await fs.mkdir(serviceDir, { recursive: true });
  await fs.mkdir(distDir, { recursive: true });
  await fs.writeFile(path.join(serviceDir, 'start.ts'), 'export {};');

  await assert.rejects(
    () =>
      findOutDirEntry({
        workDir: serviceDir,
        entryPoint: path.join(serviceDir, 'start.ts'),
        tsConfig: {
          configPath: path.join(serviceDir, 'tsconfig.json'),
          compilerOptions: {
            outDir: distDir,
          },
        },
      }),
    /Compiled entrypoint not found/,
  );
});

test('expandDependenciesToCopy traverses lockfile v2 nested deps', () => {
  const deps = expandDependenciesToCopy({
    deps: ['foo'],
    packageLock: {
      lockfileVersion: 2,
      dependencies: {
        foo: { requires: { bar: '1.0.0' } },
        bar: { requires: { '@scope/baz': '1.0.0' } },
        '@scope/baz': {},
      },
    },
    workspaceInfo: emptyWorkspaceInfo(),
    options: { verbose: false },
  });

  assert.deepEqual(new Set(deps), new Set(['foo', 'bar', '@scope/baz']));
});

test('expandDependenciesToCopy traverses lockfile v3 nested scoped deps', () => {
  const deps = expandDependenciesToCopy({
    deps: ['foo'],
    packageLock: {
      lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/foo': { dependencies: { bar: '1.0.0', '@scope/baz': '1.0.0' } },
        'node_modules/foo/node_modules/bar': { dependencies: { qux: '1.0.0' } },
        'node_modules/foo/node_modules/@scope/baz': {},
        'node_modules/qux': {},
      },
    },
    workspaceInfo: emptyWorkspaceInfo(),
    options: { verbose: false },
  });

  assert.deepEqual(new Set(deps), new Set(['foo', 'foo/node_modules/bar', 'foo/node_modules/@scope/baz', 'qux']));
});

test('collectDeps separates required and optional peer deps', async () => {
  const root = await makeTempDir();
  const distDir = path.join(root, 'dist');
  const peerOwnerDir = path.join(root, 'node_modules', 'peer-owner');
  await fs.mkdir(distDir, { recursive: true });
  await fs.mkdir(peerOwnerDir, { recursive: true });

  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture' }));
  await fs.writeFile(path.join(distDir, 'start.js'), "require('peer-owner');\n");
  await fs.writeFile(path.join(peerOwnerDir, 'index.js'), 'module.exports = {};');
  await fs.writeFile(
    path.join(peerOwnerDir, 'package.json'),
    JSON.stringify({
      name: 'peer-owner',
      main: 'index.js',
      peerDependencies: {
        'required-peer': '^1.0.0',
        'optional-peer': '^1.0.0',
      },
      peerDependenciesMeta: {
        'optional-peer': { optional: true },
      },
    }),
  );

  const deps = collectDeps({
    entrypoint: path.join(distDir, 'start.js'),
    baseDir: distDir,
    packageLock: {
      lockfileVersion: 2,
      dependencies: {
        'peer-owner': {},
        'required-peer': {},
      },
    },
    cwd: root,
    options: { verbose: false },
  });

  assert.deepEqual(new Set(deps.firstOrderDeps), new Set(['peer-owner', 'required-peer']));
  assert.deepEqual(deps.optionalPeerDeps, ['optional-peer']);
});

test('expandDependenciesToCopy follows transitive workspace deps', () => {
  const workspaceInfo = emptyWorkspaceInfo();
  workspaceInfo.packageNames.add('app');
  workspaceInfo.packageNames.add('shared');
  workspaceInfo.packageJsons.set('app', { name: 'app', dependencies: { shared: 'workspace:*' } });
  workspaceInfo.packageJsons.set('shared', { name: 'shared', dependencies: { 'left-pad': '^1.0.0' } });

  const deps = expandDependenciesToCopy({
    deps: ['app'],
    packageLock: {
      lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/left-pad': {},
      },
    },
    workspaceInfo,
    options: { verbose: false },
  });

  assert.deepEqual(new Set(deps), new Set(['app', 'shared', 'left-pad']));
});

function emptyWorkspaceInfo() {
  return {
    packageNames: new Set(),
    packageDirs: new Map(),
    packageJsons: new Map(),
  };
}
