import {
  CommercialConflictError,
  type CommercialKind,
  type CommercialRecord,
  type CommercialStore,
  type CommercialValue,
} from '@ai-service-broker/safety';
import type { SqlPool } from '../database';

interface CommercialRow extends Record<string, unknown> {
  id: string;
  lead_id: string | null;
  kind: CommercialKind;
  idempotency_key: string;
  fingerprint: string;
  payload: Record<string, CommercialValue>;
}

export class PostgresCommercialStore implements CommercialStore {
  constructor(private readonly pool: SqlPool) {}

  async findByKey(kind: CommercialKind, idempotencyKey: string): Promise<CommercialRecord | null> {
    const client = await this.pool.connect();
    try {
      const found = await client.query<CommercialRow>(
        `
          SELECT id, lead_id, kind, idempotency_key, fingerprint, payload
          FROM commercial.records
          WHERE kind = $1 AND idempotency_key = $2
        `,
        [kind, idempotencyKey],
      );
      const row = found.rows[0];
      return row ? toRecord(row) : null;
    } finally {
      client.release();
    }
  }

  async listForLead(leadId: string, kind: CommercialKind): Promise<CommercialRecord[]> {
    const client = await this.pool.connect();
    try {
      const found = await client.query<CommercialRow>(
        `
          SELECT id, lead_id, kind, idempotency_key, fingerprint, payload
          FROM commercial.records
          WHERE lead_id = $1 AND kind = $2
          ORDER BY created_at ASC
        `,
        [leadId, kind],
      );
      return found.rows.map(toRecord);
    } finally {
      client.release();
    }
  }

  async save(record: CommercialRecord): Promise<'CREATED' | 'DUPLICATE'> {
    const client = await this.pool.connect();
    try {
      const inserted = await client.query(
        `
          INSERT INTO commercial.records (
            id, lead_id, kind, idempotency_key, fingerprint, payload
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb)
          ON CONFLICT (kind, idempotency_key) DO NOTHING
        `,
        [
          record.id,
          record.leadId,
          record.kind,
          record.idempotencyKey,
          record.fingerprint,
          JSON.stringify(record.payload),
        ],
      );
      if (inserted.rowCount === 1) {
        return 'CREATED';
      }
      const found = await client.query<CommercialRow>(
        `
          SELECT id, lead_id, kind, idempotency_key, fingerprint, payload
          FROM commercial.records
          WHERE kind = $1 AND idempotency_key = $2
        `,
        [record.kind, record.idempotencyKey],
      );
      const existing = found.rows[0] ? toRecord(found.rows[0]) : null;
      if (!existing || existing.fingerprint !== record.fingerprint) {
        throw new CommercialConflictError();
      }
      return 'DUPLICATE';
    } finally {
      client.release();
    }
  }
}

function toRecord(row: CommercialRow): CommercialRecord {
  return {
    id: row.id,
    leadId: row.lead_id,
    kind: row.kind,
    idempotencyKey: row.idempotency_key,
    fingerprint: row.fingerprint,
    payload: row.payload,
  };
}
