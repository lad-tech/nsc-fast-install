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

export interface PackageLockLikeV2 {
  lockfileVersion: 1 | 2;
  dependencies: { [x: string]: any };
}

export type PackageLockLikeV3 = {
  lockfileVersion: 3;
  packages: {
    [path: string]: {
      dependencies?: Record<string, string>;
    };
  };
};

export type PackageLockLike = PackageLockLikeV2 | PackageLockLikeV3;

export type CollectOptions = { verbose?: boolean };

export const isPackageLockV3 = (pkg: PackageLockLike): pkg is PackageLockLikeV3 =>
  pkg.lockfileVersion >= 3 && 'packages' in pkg;
