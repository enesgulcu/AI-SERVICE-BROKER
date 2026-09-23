export { InMemoryLeadIngestionAdapter } from './adapters/in-memory-lead-ingestion.adapter';
export { IngestLead, IngestLeadInputError } from './application/ingest-lead';
export type { IngestLeadCommand } from './application/ingest-lead';
export {
  IdempotencyConflictError,
  LeadVersionConflictError,
} from './application/lead-ingestion.port';
export type {
  Clock,
  CreateLeadTransaction,
  CreateLeadTransactionResult,
  IdGenerator,
  LeadCreatedV1,
  LeadDirectory,
  LeadIngestionPort,
  LeadStatusStore,
  LeadSummary,
} from './application/lead-ingestion.port';
export { Lead, LeadInvariantError } from './domain/lead';
export type { CreateLeadInput, LeadSnapshot, LeadStatus } from './domain/lead';
export { WORKFLOW_POLICY_VERSION, decideWorkflowMove } from './domain/workflow-move';
export type {
  ClosedLostReason,
  WorkflowGate,
  WorkflowMove,
  WorkflowTarget,
} from './domain/workflow-move';
