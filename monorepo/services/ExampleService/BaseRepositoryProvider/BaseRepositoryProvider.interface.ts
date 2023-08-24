export interface BaseRepositoryProviderInterface {
  init(rootPath: string): Promise<void>;
  close(): Promise<void>;
}
