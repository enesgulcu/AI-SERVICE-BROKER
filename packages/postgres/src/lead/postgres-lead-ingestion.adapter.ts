import type {
  CreateLeadTransaction,
  CreateLeadTransactionResult,
  LeadIngestionPort,
} from '@ai-service-broker/lead';
import type { SqlClient, SqlPool } from '../database';

interface IdempotencyRow extends Record<string, unknown> {
  request_fingerprint: string;
  resource_id: string;
}

interface LeadIdRow extends Record<string, unknown> {
  id: string;
}

export class IdempotencyConflictError extends Error {
  constructor() {
    super('IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST');
    this.name = IdempotencyConflictError.name;
  }
}

export class PersistenceInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = PersistenceInvariantError.name;
  }
}

export class PostgresLeadIngestionAdapter implements LeadIngestionPort {
  constructor(private readonly pool: SqlPool) {}

  async createLeadWithOutbox(
    transaction: CreateLeadTransaction,
  ): Promise<CreateLeadTransactionResult> {
    const client = await this.pool.connect();
    let transactionOpen = false;

    try {
      await client.query('BEGIN');
      transactionOpen = true;

      const reservation = await client.query<IdempotencyRow>(
        `
          INSERT INTO platform.idempotency_keys (
            operation,
            idempotency_key,
            request_fingerprint,
            resource_type,
            resource_id,
            disposition
          )
          VALUES ('lead-ingestion', $1, $2, 'Lead', $3, 'CREATED')
          ON CONFLICT (operation, idempotency_key) DO NOTHING
          RETURNING request_fingerprint, resource_id
        `,
        [transaction.idempotencyKey, transaction.requestFingerprint, transaction.lead.id],
      );

      if (reservation.rowCount === 0) {
        const replayResult = await this.resolveIdempotentReplay(client, transaction);
        await client.query('COMMIT');
        transactionOpen = false;
        return replayResult;
      }

      const insertedLead = await client.query<LeadIdRow>(
        `
          INSERT INTO acquisition.leads (
            id,
            status,
            source,
            source_reference,
            phone,
            customer_name,
            city,
            district,
            listing_title,
            listing_text,
            published_at,
            received_at,
            raw_payload_reference
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
          )
          ON CONFLICT (source, source_reference) DO NOTHING
          RETURNING id
        `,
        [
          transaction.lead.id,
          transaction.lead.status,
          transaction.lead.source,
          transaction.lead.sourceReference,
          transaction.lead.phone,
          transaction.lead.customerName ?? null,
          transaction.lead.city ?? null,
          transaction.lead.district ?? null,
          transaction.lead.listingTitle ?? null,
          transaction.lead.listingText ?? null,
          transaction.lead.publishedAt ?? null,
          transaction.lead.receivedAt,
          transaction.lead.rawPayloadReference ?? null,
        ],
      );

      if (insertedLead.rowCount === 0) {
        const duplicateResult = await this.resolveSourceDuplicate(client, transaction);
        await client.query('COMMIT');
        transactionOpen = false;
        return duplicateResult;
      }

      await client.query(
        `
          INSERT INTO platform.outbox_events (
            event_id,
            event_type,
            event_version,
            aggregate_type,
            aggregate_id,
            occurred_at,
            correlation_id,
            payload
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        `,
        [
          transaction.event.eventId,
          transaction.event.eventType,
          transaction.event.eventVersion,
          transaction.event.aggregateType,
          transaction.event.aggregateId,
          transaction.event.occurredAt,
          transaction.event.correlationId,
          JSON.stringify(transaction.event.payload),
        ],
      );

      await client.query('COMMIT');
      transactionOpen = false;
      return {
        disposition: 'CREATED',
        leadId: transaction.lead.id,
      };
    } catch (error) {
      if (transactionOpen) {
        await client.query('ROLLBACK');
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private async resolveIdempotentReplay(
    client: SqlClient,
    transaction: CreateLeadTransaction,
  ): Promise<CreateLeadTransactionResult> {
    const existing = await client.query<IdempotencyRow>(
      `
        SELECT request_fingerprint, resource_id
        FROM platform.idempotency_keys
        WHERE operation = 'lead-ingestion' AND idempotency_key = $1
      `,
      [transaction.idempotencyKey],
    );
    const row = existing.rows[0];

    if (!row) {
      throw new PersistenceInvariantError('Idempotency reservation disappeared');
    }
    if (row.request_fingerprint !== transaction.requestFingerprint) {
      throw new IdempotencyConflictError();
    }

    return {
      disposition: 'DUPLICATE',
      leadId: row.resource_id,
      duplicateReason: 'IDEMPOTENCY_KEY',
    };
  }

  private async resolveSourceDuplicate(
    client: SqlClient,
    transaction: CreateLeadTransaction,
  ): Promise<CreateLeadTransactionResult> {
    const existing = await client.query<LeadIdRow>(
      `
        SELECT id
        FROM acquisition.leads
        WHERE source = $1 AND source_reference = $2
      `,
      [transaction.lead.source, transaction.lead.sourceReference],
    );
    const row = existing.rows[0];

    if (!row) {
      throw new PersistenceInvariantError('Conflicting lead could not be resolved');
    }

    await client.query(
      `
        UPDATE platform.idempotency_keys
        SET resource_id = $1, disposition = 'DUPLICATE'
        WHERE operation = 'lead-ingestion' AND idempotency_key = $2
      `,
      [row.id, transaction.idempotencyKey],
    );

    return {
      disposition: 'DUPLICATE',
      leadId: row.id,
      duplicateReason: 'SOURCE_REFERENCE',
    };
  }
}
