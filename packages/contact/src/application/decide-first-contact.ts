import { IdempotencyConflictError, Lead, LeadVersionConflictError } from '@ai-service-broker/lead';
import { assessOutbound } from '@ai-service-broker/messaging';
import { isApprovedContactSource } from '../domain/eligibility';
import { guardFirstContactDraft } from '../domain/first-contact-draft';
import {
  ContactFlowError,
  type AuditRecord,
  type ContactEvent,
  type ContactReviewSnapshot,
  type DecisionPlan,
  type FirstContactPort,
} from './first-contact.port';

export interface DecideFirstContactCommand {
  idempotencyKey: string;
  requestFingerprint: string;
  correlationId: string;
  actorId: string;
  reviewId: string;
  decision: 'APPROVE' | 'REJECT';
  automationPaused?: boolean;
}

export interface DecideFirstContactResult {
  disposition: 'APPROVED' | 'REJECTED' | 'DUPLICATE';
  reviewId: string;
  leadId: string;
  delivery: 'MOCK_ACCEPTED' | 'NOT_SENT';
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

function response(review: ContactReviewSnapshot, duplicate: boolean): DecideFirstContactResult {
  return {
    disposition: duplicate ? 'DUPLICATE' : review.status === 'APPROVED' ? 'APPROVED' : 'REJECTED',
    reviewId: review.id,
    leadId: review.leadId,
    delivery: review.deliveryStatus === 'MOCK_ACCEPTED' ? 'MOCK_ACCEPTED' : 'NOT_SENT',
  };
}

export class DecideFirstContact {
  constructor(
    private readonly store: FirstContactPort,
    private readonly clock: Clock,
    private readonly ids: IdSource,
  ) {}

  async execute(command: DecideFirstContactCommand): Promise<DecideFirstContactResult> {
    if (!SAFE_ID.test(command.idempotencyKey) || !SHA256.test(command.requestFingerprint)) {
      throw new ContactFlowError('INVALID_REQUEST');
    }
    if (!SAFE_ID.test(command.actorId) || !SAFE_ID.test(command.correlationId)) {
      throw new ContactFlowError('INVALID_ACTOR');
    }
    if (!UUID.test(command.reviewId)) {
      throw new ContactFlowError('INVALID_REVIEW_ID');
    }

    const review = await this.store.findReview(command.reviewId);
    if (!review) {
      throw new ContactFlowError('REVIEW_NOT_FOUND');
    }
    if (review.status === 'APPROVED') {
      return response(review, true);
    }
    if (review.status !== 'PENDING') {
      throw new ContactFlowError('REVIEW_CLOSED');
    }

    const lead = await this.store.findLead(review.leadId);
    if (!lead || lead.status !== 'CONTACT_PENDING') {
      throw new ContactFlowError('REVIEW_CLOSED');
    }

    const occurredAt = this.clock.now();
    if (review.expiresAt.getTime() <= occurredAt.getTime()) {
      await this.commit(command, review, lead.version, 'EXPIRED', occurredAt);
      throw new ContactFlowError('REVIEW_EXPIRED');
    }

    if (command.decision === 'APPROVE') {
      if (!isApprovedContactSource(lead.source)) {
        throw new ContactFlowError('CONTACT_NOT_ELIGIBLE', ['SOURCE_NOT_APPROVED']);
      }
      const reasons = guardFirstContactDraft(review.draft);
      if (reasons.length > 0) {
        throw new ContactFlowError('MESSAGE_GUARD_REJECTED', reasons);
      }
      const delivery = assessOutbound({
        channel: 'MOCK',
        origin: 'HUMAN',
        controlMode: 'AI_ACTIVE',
        automationPaused: command.automationPaused === true,
        templateApproved: true,
      });
      if (!delivery.ok) {
        throw new ContactFlowError('MESSAGE_GUARD_REJECTED', [delivery.code]);
      }
    }

    const saved = await this.commit(
      command,
      review,
      lead.version,
      command.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      occurredAt,
    );
    return response(saved.review, saved.replay);
  }

  private async commit(
    command: DecideFirstContactCommand,
    review: ContactReviewSnapshot,
    expectedVersion: number,
    status: 'APPROVED' | 'REJECTED' | 'EXPIRED',
    occurredAt: Date,
  ): Promise<{ review: ContactReviewSnapshot; replay: boolean }> {
    const lead = await this.store.findLead(review.leadId);
    if (!lead) {
      throw new ContactFlowError('LEAD_NOT_FOUND');
    }

    const nextLead =
      status === 'APPROVED'
        ? Lead.rehydrate(lead).markContacted().snapshot()
        : Lead.rehydrate(lead).releaseToNew().snapshot();
    const nextReview: ContactReviewSnapshot = {
      ...review,
      status,
      decidedAt: occurredAt,
      decisionActorId: command.actorId,
      deliveryStatus: status === 'APPROVED' ? 'MOCK_ACCEPTED' : 'NOT_SENT',
      providerMessageId: status === 'APPROVED' ? `mock:${review.messageId}` : undefined,
      expiresAt: new Date(review.expiresAt),
    };
    const event =
      status === 'APPROVED' ? this.contactedEvent(command, nextReview, occurredAt) : null;
    const plan: DecisionPlan = {
      idempotencyKey: command.idempotencyKey,
      requestFingerprint: command.requestFingerprint,
      expectedVersion,
      leadId: lead.id,
      nextStatus: nextLead.status === 'CONTACTED' ? 'CONTACTED' : 'NEW',
      nextVersion: nextLead.version,
      review: nextReview,
      audit: this.audit(command, nextReview, occurredAt),
      event,
    };
    const committed = await this.store.commitDecision(plan);
    if (committed.disposition === 'REPLAY') {
      return { review: committed.review, replay: true };
    }
    return { review: nextReview, replay: false };
  }

  private audit(
    command: DecideFirstContactCommand,
    review: ContactReviewSnapshot,
    occurredAt: Date,
  ): AuditRecord {
    const reasonCode =
      review.status === 'APPROVED'
        ? 'FIRST_CONTACT_APPROVED'
        : review.status === 'EXPIRED'
          ? 'REVIEW_EXPIRED'
          : 'HUMAN_REJECTED_FIRST_CONTACT';
    return {
      id: this.ids.next(),
      actorId: command.actorId,
      action: reasonCode,
      entityType: 'ContactReview',
      entityId: review.id,
      reasonCode,
      correlationId: command.correlationId,
      occurredAt,
    };
  }

  private contactedEvent(
    command: DecideFirstContactCommand,
    review: ContactReviewSnapshot,
    occurredAt: Date,
  ): ContactEvent {
    return {
      eventId: this.ids.next(),
      eventType: 'LeadContacted',
      eventVersion: 1,
      aggregateType: 'Lead',
      aggregateId: review.leadId,
      occurredAt,
      correlationId: command.correlationId,
      payload: {
        reviewId: review.id,
        leadId: review.leadId,
        channel: 'MOCK',
        templateVersion: review.templateVersion,
      },
    };
  }
}

export { IdempotencyConflictError, LeadVersionConflictError };
