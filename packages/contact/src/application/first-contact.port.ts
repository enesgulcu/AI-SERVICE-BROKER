export const FIRST_CONTACT_REVIEW_TTL_MS = 24 * 60 * 60 * 1000;

export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
export type DeliveryStatus = 'DRAFT' | 'MOCK_ACCEPTED' | 'NOT_SENT';

export interface ContactReviewSnapshot {
  id: string;
  leadId: string;
  messageId: string;
  status: ReviewStatus;
  actorId: string;
  templateVersion: string;
  reasonCode: string;
  draft: string;
  deliveryStatus: DeliveryStatus;
  providerMessageId?: string;
  expiresAt: Date;
  decidedAt?: Date;
  decisionActorId?: string;
  correlationId: string;
}

export interface AuditRecord {
  id: string;
  actorId: string;
  action: string;
  entityType: 'ContactReview';
  entityId: string;
  reasonCode: string;
  correlationId: string;
  occurredAt: Date;
}

export interface ContactEvent {
  eventId: string;
  eventType: 'ContactReviewOpened' | 'LeadContacted';
  eventVersion: 1;
  aggregateType: 'Lead';
  aggregateId: string;
  occurredAt: Date;
  correlationId: string;
  payload: Record<string, string>;
}

export interface PreparationPlan {
  idempotencyKey: string;
  requestFingerprint: string;
  expectedVersion: number;
  leadId: string;
  nextStatus: 'CONTACT_PENDING';
  nextVersion: number;
  review: ContactReviewSnapshot;
  audit: AuditRecord;
  event: ContactEvent;
}

export interface DecisionPlan {
  idempotencyKey: string;
  requestFingerprint: string;
  expectedVersion: number;
  leadId: string;
  nextStatus: 'CONTACTED' | 'NEW';
  nextVersion: number;
  review: ContactReviewSnapshot;
  audit: AuditRecord;
  event: ContactEvent | null;
}

export type CommitResult =
  { disposition: 'CREATED' } | { disposition: 'REPLAY'; review: ContactReviewSnapshot };

export interface FirstContactPort {
  findLead(id: string): Promise<import('@ai-service-broker/lead').LeadSnapshot | null>;
  findOpenReview(leadId: string): Promise<ContactReviewSnapshot | null>;
  findReview(id: string): Promise<ContactReviewSnapshot | null>;
  commitPreparation(plan: PreparationPlan): Promise<CommitResult>;
  commitDecision(plan: DecisionPlan): Promise<CommitResult>;
}

export class ContactFlowError extends Error {
  constructor(
    readonly code:
      | 'LEAD_NOT_FOUND'
      | 'REVIEW_NOT_FOUND'
      | 'ALREADY_CONTACTED'
      | 'REVIEW_CLOSED'
      | 'CONTACT_NOT_ELIGIBLE'
      | 'MESSAGE_GUARD_REJECTED'
      | 'REVIEW_EXPIRED'
      | 'INVALID_ACTOR'
      | 'INVALID_REQUEST'
      | 'INVALID_LEAD_ID'
      | 'INVALID_REVIEW_ID',
    readonly reasons: readonly string[] = [],
  ) {
    super(code);
    this.name = ContactFlowError.name;
  }
}
