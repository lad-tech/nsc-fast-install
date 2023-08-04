import { TDate } from '@lad-tech/toolbelt';
import { randomUUID } from 'crypto';

export type EntityWithDBParams<T extends Record<string, any>> = T & {
  uuid: string;
  created: Date;
  updated: Date;
};
type BaseEntitySample = Record<string, any>;

export class BaseEntity<T extends BaseEntitySample> {
  protected _entity: T;

  constructor(data: T) {
    this._entity = {
      ...data,
      created: new Date(),
      updated: new Date(),
      uuid: randomUUID(),
    };
  }

  public update(data: Partial<T>) {
    for (let key in data) {
      this._entity[key] = data[key] as T[Extract<keyof T, string>];
    }
    return this;
  }

  public getView() {
    return {
      ...this._entity,
      created: this.formatDate(this._entity.created),
      updated: this.formatDate(this._entity.updated),
    };
  }

  protected formatDate(date: Date) {
    return new TDate(date)?.format();
  }

  // todo make abstract
  // static FromDB<T extends BaseEntitySample>(data: EntityWithDBParams<T>) {
  //   const instance = new this(data);
  //   instance._entity.uuid = data.uuid;
  //   instance._entity.created = data.created;
  //   instance._entity.updated = data.updated;
  //   return instance;
  // }
}
