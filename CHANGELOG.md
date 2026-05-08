## [2.0.3](https://github.com/lad-tech/nsc-fast-install/compare/v2.0.2...v2.0.3) (2026-05-08)


### Bug Fixes

* copy installed optional runtime dependencies ([0b5d74f](https://github.com/lad-tech/nsc-fast-install/commit/0b5d74fbf4fc80ffa1158b951540d9838e4a5bb6))

## [2.0.2](https://github.com/lad-tech/nsc-fast-install/compare/v2.0.1...v2.0.2) (2026-05-07)


### Bug Fixes

* version bump ([629114f](https://github.com/lad-tech/nsc-fast-install/commit/629114f0c8f0444c890460143106725fb95f926a))

## [2.0.1](https://github.com/lad-tech/nsc-fast-install/compare/v2.0.0...v2.0.1) (2026-05-07)


### Bug Fixes

* include dist package manifest in tarball ([2356f44](https://github.com/lad-tech/nsc-fast-install/commit/2356f44167d86668d8c2c0d1a4643420397e108f))

# [2.0.0](https://github.com/lad-tech/nsc-fast-install/compare/v1.16.3...v2.0.0) (2026-05-07)


* feat!: support workspace-aware dependency install ([dab1990](https://github.com/lad-tech/nsc-fast-install/commit/dab1990d08e55ac6556c2ec92183cfe5f2c6bb2f))


### BREAKING CHANGES

* --service now prefers runtime entrypoints such as start.ts before package.json#main. Use --entryStrategy main to restore the previous main-first behavior.
* the published package no longer advertises the broken dist/types/index.d.ts types entry.

## [1.16.3](https://github.com/lad-tech/nsc-fast-install/compare/v1.16.2...v1.16.3) (2025-07-10)


### Bug Fixes

* Handle dependency copying differently based on package-lock version; improve path resolution and add verbose logging for nsc-toolkit copying in CLI script ([ae9648f](https://github.com/lad-tech/nsc-fast-install/commit/ae9648ffc705b94876629378eeee0a9d0388cdb0))

## [1.16.2](https://github.com/lad-tech/nsc-fast-install/compare/v1.16.1...v1.16.2) (2025-07-10)


### Bug Fixes

* version up ([ae93b88](https://github.com/lad-tech/nsc-fast-install/commit/ae93b88d5d767edc428991d61b4ad1a0ab86a88c))

## [1.16.1](https://github.com/lad-tech/nsc-fast-install/compare/v1.16.0...v1.16.1) (2025-07-10)


### Bug Fixes

* add dev dependency @semantic-release/exec ([7ab2ba3](https://github.com/lad-tech/nsc-fast-install/commit/7ab2ba32edc9807dea61645bdbc137f78712e347))

# [1.16.0](https://github.com/lad-tech/nsc-fast-install/compare/v1.15.4...v1.16.0) (2025-07-10)


### Bug Fixes

* update build script and binary paths to use dist/src/bin/cli.js instead of dist/bin/cli.js ([6bd19a2](https://github.com/lad-tech/nsc-fast-install/commit/6bd19a27c870b034bb7ea3c8f31f498411f3a53a))


### Features

* Add version flag to CLI and integrate semantic-release git plugin ([00323a4](https://github.com/lad-tech/nsc-fast-install/commit/00323a4e558e6b5eef2e8d20d81c48cda4423a6b))
