import { injectable } from 'inversify';

@injectable()
export class Configurator {
  public castToNumber(value: string) {
    const result = +value;
    if (isNaN(result)) {
      throw new Error(`Невозможно привести значение ${value} к числу`);
    }
    return result;
  }
  public getSettingFromEnv(name: string) {
    const value = process.env[name];
    if (!value) {
      throw new Error(`Не установлена обязательная настройка: ${name}`);
    }
    return value;
  }
}
