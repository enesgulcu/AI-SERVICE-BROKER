export { InMemoryLeadIngestionAdapter } from './adapters/in-memory-lead-ingestion.adapter';
export { IngestLead, IngestLeadInputError } from './application/ingest-lead';
export type { IngestLeadCommand } from './application/ingest-lead';
export { IdempotencyConflictError } from './application/lead-ingestion.port';
export type {
  Clock,
  CreateLeadTransaction,
  CreateLeadTransactionResult,
  IdGenerator,
  LeadCreatedV1,
  LeadIngestionPort,
} from './application/lead-ingestion.port';
export { Lead, LeadInvariantError } from './domain/lead';
export type { CreateLeadInput, LeadSnapshot, LeadStatus } from './domain/lead';
