import type {
  CommitResult,
  ContactReviewSnapshot,
  DecisionPlan,
  FirstContactPort,
  PreparationPlan,
} from '@ai-service-broker/contact';
import {
  IdempotencyConflictError,
  LeadVersionConflictError,
  type LeadSnapshot,
  type LeadStatus,
} from '@ai-service-broker/lead';
import type { SqlClient, SqlPool } from '../database';

interface LeadRow extends Record<string, unknown> {
  id: string;
  status: LeadStatus;
  version: number;
  previous_status: LeadStatus | null;
  resume_status: LeadStatus | null;
  source: string;
  source_reference: string;
  phone: string;
  customer_name: string | null;
  city: string | null;
  district: string | null;
  listing_title: string | null;
  listing_text: string | null;
  published_at: Date | null;
  received_at: Date;
  raw_payload_reference: string | null;
}

interface ReviewRow extends Record<string, unknown> {
  id: string;
  lead_id: string;
  message_id: string;
  status: ContactReviewSnapshot['status'];
  actor_id: string;
  template_version: string;
  reason_code: string;
  draft: string;
  delivery_status: ContactReviewSnapshot['deliveryStatus'];
  provider_message_id: string | null;
  expires_at: Date;
  decided_at: Date | null;
  decision_actor_id: string | null;
  correlation_id: string;
}

interface IdempotencyRow extends Record<string, unknown> {
  request_fingerprint: string;
  resource_id: string;
}

function textOrUndefined(value: string | null): string | undefined {
  return value ?? undefined;
}

function toLead(row: LeadRow): LeadSnapshot {
  return {
    id: row.id,
    status: row.status,
    version: Number(row.version),
    previousStatus: row.previous_status ?? undefined,
    resumeStatus: row.resume_status ?? undefined,
    source: row.source,
    sourceReference: row.source_reference,
    phone: row.phone,
    customerName: textOrUndefined(row.customer_name),
    city: textOrUndefined(row.city),
    district: textOrUndefined(row.district),
    listingTitle: textOrUndefined(row.listing_title),
    listingText: textOrUndefined(row.listing_text),
    publishedAt: row.published_at ?? undefined,
    receivedAt: row.received_at,
    rawPayloadReference: textOrUndefined(row.raw_payload_reference),
  };
}

function toReview(row: ReviewRow): ContactReviewSnapshot {
  return {
    id: row.id,
    leadId: row.lead_id,
    messageId: row.message_id,
    status: row.status,
    actorId: row.actor_id,
    templateVersion: row.template_version,
    reasonCode: row.reason_code,
    draft: row.draft,
    deliveryStatus: row.delivery_status,
    providerMessageId: textOrUndefined(row.provider_message_id),
    expiresAt: row.expires_at,
    decidedAt: row.decided_at ?? undefined,
    decisionActorId: textOrUndefined(row.decision_actor_id),
    correlationId: row.correlation_id,
  };
}

const REVIEW_SQL = `
  SELECT
    review.id,
    review.lead_id,
    review.message_id,
    review.status,
    review.actor_id,
    review.template_version,
    review.reason_code,
    message.body AS draft,
    message.delivery_status,
    message.provider_message_id,
    review.expires_at,
    review.decided_at,
    review.decision_actor_id,
    review.correlation_id
  FROM outreach.contact_reviews review
  JOIN outreach.outbound_messages message ON message.review_id = review.id
`;

export class PostgresFirstContactAdapter implements FirstContactPort {
  constructor(private readonly pool: SqlPool) {}

  async findLead(id: string): Promise<LeadSnapshot | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<LeadRow>(
        `
          SELECT
            id, status, version, previous_status, resume_status, source, source_reference, phone, customer_name,
            city, district, listing_title, listing_text, published_at, received_at,
            raw_payload_reference
          FROM acquisition.leads
          WHERE id = $1
        `,
        [id],
      );
      const row = result.rows[0];
      return row ? toLead(row) : null;
    } finally {
      client.release();
    }
  }

  async findOpenReview(leadId: string): Promise<ContactReviewSnapshot | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<ReviewRow>(
        `${REVIEW_SQL} WHERE review.lead_id = $1 AND review.status = 'PENDING'`,
        [leadId],
      );
      const row = result.rows[0];
      return row ? toReview(row) : null;
    } finally {
      client.release();
    }
  }

  async findReview(id: string): Promise<ContactReviewSnapshot | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<ReviewRow>(`${REVIEW_SQL} WHERE review.id = $1`, [id]);
      const row = result.rows[0];
      return row ? toReview(row) : null;
    } finally {
      client.release();
    }
  }

  async commitPreparation(plan: PreparationPlan): Promise<CommitResult> {
    return this.commit('first-contact-prepare', plan, 'NEW');
  }

  async commitDecision(plan: DecisionPlan): Promise<CommitResult> {
    return this.commit('first-contact-decision', plan, 'CONTACT_PENDING');
  }

  private async commit(
    operation: string,
    plan: PreparationPlan | DecisionPlan,
    expectedStatus: LeadStatus,
  ): Promise<CommitResult> {
    const client = await this.pool.connect();
    let transactionOpen = false;
    try {
      await client.query('BEGIN');
      transactionOpen = true;
      const replay = await this.reserve(client, operation, plan);
      if (replay) {
        await client.query('COMMIT');
        transactionOpen = false;
        return replay;
      }

      const updated = await client.query(
        `
          UPDATE acquisition.leads
          SET status = $1, version = $2
          WHERE id = $3 AND version = $4 AND status = $5
        `,
        [plan.nextStatus, plan.nextVersion, plan.leadId, plan.expectedVersion, expectedStatus],
      );
      if (updated.rowCount !== 1) {
        throw new LeadVersionConflictError();
      }

      if (plan.review.status === 'PENDING') {
        await this.insertReview(client, plan.review);
      } else {
        await this.updateReview(client, plan.review);
      }
      await this.insertAudit(client, plan.audit);
      if (plan.event) {
        await client.query(
          `
            INSERT INTO platform.outbox_events (
              event_id, event_type, event_version, aggregate_type, aggregate_id,
              occurred_at, correlation_id, payload
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
          `,
          [
            plan.event.eventId,
            plan.event.eventType,
            plan.event.eventVersion,
            plan.event.aggregateType,
            plan.event.aggregateId,
            plan.event.occurredAt,
            plan.event.correlationId,
            JSON.stringify(plan.event.payload),
          ],
        );
      }

      await client.query('COMMIT');
      transactionOpen = false;
      return { disposition: 'CREATED' };
    } catch (error) {
      if (transactionOpen) {
        await client.query('ROLLBACK');
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private async reserve(
    client: SqlClient,
    operation: string,
    plan: PreparationPlan | DecisionPlan,
  ): Promise<CommitResult | undefined> {
    const inserted = await client.query<IdempotencyRow>(
      `
        INSERT INTO platform.idempotency_keys (
          operation, idempotency_key, request_fingerprint, resource_type, resource_id, disposition
        )
        VALUES ($1, $2, $3, 'ContactReview', $4, 'CREATED')
        ON CONFLICT (operation, idempotency_key) DO NOTHING
        RETURNING request_fingerprint, resource_id
      `,
      [operation, plan.idempotencyKey, plan.requestFingerprint, plan.review.id],
    );
    if (inserted.rowCount !== 0) {
      return undefined;
    }

    const existing = await client.query<IdempotencyRow>(
      `
        SELECT request_fingerprint, resource_id
        FROM platform.idempotency_keys
        WHERE operation = $1 AND idempotency_key = $2
      `,
      [operation, plan.idempotencyKey],
    );
    const row = existing.rows[0];
    if (!row) {
      throw new LeadVersionConflictError();
    }
    if (row.request_fingerprint !== plan.requestFingerprint) {
      throw new IdempotencyConflictError();
    }

    const review = await client.query<ReviewRow>(`${REVIEW_SQL} WHERE review.id = $1`, [
      row.resource_id,
    ]);
    const reviewRow = review.rows[0];
    if (!reviewRow) {
      throw new LeadVersionConflictError();
    }
    return { disposition: 'REPLAY', review: toReview(reviewRow) };
  }

  private async insertReview(client: SqlClient, review: ContactReviewSnapshot): Promise<void> {
    await client.query(
      `
        INSERT INTO outreach.contact_reviews (
          id, lead_id, message_id, status, actor_id, template_version, reason_code,
          expires_at, decided_at, decision_actor_id, correlation_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
      [
        review.id,
        review.leadId,
        review.messageId,
        review.status,
        review.actorId,
        review.templateVersion,
        review.reasonCode,
        review.expiresAt,
        review.decidedAt ?? null,
        review.decisionActorId ?? null,
        review.correlationId,
      ],
    );
    await client.query(
      `
        INSERT INTO outreach.outbound_messages (
          id, review_id, lead_id, channel, template_version, body, delivery_status, provider_message_id
        )
        VALUES ($1, $2, $3, 'MOCK', $4, $5, $6, $7)
      `,
      [
        review.messageId,
        review.id,
        review.leadId,
        review.templateVersion,
        review.draft,
        review.deliveryStatus,
        review.providerMessageId ?? null,
      ],
    );
  }

  private async updateReview(client: SqlClient, review: ContactReviewSnapshot): Promise<void> {
    const updatedReview = await client.query(
      `
        UPDATE outreach.contact_reviews
        SET status = $1, decided_at = $2, decision_actor_id = $3
        WHERE id = $4 AND status = 'PENDING'
      `,
      [review.status, review.decidedAt ?? null, review.decisionActorId ?? null, review.id],
    );
    const updatedMessage = await client.query(
      `
        UPDATE outreach.outbound_messages
        SET delivery_status = $1, provider_message_id = $2
        WHERE review_id = $3 AND delivery_status = 'DRAFT'
      `,
      [review.deliveryStatus, review.providerMessageId ?? null, review.id],
    );
    if (updatedReview.rowCount !== 1 || updatedMessage.rowCount !== 1) {
      throw new LeadVersionConflictError();
    }
  }

  private async insertAudit(client: SqlClient, audit: PreparationPlan['audit']): Promise<void> {
    await client.query(
      `
        INSERT INTO audit.entries (
          id, actor_id, action, entity_type, entity_id, reason_code, correlation_id, occurred_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        audit.id,
        audit.actorId,
        audit.action,
        audit.entityType,
        audit.entityId,
        audit.reasonCode,
        audit.correlationId,
        audit.occurredAt,
      ],
    );
  }
}
