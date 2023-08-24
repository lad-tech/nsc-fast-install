import { Logger, logger } from 'general/Logger';
import * as path from 'path';
import 'pg';
import { DataSource, Logger as TypeormLogger, QueryRunner } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { BaseRepositoryProviderInterface } from './BaseRepositoryProvider.interface';

export class CustomTypeormLogger implements TypeormLogger {
  constructor(private readonly logger: Logger) {}

  logQuery(query: string, parameters?: any[], queryRunner?: QueryRunner) {
    const sql = query + (parameters && parameters.length ? ' -- PARAMETERS: ' + this.stringifyParams(parameters) : '');
    this.logger.debug(sql);
  }

  logQueryError(error: string, query: string, parameters?: any[], queryRunner?: QueryRunner) {
    const sql = query + (parameters && parameters.length ? ' -- PARAMETERS: ' + this.stringifyParams(parameters) : '');
    this.logger.error(sql);
  }

  logQuerySlow(time: number, query: string, parameters?: any[], queryRunner?: QueryRunner) {
    const sql = query + (parameters && parameters.length ? ' -- PARAMETERS: ' + this.stringifyParams(parameters) : '');
    this.logger.info(sql);
  }

  logSchemaBuild(message: string, queryRunner?: QueryRunner) {
    this.logger.debug(message);
  }

  logMigration(message: string, queryRunner?: QueryRunner) {
    this.logger.debug(message);
  }

  log(level: 'log' | 'info' | 'warn', message: any, queryRunner?: QueryRunner) {
    switch (level) {
      case 'log':
      case 'info':
        this.logger.info(message);
        break;
      case 'warn':
        this.logger.warn(message);
        break;
    }
  }

  protected stringifyParams(parameters: any[]) {
    try {
      return JSON.stringify(parameters);
    } catch (error) {
      // most probably circular objects in parameters
      return parameters;
    }
  }
}

export class BaseRepositoryProvider implements BaseRepositoryProviderInterface {
  protected connection: DataSource;

  constructor(
    private options: {
      environment: any;
      host: string;
      port: number;
      username: string;
      password: string;
      databaseName: string;
      appName: string;
    },
  ) {}

  async init(rootPath: string) {
    const { environment, host, port, username, password, appName, databaseName } = this.options;
    this.connection = new DataSource({
      connectTimeoutMS: 1000,
      type: 'postgres',
      host,
      port,
      username,
      password,
      database: databaseName,
      synchronize: false,
      cache: false,
      entities: [path.resolve(rootPath + 'db/entities/*{.ts,.js}')],
      migrations: [path.resolve(rootPath + 'db/migrations/*{.ts,.js}')],
      logger: new CustomTypeormLogger(logger),
      extra: {
        poolSize: 5,
        application_name: appName,
      },
    } as PostgresConnectionOptions);

    await this.connection.initialize();
  }

  async close() {
    await this.connection.destroy();
  }
}
