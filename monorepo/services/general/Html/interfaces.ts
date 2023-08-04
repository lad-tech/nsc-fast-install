export interface ITemplater {
  getTemplate(filepath: string, params: {}): Promise<string>;
}
