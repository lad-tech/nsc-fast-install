import { BaseMethod, inject } from '@lad-tech/nsc-toolkit';
import type { DeleteEmailsRequest, DeleteEmailsResponse } from 'ExampleService/interfaces';
import { TYPES } from 'ExampleService/inversion.types';
import { EmailRepository } from 'ExampleService/repository/EmailRepository';
import { methods } from 'ExampleService/service.schema.json';

export class DeleteEmails extends BaseMethod {
  static settings = methods.DeleteEmails;

  private errors = {
    NOT_FOUND: 'Почтовый адрес не найден.',
  };

  constructor(@inject(TYPES.EmailsRepository) private emails: EmailRepository) {
    super();
  }

  async handler({ uuid }: DeleteEmailsRequest): Promise<DeleteEmailsResponse> {
    const email = this.emails.getEmailByUuid(uuid);

    if (!email) {
      throw new Error(this.errors.NOT_FOUND);
    }

    await this.emails.removeEmailByUuid(uuid);
    const list = await this.emails.getEmailList();

    return list.map(i => ({ uuid: i.uuid, email: i.email }));
  }
}
