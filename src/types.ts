export interface PackageLockLike {
  dependencies: { [x: string]: any };
}

export type TsConfigLike = {
  compilerOptions?: {
    outDir?: string;
    baseUrl?: string;
  };
};

export type PackageJsonLike = {
  main?: string;

  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  dependencies?: Record<string, any>;
};
