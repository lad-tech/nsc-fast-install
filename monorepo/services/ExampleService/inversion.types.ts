import { BaseRepositoryProvider } from 'ExampleService/BaseRepositoryProvider';

export const TYPES = {
  Logger: Symbol.for('Logger'),
  Configurator: Symbol('Configurator'),
  EmailsRepository: Symbol('EmailsRepository'),
  StaffingCreatedProcessing: Symbol('StaffingCreatedProcessing'),
  BaseRepositoryProvider: Symbol('BaseRepositoryProvider'),
  Core: Symbol.for('Core'),
};
