import { Baggage, CacheSettings, Client } from '@lad-tech/nsc-toolkit';
import type {
  AddEmailsRequest,
  AddEmailsResponse,
  DeleteEmailsRequest,
  DeleteEmailsResponse,
  EmitterSettingsExternal,
  GetEmailsRequest,
  GetEmailsResponse,
} from 'ExampleService/interfaces';
import { events, methods, name, Ref } from 'ExampleService/service.schema.json';
import type { NatsConnection } from 'nats';

export default class Settings extends Client<EmitterSettingsExternal> {
  constructor(broker: NatsConnection, baggage?: Baggage, cache?: CacheSettings) {
    super({ broker, serviceName: name, baggage, cache, events, Ref });
  }

  async GetEmails(payload: GetEmailsRequest): Promise<GetEmailsResponse> {
    return this.request<GetEmailsResponse>(`${name}.${methods.GetEmails.action}`, payload, methods.GetEmails);
  }

  async AddEmails(payload: AddEmailsRequest): Promise<AddEmailsResponse> {
    return this.request<AddEmailsResponse>(`${name}.${methods.AddEmails.action}`, payload, methods.AddEmails);
  }

  async DeleteEmails(payload: DeleteEmailsRequest): Promise<DeleteEmailsResponse> {
    return this.request<DeleteEmailsResponse>(`${name}.${methods.DeleteEmails.action}`, payload, methods.DeleteEmails);
  }
}
