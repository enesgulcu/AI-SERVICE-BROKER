import {
  loadApiEnvironment,
  loadDatabaseEnvironment,
} from '@ai-service-broker/config';
import {
  IngestLead,
  InMemoryLeadIngestionAdapter,
  type LeadIngestionPort,
} from '@ai-service-broker/lead';
import {
  createPostgresPool,
  PostgresLeadIngestionAdapter,
} from '@ai-service-broker/postgres';
import { Module } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { LeadIngestionController } from './lead-ingestion.controller';
import { LeadIngestionService } from './lead-ingestion.service';
import { LEAD_INGESTION_PORT } from './lead.tokens';

@Module({
  controllers: [LeadIngestionController],
  providers: [
    {
      provide: LEAD_INGESTION_PORT,
      useFactory(): LeadIngestionPort {
        const environment = loadApiEnvironment();
        if (environment.LEAD_PERSISTENCE === 'postgres') {
          const database = loadDatabaseEnvironment();
          return new PostgresLeadIngestionAdapter(
            createPostgresPool({
              applicationName: 'ai-service-broker-api',
              connectionString: database.DATABASE_URL,
              ssl: database.DATABASE_SSL,
            }),
          );
        }

        return new InMemoryLeadIngestionAdapter();
      },
    },
    {
      provide: IngestLead,
      useFactory(persistence: LeadIngestionPort): IngestLead {
        return new IngestLead(
          persistence,
          { now: () => new Date() },
          { next: () => randomUUID() },
          { next: () => randomUUID() },
        );
      },
      inject: [LEAD_INGESTION_PORT],
    },
    LeadIngestionService,
  ],
})
export class LeadModule {}
