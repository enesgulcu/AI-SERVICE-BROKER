export { IngestLead, IngestLeadInputError } from './application/ingest-lead';
export type { IngestLeadCommand } from './application/ingest-lead';
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
