import type { LeadDirectory, LeadStatus, LeadSummary } from '@ai-service-broker/lead';
import {
  canRedrive,
  type OutboxMessage,
  type OutboxRedrive,
  type RedriveResult,
} from '@ai-service-broker/outbox';
import {
  RequirementConflictError,
  type NewRequirement,
  type RequirementStore,
  type StoredRequirement,
} from '@ai-service-broker/requirement';
import type { NewRisk, RiskStore, StoredRisk } from '@ai-service-broker/safety';
import type { SqlClient, SqlPool } from '../database';

interface RequirementRow extends Record<string, unknown> {
  id: string;
  lead_id: string;
  version: number;
  schema_version: 'regular-home-helper-v1';
  fields: Record<string, string>;
  special_requirements: StoredRequirement['snapshot']['specialRequirements'];
  missing_fields: string[];
  contradictions: string[];
  evidence_count: number;
  ready: boolean;
  idempotency_key: string;
  request_fingerprint: string;
}

interface RiskRow extends Record<string, unknown> {
  id: string;
  lead_id: string;
  code: StoredRisk['signal']['code'];
  severity: StoredRisk['signal']['severity'];
  disposition: 'REVIEW';
  idempotency_key: string;
  request_fingerprint: string;
}

interface SummaryRow extends Record<string, unknown> {
  id: string;
  status: LeadStatus;
  version: number;
  phone: string;
  source: string;
}

interface VersionRow extends Record<string, unknown> {
  version: number;
}

interface CountRow extends Record<string, unknown> {
  status: string;
  count: number;
}

interface OutboxRow extends Record<string, unknown> {
  event_id: string;
  event_type: string;
  event_version: number;
  aggregate_type: string;
  aggregate_id: string;
  occurred_at: Date;
  correlation_id: string;
  payload: Record<string, unknown>;
  attempts: number;
  published_at: Date | null;
  last_error: string | null;
}

export class PostgresOperationsStore implements LeadDirectory, OutboxRedrive {
  constructor(private readonly pool: SqlPool) {}

  async findRequirement(idempotencyKey: string): Promise<StoredRequirement | null> {
    const client = await this.pool.connect();
    try {
      const found = await client.query<RequirementRow>(
        `
          SELECT
            id, lead_id, version, schema_version, fields, special_requirements,
            missing_fields, contradictions, evidence_count, ready, idempotency_key,
            request_fingerprint
          FROM requirement.versions
          WHERE idempotency_key = $1
        `,
        [idempotencyKey],
      );
      return found.rows[0] ? toRequirement(found.rows[0]) : null;
    } finally {
      client.release();
    }
  }

  async latestRequirement(leadId: string): Promise<StoredRequirement | null> {
    const client = await this.pool.connect();
    try {
      const found = await client.query<RequirementRow>(
        `
          SELECT
            id, lead_id, version, schema_version, fields, special_requirements,
            missing_fields, contradictions, evidence_count, ready, idempotency_key,
            request_fingerprint
          FROM requirement.versions
          WHERE lead_id = $1
          ORDER BY version DESC
          LIMIT 1
        `,
        [leadId],
      );
      return found.rows[0] ? toRequirement(found.rows[0]) : null;
    } finally {
      client.release();
    }
  }

  async saveRequirement(input: NewRequirement): Promise<StoredRequirement> {
    const client = await this.pool.connect();
    let open = false;
    try {
      await client.query('BEGIN');
      open = true;
      const existing = await client.query<RequirementRow>(
        `
          SELECT
            id, lead_id, version, schema_version, fields, special_requirements,
            missing_fields, contradictions, evidence_count, ready, idempotency_key,
            request_fingerprint
          FROM requirement.versions
          WHERE idempotency_key = $1
        `,
        [input.idempotencyKey],
      );
      const stored = existing.rows[0];
      if (stored) {
        await client.query('ROLLBACK');
        open = false;
        if (stored.request_fingerprint.trim() !== input.fingerprint) {
          throw new RequirementConflictError('IDEMPOTENCY_CONFLICT');
        }
        throw new RequirementConflictError('IDEMPOTENCY_KEY_REUSED');
      }

      await client.query(`SELECT id FROM acquisition.leads WHERE id = $1 FOR UPDATE`, [
        input.leadId,
      ]);
      const versions = await client.query<VersionRow>(
        `
          SELECT version
          FROM requirement.versions
          WHERE lead_id = $1
          ORDER BY version DESC
          LIMIT 1
        `,
        [input.leadId],
      );
      const version = Number(versions.rows[0]?.version ?? 0) + 1;
      const snapshot = { ...input.snapshot, version };
      await client.query(
        `
          INSERT INTO requirement.versions (
            id, lead_id, version, schema_version, fields, special_requirements,
            missing_fields, contradictions, evidence_count, ready, days_per_week,
            working_hours, start_date, idempotency_key, request_fingerprint
          )
          VALUES (
            $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10,
            $11, $12, $13, $14, $15
          )
        `,
        [
          input.id,
          input.leadId,
          version,
          snapshot.schemaVersion,
          JSON.stringify(snapshot.confirmed),
          JSON.stringify(snapshot.specialRequirements),
          JSON.stringify(snapshot.missingFields),
          JSON.stringify(snapshot.contradictions),
          snapshot.evidenceCount,
          snapshot.ready,
          snapshot.confirmed.days_per_week ? Number(snapshot.confirmed.days_per_week) : null,
          snapshot.confirmed.working_hours ?? null,
          snapshot.confirmed.start_date ?? null,
          input.idempotencyKey,
          input.fingerprint,
        ],
      );
      await client.query(
        `
          INSERT INTO platform.outbox_events (
            event_id, event_type, event_version, aggregate_type, aggregate_id,
            occurred_at, correlation_id, payload
          )
          VALUES ($1, 'RequirementVersionRecorded', 1, 'Lead', $2, $3, $4, $5::jsonb)
        `,
        [
          input.id,
          input.leadId,
          input.occurredAt,
          input.correlationId,
          JSON.stringify({
            leadId: input.leadId,
            requirementVersion: version,
            schemaVersion: snapshot.schemaVersion,
            ready: snapshot.ready,
            missingCount: snapshot.missingFields.length,
          }),
        ],
      );
      await writeAudit(client, {
        id: input.id,
        actorId: input.actorId,
        action: 'REQUIREMENT_VERSION_RECORDED',
        entityId: input.leadId,
        correlationId: input.correlationId,
        occurredAt: input.occurredAt,
      });
      await client.query('COMMIT');
      return {
        id: input.id,
        leadId: input.leadId,
        idempotencyKey: input.idempotencyKey,
        fingerprint: input.fingerprint,
        snapshot,
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

  async findSummary(id: string): Promise<LeadSummary | null> {
    const client = await this.pool.connect();
    try {
      const found = await client.query<SummaryRow>(
        `
          SELECT id, status, version, phone, source
          FROM acquisition.leads
          WHERE id = $1
        `,
        [id],
      );
      const row = found.rows[0];
      return row ? toSummary(row) : null;
    } finally {
      client.release();
    }
  }

  async listByStatus(status: LeadStatus): Promise<LeadSummary[]> {
    const client = await this.pool.connect();
    try {
      const found = await client.query<SummaryRow>(
        `
          SELECT id, status, version, phone, source
          FROM acquisition.leads
          WHERE status = $1
          ORDER BY id
        `,
        [status],
      );
      return found.rows.map(toSummary);
    } finally {
      client.release();
    }
  }

  async countByStatus(): Promise<Array<{ status: string; count: number }>> {
    const client = await this.pool.connect();
    try {
      const found = await client.query<CountRow>(
        `
          SELECT status, count(*)::int AS count
          FROM acquisition.leads
          GROUP BY status
        `,
      );
      return found.rows.map((row) => ({ status: row.status, count: Number(row.count) }));
    } finally {
      client.release();
    }
  }

  async findRisk(idempotencyKey: string): Promise<StoredRisk | null> {
    const client = await this.pool.connect();
    try {
      const found = await client.query<RiskRow>(
        `
          SELECT id, lead_id, code, severity, disposition, idempotency_key, request_fingerprint
          FROM safety.risk_signals
          WHERE idempotency_key = $1
        `,
        [idempotencyKey],
      );
      const row = found.rows[0];
      return row
        ? {
            id: row.id,
            leadId: row.lead_id,
            idempotencyKey: row.idempotency_key,
            fingerprint: row.request_fingerprint.trim(),
            signal: { code: row.code, severity: row.severity },
            disposition: 'REVIEW',
          }
        : null;
    } finally {
      client.release();
    }
  }

  async countRisks(): Promise<number> {
    const client = await this.pool.connect();
    try {
      const found = await client.query<{ count: number } & Record<string, unknown>>(
        `SELECT count(*)::int AS count FROM safety.risk_signals`,
      );
      return Number(found.rows[0]?.count ?? 0);
    } finally {
      client.release();
    }
  }

  async saveRisk(input: NewRisk): Promise<StoredRisk> {
    const client = await this.pool.connect();
    let open = false;
    try {
      await client.query('BEGIN');
      open = true;
      const existing = await client.query<RiskRow>(
        `
          SELECT id, lead_id, code, severity, disposition, idempotency_key, request_fingerprint
          FROM safety.risk_signals
          WHERE idempotency_key = $1
        `,
        [input.idempotencyKey],
      );
      if (existing.rows[0]) {
        await client.query('ROLLBACK');
        open = false;
        throw new Error('IDEMPOTENCY_KEY_REUSED');
      }
      await client.query(
        `
          INSERT INTO safety.risk_signals (
            id, lead_id, code, severity, disposition, idempotency_key, request_fingerprint
          )
          VALUES ($1, $2, $3, $4, 'REVIEW', $5, $6)
        `,
        [
          input.id,
          input.leadId,
          input.signal.code,
          input.signal.severity,
          input.idempotencyKey,
          input.fingerprint,
        ],
      );
      await client.query(
        `
          INSERT INTO platform.outbox_events (
            event_id, event_type, event_version, aggregate_type, aggregate_id,
            occurred_at, correlation_id, payload
          )
          VALUES ($1, 'RiskSignalRecorded', 1, 'Lead', $2, $3, $4, $5::jsonb)
        `,
        [
          input.id,
          input.leadId,
          input.occurredAt,
          input.correlationId,
          JSON.stringify({
            leadId: input.leadId,
            code: input.signal.code,
            severity: input.signal.severity,
            disposition: 'REVIEW',
          }),
        ],
      );
      await writeAudit(client, {
        id: input.id,
        actorId: input.actorId,
        action: 'RISK_SIGNAL_RECORDED',
        entityId: input.leadId,
        correlationId: input.correlationId,
        occurredAt: input.occurredAt,
      });
      await client.query('COMMIT');
      return {
        id: input.id,
        leadId: input.leadId,
        idempotencyKey: input.idempotencyKey,
        fingerprint: input.fingerprint,
        signal: input.signal,
        disposition: 'REVIEW',
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

  async redrive(input: {
    eventId: string;
    auditId: string;
    actorId: string;
    correlationId: string;
    occurredAt: Date;
  }): Promise<RedriveResult> {
    const client = await this.pool.connect();
    let open = false;
    try {
      await client.query('BEGIN');
      open = true;
      const found = await client.query<OutboxRow>(
        `
          SELECT
            event_id, event_type, event_version, aggregate_type, aggregate_id,
            occurred_at, correlation_id, payload, attempts, published_at, last_error
          FROM platform.outbox_events
          WHERE event_id = $1
          FOR UPDATE
        `,
        [input.eventId],
      );
      const row = found.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return { ok: false, code: 'NOT_FOUND' };
      }
      const message: OutboxMessage = {
        eventId: row.event_id,
        eventType: row.event_type,
        eventVersion: Number(row.event_version),
        aggregateType: row.aggregate_type,
        aggregateId: row.aggregate_id,
        occurredAt: row.occurred_at,
        correlationId: row.correlation_id,
        payload: row.payload,
        attempts: Number(row.attempts),
        availableAt: new Date(0),
      };
      if (row.published_at || !row.last_error || !canRedrive(message)) {
        await client.query('ROLLBACK');
        return { ok: false, code: 'NOT_REDRIVABLE' };
      }
      const updated = await client.query(
        `
          UPDATE platform.outbox_events
          SET attempts = 0, available_at = $2, last_error = NULL
          WHERE event_id = $1 AND published_at IS NULL
        `,
        [input.eventId, input.occurredAt],
      );
      if (updated.rowCount !== 1) {
        await client.query('ROLLBACK');
        return { ok: false, code: 'NOT_REDRIVABLE' };
      }
      await writeAudit(client, {
        id: input.auditId,
        actorId: input.actorId,
        action: 'OUTBOX_REDRIVEN',
        entityId: row.aggregate_id,
        correlationId: input.correlationId,
        occurredAt: input.occurredAt,
      });
      await client.query('COMMIT');
      return { ok: true, disposition: 'REQUEUED' };
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

async function writeAudit(
  client: SqlClient,
  audit: {
    id: string;
    actorId: string;
    action: string;
    entityId: string;
    correlationId: string;
    occurredAt: Date;
  },
): Promise<void> {
  await client.query(
    `
      INSERT INTO audit.entries (
        id, actor_id, action, entity_type, entity_id, reason_code, correlation_id, occurred_at
      )
      VALUES ($1, $2, $3, 'Lead', $4, 'NONE', $5, $6)
    `,
    [audit.id, audit.actorId, audit.action, audit.entityId, audit.correlationId, audit.occurredAt],
  );
}

function toRequirement(row: RequirementRow): StoredRequirement {
  return {
    id: row.id,
    leadId: row.lead_id,
    idempotencyKey: row.idempotency_key,
    fingerprint: row.request_fingerprint.trim(),
    snapshot: {
      version: Number(row.version),
      schemaVersion: row.schema_version,
      confirmed: row.fields,
      evidenceCount: Number(row.evidence_count),
      specialRequirements: row.special_requirements,
      missingFields: row.missing_fields,
      contradictions: row.contradictions,
      ready: row.ready,
    },
  };
}

function toSummary(row: SummaryRow): LeadSummary {
  return {
    id: row.id,
    status: row.status,
    version: Number(row.version),
    phone: row.phone,
    source: row.source,
  };
}

export function asRequirementStore(store: PostgresOperationsStore): RequirementStore {
  return {
    findByKey: (idempotencyKey) => store.findRequirement(idempotencyKey),
    latestForLead: (leadId) => store.latestRequirement(leadId),
    save: (input) => store.saveRequirement(input),
  };
}

export function asRiskStore(store: PostgresOperationsStore): RiskStore {
  return {
    findByKey: (idempotencyKey) => store.findRisk(idempotencyKey),
    count: () => store.countRisks(),
    save: (input) => store.saveRisk(input),
  };
}
