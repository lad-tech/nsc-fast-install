# @lad-tech/nsc-fast-install

Fast dependency installer for Node.js services in a monorepo.

`nsc-fast-install` analyzes the compiled JavaScript entrypoint of a service, finds the packages that are actually required at runtime, and copies only those packages into the service `dist/node_modules`.

The tool is intended for Docker and CI builds where copying the full root `node_modules` is too heavy.

## Why

In many monorepos dependencies are installed once in the repository root:

```text
backend/
  package.json
  package-lock.json
  node_modules/
  services/
    gate/
    shared/
    users/
```

This is convenient for development, but inefficient for service images. A service usually needs only a small part of the root dependency tree, while `COPY node_modules` puts everything into the image.

`nsc-fast-install` builds a smaller runtime `node_modules` for a specific service.

## What It Does

1. Resolves the service runtime entrypoint.
2. Reads the compiled JavaScript file from `outDir`.
3. Scans static `require()` and `import` dependencies.
4. Resolves packages using Node-compatible resolution, including `package.json#exports`.
5. Expands transitive dependencies from `package-lock.json`.
6. Handles npm workspaces and copies workspace packages as real directories, not symlinks.
7. Writes the result to `<outDir>/node_modules` or to the path passed with `--output`.

## Install

```bash
npm i @lad-tech/nsc-fast-install -D
```

## Basic Usage

Run the tool from the monorepo root after the service has already been built:

```bash
npx nsc-fast-install --service services/gate
```

Or pass an explicit entrypoint:

```bash
npx nsc-fast-install --entryPoint services/gate/start.ts
```

By default, dependencies are copied to:

```text
services/gate/dist/node_modules
```

## Build Order

The tool analyzes compiled JavaScript, not TypeScript source. Build the service first:

```bash
npm run build --workspace services/gate
npx nsc-fast-install --service services/gate
```

If `outDir` or the compiled entrypoint does not exist, the command fails.

## Entrypoint Resolution

For `--service`, the default strategy is `runtime`.

Runtime strategy checks source runtime files first:

1. `start.ts`
2. `service.ts`
3. `index.ts`
4. `package.json#main`

This is the right default for Docker/service builds where `package.json#main` may point to a library export such as `dist/Api/index.js`, while the real runtime entry is `start.ts`.

To prefer `package.json#main`, use:

```bash
npx nsc-fast-install --service services/gate --entryStrategy main
```

## Package Exports

The resolver supports Node-style `package.json#exports`, including package subpaths.

Examples that are resolved correctly:

```ts
import { SchemaBuilder } from 'shared/SchemaBuilder';
import { WorkspaceFilesClient } from 'shared/clients/WorkspaceFilesClient';
import { UPLOAD_STREAM_MAGIC } from 'shared/helpers/uploadProtocol';
import schema from 'shared/clients/WorkspaceFiles/service.schema.json';
```

Supported export shapes include:

```json
{
  "name": "shared",
  "exports": {
    ".": "./dist/index.js",
    "./SchemaBuilder": "./dist/SchemaBuilder.js",
    "./clients/*": "./dist/clients/*.js",
    "./helpers/uploadProtocol": "./dist/helpers/uploadProtocol.js",
    "./clients/*/service.schema.json": "./dist/clients/*/service.schema.json"
  }
}
```

## Workspaces

The tool reads npm workspaces from the root `package.json`:

```json
{
  "workspaces": ["services/*"]
}
```

Workspace packages are treated as valid dependencies even when they are not listed in the root `dependencies`.

For example, this is valid:

```json
// services/gate/package.json
{
  "name": "gate",
  "dependencies": {
    "shared": "workspace:*"
  }
}
```

When npm creates a workspace symlink:

```text
node_modules/shared -> ../services/shared
```

`nsc-fast-install` dereferences it and copies the actual package directory into the target `node_modules`. The Docker context receives a normal directory instead of a symlink.

Workspace dependencies are also expanded recursively. If `gate` depends on `shared`, and `shared` depends on `logger`, both workspace packages are copied.

## Dependency Validation

The missing dependency check uses:

- root `package.json` dependencies;
- target service `package.json` dependencies;
- workspace package names;
- dependencies of referenced workspace packages.

This means service-local workspace dependencies do not need to be duplicated in the root `dependencies`.

## Docker Example

```dockerfile
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY services ./services

RUN npm ci
RUN npm run build --workspace services/gate
RUN npx nsc-fast-install --service services/gate

FROM node:20-alpine

WORKDIR /app

COPY --from=build /app/services/gate/dist ./dist

CMD ["node", "dist/start.js"]
```

Adjust the final `CMD` to match your service output path.

## CLI Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `--entryPoint <path>` | `string` | - | Source or compiled entrypoint, for example `services/gate/start.ts`. |
| `--service <path>` | `string` | - | Service directory, for example `services/gate`. |
| `--entryStrategy <runtime\|main>` | `string` | `runtime` | Entrypoint strategy for `--service`. |
| `--output <path>` | `string` | `outDir` | Directory where `node_modules` will be created. |
| `--exclude <list>` | `string` | `frontend` | Comma-separated directory names to skip. |
| `--tsconfig <name>` | `string` | `tsconfig.json` | Service tsconfig filename. |
| `--dryRun` | `boolean` | `false` | Print dependencies without copying or deleting target `node_modules`. |
| `--verbose` | `boolean` | `false` | Print resolver and copy details. |
| `--version` | `boolean` | - | Print package version. |

## Dry Run

Use `--dryRun` to inspect what would be copied:

```bash
npx nsc-fast-install --service services/gate --dryRun
```

Dry-run mode does not remove or create the target `node_modules`.

## Requirements

- Node.js project with `package-lock.json`.
- Compiled JavaScript output must exist before running the tool.
- Static imports or requires must be present in the compiled output. Dynamic runtime-only imports cannot always be detected.
- npm workspaces are supported through the root `workspaces` field.

## Troubleshooting

### `Dist dir not found`

The service has not been built, or `compilerOptions.outDir` points to a different directory.

Build the service first.

### `Unresolved imports`

The compiled file contains an import that cannot be resolved from the monorepo root or from the importing file.

Check:

- `package.json#exports`;
- workspace symlinks in root `node_modules`;
- `baseUrl` and emitted JS paths;
- whether the import exists in the compiled output.

### `Отсутствующие зависимости в package.json`

A runtime package is used but is not declared in the root package, target service package, or workspace packages.

Add it to the package that owns the dependency.
