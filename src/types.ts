export type TsConfigLike = {
  readonly compilerOptions?: {
    readonly outDir?: string;
    readonly baseUrl?: string;
    readonly rootDir?: string;
  };
};

export type PackageJsonLike = {
  readonly name?: string;
  readonly main?: string;
  readonly dependencies?: Record<string, string>;
  readonly optionalDependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
  readonly peerDependenciesMeta?: Record<
    string,
    {
      readonly optional?: boolean;
    }
  >;
  readonly workspaces?: string[] | { readonly packages?: string[] };
};

export interface PackageLockLikeV2 {
  lockfileVersion: 1 | 2;
  dependencies: { [x: string]: Record<string, any> };
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

export type CollectOptions = { verbose: boolean };

export const isPackageLockV3 = (pkg: PackageLockLike): pkg is PackageLockLikeV3 =>
  pkg.lockfileVersion >= 3 && 'packages' in pkg;
