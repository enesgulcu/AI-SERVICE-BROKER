import {
  loadApiEnvironment,
  loadDatabaseEnvironment,
} from '@ai-service-broker/config';
import {
  InMemoryFirstContactAdapter,
  type FirstContactPort,
} from '@ai-service-broker/contact';
import {
  InMemoryInboundStore,
  type ConversationControlStore,
  type InboundStore,
} from '@ai-service-broker/conversation';
import {
  IngestLead,
  InMemoryLeadIngestionAdapter,
  type LeadDirectory,
  type LeadIngestionPort,
} from '@ai-service-broker/lead';
import {
  UnavailableOutboxRedrive,
  type OutboxRedrive,
} from '@ai-service-broker/outbox';
import {
  InMemoryRequirementStore,
  type RequirementStore,
} from '@ai-service-broker/requirement';
import { InMemoryRiskStore, type RiskStore } from '@ai-service-broker/safety';
import {
  InMemoryWorkflowStore,
  type WorkflowStore,
} from '@ai-service-broker/workflow';
import {
  createPostgresPool,
  PostgresConversationControlStore,
  PostgresFirstContactAdapter,
  PostgresInboundStore,
  PostgresLeadIngestionAdapter,
  PostgresOperationsStore,
  PostgresWorkflowStore,
  asRequirementStore,
  asRiskStore,
  type SqlClient,
  type SqlPool,
} from '@ai-service-broker/postgres';
import { Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  READINESS_PROBE,
  type DatabaseCheck,
  type ReadinessProbe,
} from '../platform/health/readiness';
import { LeadIngestionController } from './lead-ingestion.controller';
import { LeadIngestionService } from './lead-ingestion.service';

@Injectable()
export class LeadPersistence implements OnModuleDestroy, ReadinessProbe {
  readonly port: LeadIngestionPort;
  readonly firstContact: FirstContactPort;
  readonly inbound: InboundStore;
  readonly conversationControl: ConversationControlStore;
  readonly workflow: WorkflowStore;
  readonly directory: LeadDirectory;
  readonly requirements: RequirementStore;
  readonly risks: RiskStore;
  readonly redrive: OutboxRedrive;
  private readonly pool?: SqlPool;

  constructor() {
    const environment = loadApiEnvironment();
    if (environment.LEAD_PERSISTENCE === 'postgres') {
      const database = loadDatabaseEnvironment();
      this.pool = createPostgresPool({
        applicationName: 'ai-service-broker-api',
        connectionString: database.DATABASE_URL,
        ssl: database.DATABASE_SSL,
      });
      this.port = new PostgresLeadIngestionAdapter(this.pool);
      this.firstContact = new PostgresFirstContactAdapter(this.pool);
      this.inbound = new PostgresInboundStore(this.pool);
      this.conversationControl = new PostgresConversationControlStore(
        this.pool,
      );
      this.workflow = new PostgresWorkflowStore(this.pool);
      const operations = new PostgresOperationsStore(this.pool);
      this.directory = operations;
      this.requirements = asRequirementStore(operations);
      this.risks = asRiskStore(operations);
      this.redrive = operations;
      return;
    }

    const memory = new InMemoryLeadIngestionAdapter();
    this.port = memory;
    this.firstContact = new InMemoryFirstContactAdapter(memory);
    const inbound = new InMemoryInboundStore();
    this.inbound = inbound;
    this.conversationControl = inbound;
    this.workflow = new InMemoryWorkflowStore(memory);
    this.directory = memory;
    this.requirements = new InMemoryRequirementStore();
    this.risks = new InMemoryRiskStore();
    this.redrive = new UnavailableOutboxRedrive();
  }

  async checkDatabase(): Promise<DatabaseCheck> {
    if (!this.pool) {
      return 'skipped';
    }

    let client: SqlClient | undefined;
    try {
      client = await this.pool.connect();
      await client.query('SELECT 1');
      return 'ok';
    } catch {
      return 'unavailable';
    } finally {
      client?.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}

@Module({
  controllers: [LeadIngestionController],
  providers: [
    LeadPersistence,
    {
      provide: IngestLead,
      useFactory(persistence: LeadPersistence): IngestLead {
        return new IngestLead(
          persistence.port,
          { now: () => new Date() },
          { next: () => randomUUID() },
          { next: () => randomUUID() },
        );
      },
      inject: [LeadPersistence],
    },
    LeadIngestionService,
    {
      provide: READINESS_PROBE,
      useExisting: LeadPersistence,
    },
  ],
  exports: [LeadPersistence, READINESS_PROBE],
})
export class LeadModule {}
