import { deadLetterAt, type OutboxMessage, type OutboxStore } from '@ai-service-broker/outbox';
import type { SqlPool } from '../database';

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
}

function toMessage(row: OutboxRow): OutboxMessage {
  return {
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
}

export class PostgresOutboxStore implements OutboxStore {
  constructor(private readonly pool: SqlPool) {}

  async claim(now: Date, limit: number, maxAttempts: number): Promise<OutboxMessage[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<OutboxRow>(
        `
          UPDATE platform.outbox_events AS event
          SET attempts = event.attempts + 1
          WHERE event.event_id IN (
            SELECT candidate.event_id
            FROM platform.outbox_events AS candidate
            WHERE candidate.published_at IS NULL
              AND candidate.available_at <= $1
              AND candidate.attempts < $2
            ORDER BY candidate.available_at, candidate.occurred_at
            FOR UPDATE SKIP LOCKED
            LIMIT $3
          )
          RETURNING
            event.event_id, event.event_type, event.event_version, event.aggregate_type,
            event.aggregate_id, event.occurred_at, event.correlation_id, event.payload,
            event.attempts
        `,
        [now, maxAttempts, limit],
      );
      return result.rows.map(toMessage);
    } finally {
      client.release();
    }
  }

  async markPublished(eventId: string, publishedAt: Date): Promise<void> {
    await this.update(
      `
        UPDATE platform.outbox_events
        SET published_at = $2, last_error = NULL
        WHERE event_id = $1 AND published_at IS NULL
      `,
      [eventId, publishedAt],
    );
  }

  async markRetry(eventId: string, availableAt: Date, error: string): Promise<void> {
    await this.update(
      `
        UPDATE platform.outbox_events
        SET available_at = $2, last_error = $3
        WHERE event_id = $1 AND published_at IS NULL
      `,
      [eventId, availableAt, error],
    );
  }

  async markDead(eventId: string, error: string): Promise<void> {
    await this.update(
      `
        UPDATE platform.outbox_events
        SET available_at = $2, last_error = $3
        WHERE event_id = $1 AND published_at IS NULL
      `,
      [eventId, deadLetterAt(), error],
    );
  }

  private async update(text: string, values: readonly unknown[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(text, values);
    } finally {
      client.release();
    }
  }
}
