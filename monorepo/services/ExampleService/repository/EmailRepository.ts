import { inject } from '@lad-tech/nsc-toolkit';
import { Email, InitEmail } from 'ExampleService/domain';
import { TYPES } from 'ExampleService/inversion.types';
import { Configurator, Logger } from 'general';
import { Collection, MongoClient } from 'mongodb';

export class EmailRepository {
  isConnected: boolean = false;
  private client: MongoClient;
  private emails: Collection<InitEmail & { revision: number }>;
  private revisions: WeakMap<Email, number> = new WeakMap();

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.Configurator) private configurator: Configurator,
  ) {
    const uri = this.configurator.getSettingFromEnv('MONGODB_URI');
    this.client = new MongoClient(uri, {
      ignoreUndefined: true,
    });

    this.emails = this.client.db().collection('emails');
  }

  public async connect() {
    try {
      await this.client.connect();
      await this.client.db().command({ ping: 1 });
      await this.createIndexes();
      this.isConnected = true;
      this.logger.info('emails repository successful connection to mongodb');
    } catch (error) {
      this.logger.error('Failed connecting to mongodb', error);
    }
  }

  public async close() {
    try {
      await this.client.close();
      this.isConnected = false;

      this.logger.info('Successful closed connection with mongodb');
    } catch (error) {
      this.logger.error('Failed closing connection with mongodb', error);
    }
  }

  public async getEmailList() {
    const result = await this.emails.find().toArray();

    return result.map((entry: InitEmail) => new Email(entry));
  }

  public async count() {
    return await this.emails.countDocuments();
  }

  public async getEmailByUuid(uuid: string) {
    const result = await this.emails.findOne({ uuid });

    if (!result) {
      return;
    }

    return new Email(result);
  }

  public async removeEmailByUuid(uuid: string) {
    await this.emails.deleteOne({ uuid });
  }

  public async addEmails(emails: Email[]) {
    const bulk = this.emails.initializeOrderedBulkOp();

    for (const email of emails) {
      bulk
        .find({ email: email.email })
        .upsert()
        .update({
          $setOnInsert: {
            ...email.toJSON(),
            revision: 0,
          },
        });
    }

    await bulk.execute({
      writeConcern: {
        w: 'majority',
      },
    });
  }

  private async createIndexes() {
    return Promise.all([
      this.emails.createIndex({ uuid: 1 }, { unique: true }),
      this.emails.createIndex({ email: 1 }, { unique: true }),
    ]);
  }
}
