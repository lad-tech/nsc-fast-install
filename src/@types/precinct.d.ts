// src/types/precinct.d.ts
declare module 'precinct' {
  interface PrecinctOptions {
    type?: 'es6' | 'commonjs' | 'amd' | 'ts' | 'tsx';
    includeCore?: boolean;
    ast?: any;
  }

  interface Precinct {
    (source: string | Buffer, options?: PrecinctOptions): string[];
    paperwork(filePath: string, options?: PrecinctOptions): string[];
    ast: any;
  }

  const precinct: Precinct;
  export = precinct;
}