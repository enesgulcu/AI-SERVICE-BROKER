import {
  IdempotencyConflictError,
  Lead,
  LeadVersionConflictError,
  type LeadSnapshot,
  type LeadStatusStore,
} from '@ai-service-broker/lead';
import type {
  AuditRecord,
  CommitResult,
  ContactEvent,
  ContactReviewSnapshot,
  DecisionPlan,
  FirstContactPort,
  PreparationPlan,
} from '../application/first-contact.port';

interface IdempotencyRecord {
  fingerprint: string;
  reviewId: string;
}

function cloneReview(review: ContactReviewSnapshot): ContactReviewSnapshot {
  return {
    ...review,
    expiresAt: new Date(review.expiresAt),
    decidedAt: review.decidedAt ? new Date(review.decidedAt) : undefined,
  };
}

export class InMemoryFirstContactAdapter implements FirstContactPort {
  readonly events: ContactEvent[] = [];
  readonly audits: AuditRecord[] = [];
  private readonly reviews = new Map<string, ContactReviewSnapshot>();
  private readonly idempotency = new Map<string, IdempotencyRecord>();

  constructor(private readonly leads: LeadStatusStore) {}

  findLead(id: string): Promise<LeadSnapshot | null> {
    return this.leads.findById(id);
  }

  async findOpenReview(leadId: string): Promise<ContactReviewSnapshot | null> {
    const review = [...this.reviews.values()].find(
      (candidate) => candidate.leadId === leadId && candidate.status === 'PENDING',
    );
    return Promise.resolve(review ? cloneReview(review) : null);
  }

  async findReview(id: string): Promise<ContactReviewSnapshot | null> {
    const review = this.reviews.get(id);
    return Promise.resolve(review ? cloneReview(review) : null);
  }

  async commitPreparation(plan: PreparationPlan): Promise<CommitResult> {
    const replay = this.recall(
      'first-contact-prepare',
      plan.idempotencyKey,
      plan.requestFingerprint,
    );
    if (replay) {
      return this.replay(replay.reviewId);
    }

    const current = await this.currentLead(plan.leadId, plan.expectedVersion);
    await this.leads.save(Lead.rehydrate(current).markContactPending().snapshot());
    this.reviews.set(plan.review.id, cloneReview(plan.review));
    this.remember(
      'first-contact-prepare',
      plan.idempotencyKey,
      plan.requestFingerprint,
      plan.review.id,
    );
    this.record(plan.audit, plan.event);
    return { disposition: 'CREATED' };
  }

  async commitDecision(plan: DecisionPlan): Promise<CommitResult> {
    const replay = this.recall(
      'first-contact-decision',
      plan.idempotencyKey,
      plan.requestFingerprint,
    );
    if (replay) {
      return this.replay(replay.reviewId);
    }

    const current = await this.currentLead(plan.leadId, plan.expectedVersion);
    const rehydrated = Lead.rehydrate(current);
    const next =
      plan.nextStatus === 'CONTACTED' ? rehydrated.markContacted() : rehydrated.releaseToNew();
    await this.leads.save(next.snapshot());
    this.reviews.set(plan.review.id, cloneReview(plan.review));
    this.remember(
      'first-contact-decision',
      plan.idempotencyKey,
      plan.requestFingerprint,
      plan.review.id,
    );
    this.record(plan.audit, plan.event);
    return { disposition: 'CREATED' };
  }

  private async currentLead(leadId: string, expectedVersion: number): Promise<LeadSnapshot> {
    const current = await this.leads.findById(leadId);
    if (!current || current.version !== expectedVersion) {
      throw new LeadVersionConflictError();
    }
    return current;
  }

  private recall(
    operation: string,
    key: string,
    fingerprint: string,
  ): IdempotencyRecord | undefined {
    const existing = this.idempotency.get(`${operation}:${key}`);
    if (!existing) {
      return undefined;
    }
    if (existing.fingerprint !== fingerprint) {
      throw new IdempotencyConflictError();
    }
    return existing;
  }

  private remember(operation: string, key: string, fingerprint: string, reviewId: string): void {
    this.idempotency.set(`${operation}:${key}`, { fingerprint, reviewId });
  }

  private record(audit: AuditRecord, event: ContactEvent | null): void {
    this.audits.push({ ...audit, occurredAt: new Date(audit.occurredAt) });
    if (event) {
      this.events.push({
        ...event,
        occurredAt: new Date(event.occurredAt),
        payload: { ...event.payload },
      });
    }
  }

  private replay(reviewId: string): CommitResult {
    const review = this.reviews.get(reviewId);
    if (!review) {
      throw new LeadVersionConflictError();
    }
    return { disposition: 'REPLAY', review: cloneReview(review) };
  }
}
