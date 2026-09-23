import type { LeadSnapshot } from '../domain/lead';

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

export interface LeadIngestionPort {
  createLeadWithOutbox(transaction: CreateLeadTransaction): Promise<CreateLeadTransactionResult>;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(): string;
}
