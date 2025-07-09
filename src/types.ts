export type TsConfigLike = {
  readonly compilerOptions?: {
    readonly outDir?: string;
    readonly baseUrl?: string;
  };
};

export type PackageJsonLike = {
  readonly main?: string;
  readonly dependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
  readonly peerDependenciesMeta?: Record<
    string,
    {
      readonly optional?: boolean;
    }
  >;
};

export type PackageLockV3 = {
  name?: string;
  version?: string;
  lockfileVersion: 3;
  packages: {
    [path: string]: {
      version?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      resolved?: string;
      integrity?: string;
    };
  };
};

export type PackageLockV2 = {
  name?: string;
  version?: string;
  lockfileVersion: 1 | 2;
  dependencies: {
    [packageName: string]: {
      version: string;
      requires?: Record<string, string>;
      dependencies?: Record<string, any>;
    };
  };
};

export type PackageLock = PackageLockV2 | PackageLockV3;

export type CollectOptions = { verbose?: boolean };

export const isPackageLockV3 = (pkg: PackageLock): pkg is PackageLockV3 =>
  pkg.lockfileVersion >= 3 && 'packages' in pkg;
