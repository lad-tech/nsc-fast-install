import { ITemplater } from 'general/Html/interfaces';
import { MustacheTemplater } from 'general/Html/MustacheTemplater';
import { resolve } from 'path';

export class Templater {
  public templateDirectory: string = resolve(process.cwd(), 'templates');

  constructor(private templater: ITemplater) {}

  public async getTemplate(name: string, params: {}): Promise<string> {
    if (!this.templateDirectory) {
      throw new Error('Не установлена переменная templateDirectory для поиска шаблонов письма.');
    }

    return this.templater.getTemplate(resolve(this.templateDirectory, `${name}.html`), params);
  }
}

export const templater = new Templater(new MustacheTemplater());
