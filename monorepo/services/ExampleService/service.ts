import { container, DependencyType, Service } from '@lad-tech/nsc-toolkit';
import { TYPES } from 'ExampleService/inversion.types';
import { AddEmails } from 'ExampleService/methods/AddEmails';
import { DeleteEmails } from 'ExampleService/methods/DeleteEmails';
import { GetEmails } from 'ExampleService/methods/GetEmails';
import { EmailRepository } from 'ExampleService/repository/EmailRepository';
import { events, name } from 'ExampleService/service.schema.json';
import { Configurator, Logger, logger } from 'general';
import { connect, NatsConnection } from 'nats';

export async function main(broker?: NatsConnection) {
  const configurator = new Configurator();
  const brokerConnection =
    broker ||
    (await connect({
      servers: [configurator.getSettingFromEnv('NATS_HOST')],
      maxReconnectAttempts: -1,
    }));

  container.bind<Logger>(TYPES.Logger, DependencyType.CONSTANT, logger);
  container.bind<Configurator>(TYPES.Configurator, DependencyType.CONSTANT, configurator);
  container.bind<EmailRepository>(
    TYPES.EmailsRepository,
    DependencyType.CONSTANT,
    new EmailRepository(logger, configurator),
  );
  const repository = container.getInstance<EmailRepository>(TYPES.EmailsRepository)!;

  await repository.connect();

  // Этот файл генерируется автоматически, этот вызов важен для генерации
  const service = new Service({
    name,
    brokerConnection,
    methods: [GetEmails, AddEmails, DeleteEmails],
    gracefulShutdown: { additional: [repository] },
    events,
  });

  await service.start();

  return service;
}
