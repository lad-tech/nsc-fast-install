export type DependencyMap = Record<string, string>;

export type TsCompilerOptionsLike = {
  readonly baseUrl?: string;
  readonly outDir?: string;
  readonly rootDir?: string;
};

export type TsConfigLike = {
  readonly compilerOptions?: {
    readonly outDir?: string;
    readonly baseUrl?: string;
    readonly rootDir?: string;
  };
  readonly configPath: string;
};

export type PackageJsonLike = {
  readonly name?: string;
  readonly main?: string;
  readonly dependencies?: DependencyMap;
  readonly optionalDependencies?: DependencyMap;
  readonly devDependencies?: DependencyMap;
  readonly peerDependencies?: DependencyMap;
  readonly peerDependenciesMeta?: Record<
    string,
    {
      readonly optional?: boolean;
    }
  >;
  readonly workspaces?: string[] | { readonly packages?: string[] };
};

export type PackageLockNode = {
  readonly dependencies?: DependencyMap;
  readonly requires?: DependencyMap;
};

export interface PackageLockLikeV2 {
  lockfileVersion: 1 | 2;
  dependencies: Record<string, PackageLockNode>;
}

export type PackageLockLikeV3 = {
  lockfileVersion: 3;
  packages: Record<string, PackageLockNode>;
};

export type PackageLockLike = PackageLockLikeV2 | PackageLockLikeV3;

export type CollectOptions = {
  verbose: boolean;
  skipOptionalRuntimeDeps?: boolean;
};

export const isPackageLockV3 = (pkg: PackageLockLike): pkg is PackageLockLikeV3 =>
  pkg.lockfileVersion >= 3 && 'packages' in pkg;
