import {
  loadDatabaseEnvironment,
  loadWorkerEnvironment,
} from '@ai-service-broker/config';
import { handoffPublishedEvent } from '@ai-service-broker/messaging';
import {
  drainOutbox,
  InMemoryOutboxStore,
  type OutboxStore,
} from '@ai-service-broker/outbox';
import {
  createPostgresPool,
  PostgresOutboxStore,
  type SqlPool,
} from '@ai-service-broker/postgres';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

@Injectable()
export class OutboxDrain implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDrain.name);
  private readonly environment = loadWorkerEnvironment();
  private readonly store: OutboxStore;
  private readonly pool?: SqlPool;
  private timer?: NodeJS.Timeout;

  constructor() {
    if (this.environment.OUTBOX_PERSISTENCE === 'postgres') {
      const database = loadDatabaseEnvironment();
      this.pool = createPostgresPool({
        applicationName: 'ai-service-broker-worker',
        connectionString: database.DATABASE_URL,
        ssl: database.DATABASE_SSL,
      });
      this.store = new PostgresOutboxStore(this.pool);
      return;
    }

    this.store = new InMemoryOutboxStore();
  }

  async onModuleInit(): Promise<void> {
    await this.tick();
    if (this.environment.NODE_ENV !== 'test') {
      this.timer = setInterval(() => {
        void this.tick();
      }, this.environment.OUTBOX_POLL_MS);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
    }
    await this.pool?.end();
  }

  private async tick(): Promise<void> {
    try {
      const result = await drainOutbox(
        this.store,
        { now: () => new Date() },
        {
          automationPaused: this.environment.AUTOMATION_PAUSED,
          batchSize: this.environment.OUTBOX_BATCH_SIZE,
          maxAttempts: this.environment.OUTBOX_MAX_ATTEMPTS,
        },
        (message) => {
          const handed = handoffPublishedEvent(
            message.eventType,
            message.payload['channel'],
          );
          if (!('provider' in handed)) {
            this.logger.warn({ code: handed.code });
          }
        },
      );
      if (
        result.published > 0 ||
        result.retried > 0 ||
        result.dead > 0 ||
        result.disposition === 'PAUSED'
      ) {
        this.logger.log({
          disposition: result.disposition,
          published: result.published,
          retried: result.retried,
          dead: result.dead,
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Outbox drain failed';
      this.logger.error({ message });
    }
  }
}
