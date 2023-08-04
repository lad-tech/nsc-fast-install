import { BaseMethod, inject } from '@lad-tech/nsc-toolkit';
import type { GetEmailsRequest, GetEmailsResponse } from 'ExampleService/interfaces';
import { TYPES } from 'ExampleService/inversion.types';
import { EmailRepository } from 'ExampleService/repository/EmailRepository';
import { methods } from 'ExampleService/service.schema.json';

export class GetEmails extends BaseMethod {
  static settings = methods.GetEmails;

  constructor(@inject(TYPES.EmailsRepository) private emails: EmailRepository) {
    super();
  }

  async handler(payload: GetEmailsRequest): Promise<GetEmailsResponse> {
    const list = await this.emails.getEmailList();

    return list.map(i => ({ uuid: i.uuid, email: i.email }));
  }
}
