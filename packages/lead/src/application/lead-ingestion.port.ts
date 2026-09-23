import type { LeadSnapshot, LeadStatus } from '../domain/lead';

export interface LeadCreatedV1 {
  eventId: string;
  eventType: 'LeadCreated';
  eventVersion: 1;
  aggregateType: 'Lead';
  aggregateId: string;
  occurredAt: Date;
  correlationId: string;
  payload: {
    leadId: string;
    source: string;
    sourceReference: string;
    status: 'NEW';
  };
}

export interface CreateLeadTransaction {
  idempotencyKey: string;
  requestFingerprint: string;
  lead: LeadSnapshot;
  rawPayload: Record<string, unknown>;
  event: LeadCreatedV1;
}

export type CreateLeadTransactionResult =
  | {
      disposition: 'CREATED';
      leadId: string;
    }
  | {
      disposition: 'DUPLICATE';
      leadId: string;
      duplicateReason: 'IDEMPOTENCY_KEY' | 'SOURCE_REFERENCE';
    };

export class IdempotencyConflictError extends Error {
  constructor() {
    super('IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST');
    this.name = IdempotencyConflictError.name;
  }
}

export class LeadVersionConflictError extends Error {
  constructor() {
    super('LEAD_VERSION_CONFLICT');
    this.name = LeadVersionConflictError.name;
  }
}

export interface LeadStatusStore {
  findById(id: string): Promise<LeadSnapshot | null>;
  save(lead: LeadSnapshot): Promise<void>;
}

export interface LeadSummary {
  id: string;
  status: LeadStatus;
  version: number;
  phone: string;
  source: string;
}

export interface LeadDirectory {
  findSummary(id: string): Promise<LeadSummary | null>;
  listByStatus(status: LeadStatus): Promise<LeadSummary[]>;
  countByStatus(): Promise<Array<{ status: string; count: number }>>;
}

export interface LeadIngestionPort {
  createLeadWithOutbox(transaction: CreateLeadTransaction): Promise<CreateLeadTransactionResult>;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(): string;
}
