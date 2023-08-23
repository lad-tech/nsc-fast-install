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
};
