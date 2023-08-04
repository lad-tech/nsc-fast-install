import { TDate } from '@lad-tech/toolbelt';
import { randomUUID } from 'crypto';
import { CreateNewEmailParam, InitEmail } from 'ExampleService/domain/aggregates/Email/Email.interface';

export class Email {
  private created: TDate;
  private updated: TDate;

  constructor({ created, updated, uuid, email }: InitEmail) {
    this._email = email;
    this._uuid = uuid ?? randomUUID();
    this.created = new TDate(created);
    this.updated = new TDate(updated);
  }

  private _uuid: string;

  get uuid() {
    return this._uuid;
  }

  private _email: string;

  get email() {
    return this._email;
  }

  static create({ email }: CreateNewEmailParam) {
    const date = new TDate();
    return new Email({ email, created: date, updated: date });
  }

  public toJSON() {
    return {
      uuid: this._uuid,
      email: this._email,
      created: this.created,
      updated: this.updated,
    };
  }
}
