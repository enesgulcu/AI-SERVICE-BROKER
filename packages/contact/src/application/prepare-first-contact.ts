import {
  IdempotencyConflictError,
  Lead,
  LeadVersionConflictError,
  type LeadSnapshot,
} from '@ai-service-broker/lead';
import { evaluateContactEligibility } from '../domain/eligibility';
import {
  FIRST_CONTACT_TEMPLATE_VERSION,
  SANDBOX_FIRST_CONTACT_DRAFT,
  firstContactGuardReasons,
} from '../domain/first-contact-draft';
import {
  FIRST_CONTACT_REVIEW_TTL_MS,
  ContactFlowError,
  type AuditRecord,
  type CommitResult,
  type ContactEvent,
  type ContactReviewSnapshot,
  type FirstContactPort,
} from './first-contact.port';

export interface PrepareFirstContactCommand {
  idempotencyKey: string;
  requestFingerprint: string;
  correlationId: string;
  actorId: string;
  leadId: string;
}

export interface PrepareFirstContactResult {
  disposition: 'PENDING' | 'DUPLICATE';
  reviewId: string;
  leadId: string;
  draft: string;
  templateVersion: string;
  expiresAt: Date;
}

interface IdSource {
  next(): string;
}

interface Clock {
  now(): Date;
}

const SAFE_ID = /^[a-zA-Z0-9._:-]{8,128}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function view(review: ContactReviewSnapshot): PrepareFirstContactResult {
  return {
    disposition: review.status === 'PENDING' ? 'PENDING' : 'DUPLICATE',
    reviewId: review.id,
    leadId: review.leadId,
    draft: review.draft,
    templateVersion: review.templateVersion,
    expiresAt: review.expiresAt,
  };
}

export class PrepareFirstContact {
  constructor(
    private readonly store: FirstContactPort,
    private readonly clock: Clock,
    private readonly ids: IdSource,
  ) {}

  async execute(command: PrepareFirstContactCommand): Promise<PrepareFirstContactResult> {
    if (!SAFE_ID.test(command.idempotencyKey) || !SHA256.test(command.requestFingerprint)) {
      throw new ContactFlowError('INVALID_REQUEST');
    }
    if (!SAFE_ID.test(command.actorId) || !SAFE_ID.test(command.correlationId)) {
      throw new ContactFlowError('INVALID_ACTOR');
    }
    if (!UUID.test(command.leadId)) {
      throw new ContactFlowError('INVALID_LEAD_ID');
    }

    const lead = await this.store.findLead(command.leadId);
    if (!lead) {
      throw new ContactFlowError('LEAD_NOT_FOUND');
    }
    if (lead.status === 'CONTACTED') {
      throw new ContactFlowError('ALREADY_CONTACTED');
    }

    const openReview = await this.store.findOpenReview(lead.id);
    if (openReview) {
      return { ...view(openReview), disposition: 'DUPLICATE' };
    }
    if (lead.status !== 'NEW') {
      throw new ContactFlowError('REVIEW_CLOSED');
    }

    const eligibility = evaluateContactEligibility(lead);
    if (!eligibility.eligible) {
      throw new ContactFlowError('CONTACT_NOT_ELIGIBLE', [eligibility.reasonCode]);
    }

    const reasons = firstContactGuardReasons(SANDBOX_FIRST_CONTACT_DRAFT);
    if (reasons.length > 0) {
      throw new ContactFlowError('MESSAGE_GUARD_REJECTED', reasons);
    }

    const occurredAt = this.clock.now();
    const nextLead = Lead.rehydrate(lead).markContactPending().snapshot();
    const review = this.review(command, lead, occurredAt);
    const planResult = await this.store.commitPreparation({
      idempotencyKey: command.idempotencyKey,
      requestFingerprint: command.requestFingerprint,
      expectedVersion: lead.version,
      leadId: lead.id,
      nextStatus: 'CONTACT_PENDING',
      nextVersion: nextLead.version,
      review,
      audit: this.audit(
        command,
        review.id,
        'FIRST_CONTACT_REQUESTED',
        eligibility.reasonCode,
        occurredAt,
      ),
      event: this.event(command, review, occurredAt),
    });

    return this.result(planResult, review);
  }

  private review(
    command: PrepareFirstContactCommand,
    lead: LeadSnapshot,
    occurredAt: Date,
  ): ContactReviewSnapshot {
    return {
      id: this.ids.next(),
      leadId: lead.id,
      messageId: this.ids.next(),
      status: 'PENDING',
      actorId: command.actorId,
      templateVersion: FIRST_CONTACT_TEMPLATE_VERSION,
      reasonCode: 'ELIGIBLE_SYNTHETIC',
      draft: SANDBOX_FIRST_CONTACT_DRAFT,
      deliveryStatus: 'DRAFT',
      expiresAt: new Date(occurredAt.getTime() + FIRST_CONTACT_REVIEW_TTL_MS),
      correlationId: command.correlationId,
    };
  }

  private audit(
    command: PrepareFirstContactCommand,
    reviewId: string,
    action: string,
    reasonCode: string,
    occurredAt: Date,
  ): AuditRecord {
    return {
      id: this.ids.next(),
      actorId: command.actorId,
      action,
      entityType: 'ContactReview',
      entityId: reviewId,
      reasonCode,
      correlationId: command.correlationId,
      occurredAt,
    };
  }

  private event(
    command: PrepareFirstContactCommand,
    review: ContactReviewSnapshot,
    occurredAt: Date,
  ): ContactEvent {
    return {
      eventId: this.ids.next(),
      eventType: 'ContactReviewOpened',
      eventVersion: 1,
      aggregateType: 'Lead',
      aggregateId: review.leadId,
      occurredAt,
      correlationId: command.correlationId,
      payload: {
        reviewId: review.id,
        leadId: review.leadId,
        templateVersion: review.templateVersion,
        expiresAt: review.expiresAt.toISOString(),
      },
    };
  }

  private result(commit: CommitResult, review: ContactReviewSnapshot): PrepareFirstContactResult {
    if (commit.disposition === 'REPLAY') {
      return { ...view(commit.review), disposition: 'DUPLICATE' };
    }
    return view(review);
  }
}

export { IdempotencyConflictError, LeadVersionConflictError };
