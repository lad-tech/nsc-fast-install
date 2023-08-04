import { BaseMethod, inject } from '@lad-tech/nsc-toolkit';
import { Email } from 'ExampleService/domain';
import type { AddEmailsRequest, AddEmailsResponse } from 'ExampleService/interfaces';
import { TYPES } from 'ExampleService/inversion.types';
import { EmailRepository } from 'ExampleService/repository/EmailRepository';
import { methods } from 'ExampleService/service.schema.json';

const EMAIL_LIMIT = 10;
const errors = {
  EMAIL_LIMIT: `Невозможно добавить больше ${EMAIL_LIMIT} электронных адресов`,
};

export class AddEmails extends BaseMethod {
  static settings = methods.AddEmails;

  constructor(@inject(TYPES.EmailsRepository) private emails: EmailRepository) {
    super();
  }

  async handler({ emails }: AddEmailsRequest): Promise<AddEmailsResponse> {
    const count = await this.emails.count();

    if (count >= EMAIL_LIMIT) {
      return {
        error: errors.EMAIL_LIMIT,
        list: [],
      };
    }

    emails.length = EMAIL_LIMIT - count;

    await this.emails.addEmails(emails.filter(e => !!e).map(email => Email.create({ email })));
    const list = await this.emails.getEmailList();

    return {
      list: list.map(i => ({ uuid: i.uuid, email: i.email })),
    };
  }
}
