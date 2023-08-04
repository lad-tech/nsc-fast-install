import { DictOf } from '@lad-tech/toolbelt/dist/common/types/util';
import { readFile } from 'fs/promises';
import { ITemplater } from 'general/Html/index';

export class CustomTemplater implements ITemplater {
  public async getTemplate(filepath: string, params: DictOf<string>): Promise<string> {
    let html = (await readFile(filepath)).toString();
    const tokens = Object.keys(params);

    for (const token of tokens) {
      const regexp = new RegExp(`{{\\s*${token}\\s*}}`);
      html = html.replace(regexp, params[token]);
    }

    return html;
  }
}
