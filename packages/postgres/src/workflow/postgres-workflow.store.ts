import {
  Lead,
  decideWorkflowMove,
  type ClosedLostReason,
  type LeadSnapshot,
  type LeadStatus,
} from '@ai-service-broker/lead';
import {
  isWorkflowSource,
  workflowAudit,
  workflowEvent,
  type WorkflowCommit,
  type WorkflowStore,
  type WorkflowWrite,
} from '@ai-service-broker/workflow';
import type { SqlPool } from '../database';

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

interface IdempotencyRow extends Record<string, unknown> {
  request_fingerprint: string;
  resource_id: string;
}

interface ChangeRow extends Record<string, unknown> {
  from_status: LeadStatus;
  to_status: LeadStatus;
  version: number;
  reason_code: ClosedLostReason | 'NONE';
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

export class PostgresWorkflowStore implements WorkflowStore {
  constructor(private readonly pool: SqlPool) {}

  async findLead(id: string): Promise<LeadSnapshot | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<LeadRow>(
        `
          SELECT
            id, status, version, previous_status, resume_status, source, source_reference, phone,
            customer_name, city, district, listing_title, listing_text, published_at, received_at,
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

  async commit(write: WorkflowWrite): Promise<WorkflowCommit> {
    const client = await this.pool.connect();
    let open = false;
    try {
      await client.query('BEGIN');
      open = true;
      const existing = await client.query<IdempotencyRow>(
        `
          SELECT request_fingerprint, resource_id
          FROM platform.idempotency_keys
          WHERE operation = 'workflow.transition' AND idempotency_key = $1
        `,
        [write.idempotencyKey],
      );
      const existingKey = existing.rows[0];
      if (existingKey) {
        if (existingKey.request_fingerprint.trim() !== write.requestFingerprint) {
          await client.query('ROLLBACK');
          return { disposition: 'IDEMPOTENCY_CONFLICT' };
        }
        const stored = await client.query<ChangeRow>(
          `
            SELECT from_status, to_status, version, reason_code
            FROM workflow.transitions
            WHERE id = $1
          `,
          [existingKey.resource_id],
        );
        const change = stored.rows[0];
        await client.query('COMMIT');
        if (!change) {
          throw new Error('Stored workflow transition is missing');
        }
        return {
          disposition: 'DUPLICATE',
          fromStatus: change.from_status,
          toStatus: change.to_status,
          version: Number(change.version),
          reasonCode: change.reason_code,
        };
      }

      const found = await client.query<LeadRow>(
        `
          SELECT
            id, status, version, previous_status, resume_status, source, source_reference, phone,
            customer_name, city, district, listing_title, listing_text, published_at, received_at,
            raw_payload_reference
          FROM acquisition.leads
          WHERE id = $1
          FOR UPDATE
        `,
        [write.leadId],
      );
      const row = found.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return { disposition: 'NOT_FOUND' };
      }
      const lead = toLead(row);
      if (!isWorkflowSource(lead.source)) {
        await client.query('ROLLBACK');
        return { disposition: 'NOT_ELIGIBLE' };
      }
      if (lead.version !== write.expectedVersion) {
        await client.query('ROLLBACK');
        return { disposition: 'VERSION_CONFLICT' };
      }
      const decision = decideWorkflowMove({
        from: lead.status,
        to: write.toStatus,
        previousStatus: lead.previousStatus ?? null,
        resumeStatus: lead.resumeStatus ?? null,
        reasonCode: write.reasonCode,
        requirementsReady: write.requirementsReady,
      });
      if (!decision.ok) {
        await client.query('ROLLBACK');
        return { disposition: 'REJECTED', code: decision.code, gate: decision.gate };
      }

      const moved = Lead.rehydrate(lead)
        .applyWorkflowMove(write.toStatus, write.reasonCode, write.requirementsReady)
        .snapshot();
      const updated = await client.query(
        `
          UPDATE acquisition.leads
          SET status = $1, version = $2, previous_status = $3, resume_status = $4
          WHERE id = $5 AND version = $6 AND status = $7
        `,
        [
          moved.status,
          moved.version,
          moved.previousStatus ?? null,
          moved.resumeStatus ?? null,
          lead.id,
          lead.version,
          lead.status,
        ],
      );
      if (updated.rowCount !== 1) {
        await client.query('ROLLBACK');
        return { disposition: 'VERSION_CONFLICT' };
      }

      await client.query(
        `
          INSERT INTO workflow.transitions (
            id, lead_id, from_status, to_status, version, reason_code, actor_id, correlation_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          write.eventId,
          lead.id,
          lead.status,
          moved.status,
          moved.version,
          decision.reasonCode,
          write.actorId,
          write.correlationId,
        ],
      );
      const event = workflowEvent(lead, write);
      await client.query(
        `
          INSERT INTO platform.outbox_events (
            event_id, event_type, event_version, aggregate_type, aggregate_id,
            occurred_at, correlation_id, payload
          )
          VALUES ($1, $2, 1, 'Lead', $3, $4, $5, $6::jsonb)
        `,
        [
          event.eventId,
          event.eventType,
          event.aggregateId,
          event.occurredAt,
          event.correlationId,
          JSON.stringify(event.payload),
        ],
      );
      const audit = workflowAudit(lead, write);
      await client.query(
        `
          INSERT INTO audit.entries (
            id, actor_id, action, entity_type, entity_id, reason_code, correlation_id, occurred_at
          )
          VALUES ($1, $2, $3, 'Lead', $4, $5, $6, $7)
        `,
        [
          audit.id,
          audit.actorId,
          audit.action,
          audit.entityId,
          audit.reasonCode,
          audit.correlationId,
          audit.occurredAt,
        ],
      );
      await client.query(
        `
          INSERT INTO platform.idempotency_keys (
            operation, idempotency_key, request_fingerprint, resource_type, resource_id, disposition
          )
          VALUES ('workflow.transition', $1, $2, 'Lead', $3, 'CREATED')
        `,
        [write.idempotencyKey, write.requestFingerprint, write.eventId],
      );
      await client.query('COMMIT');
      open = false;
      return {
        disposition: 'CHANGED',
        fromStatus: lead.status,
        toStatus: moved.status,
        version: moved.version,
        reasonCode: decision.reasonCode,
      };
    } catch (error) {
      if (open) {
        await client.query('ROLLBACK');
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
