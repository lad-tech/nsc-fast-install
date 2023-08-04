import { DictOf } from '@lad-tech/toolbelt/dist/common/types/util';
import { readFile } from 'fs/promises';
import { ITemplater } from 'general/Html/index';
import * as Mustache from 'mustache';

export class MustacheTemplater implements ITemplater {
  public async getTemplate(filepath: string, params: DictOf<string>): Promise<string> {
    const fileContent = (await readFile(filepath)).toString();

    return Mustache.render(fileContent, params);
  }
}
