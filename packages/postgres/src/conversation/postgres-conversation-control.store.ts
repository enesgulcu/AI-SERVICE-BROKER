import type { ControlMode } from '@ai-service-broker/conversation';
import {
  conversationControlAudit,
  conversationControlEvent,
  type ControlCommit,
  type ControlWrite,
  type ConversationControlStore,
} from '@ai-service-broker/conversation';
import type { SqlPool } from '../database';

interface IdempotencyRow extends Record<string, unknown> {
  request_fingerprint: string;
  resource_id: string;
}

interface ConversationRow extends Record<string, unknown> {
  id: string;
  control_mode: ControlMode;
  version: number;
}

interface ChangeRow extends Record<string, unknown> {
  control_mode: ControlMode;
  version: number;
}

export class PostgresConversationControlStore implements ConversationControlStore {
  constructor(private readonly pool: SqlPool) {}

  async commitControl(write: ControlWrite): Promise<ControlCommit> {
    const client = await this.pool.connect();
    let open = false;
    try {
      await client.query('BEGIN');
      open = true;
      const existing = await client.query<IdempotencyRow>(
        `
          SELECT request_fingerprint, resource_id
          FROM platform.idempotency_keys
          WHERE operation = 'conversation.control' AND idempotency_key = $1
        `,
        [write.idempotencyKey],
      );
      const existingKey = existing.rows[0];
      if (existingKey) {
        if (existingKey.request_fingerprint.trim() !== write.requestFingerprint) {
          await client.query('ROLLBACK');
          return { disposition: 'IDEMPOTENCY_CONFLICT' };
        }
        const change = await client.query<ChangeRow>(
          'SELECT control_mode, version FROM conversation.control_changes WHERE id = $1',
          [existingKey.resource_id],
        );
        const stored = change.rows[0];
        await client.query('COMMIT');
        if (!stored) {
          throw new Error('Stored conversation control change is missing');
        }
        return {
          disposition: 'DUPLICATE',
          controlMode: stored.control_mode,
          version: stored.version,
        };
      }

      const conversation = await client.query<ConversationRow>(
        `
          SELECT id, control_mode, version
          FROM conversation.conversations
          WHERE id = $1
          FOR UPDATE
        `,
        [write.conversationId],
      );
      const current = conversation.rows[0];
      if (!current) {
        await client.query('ROLLBACK');
        return { disposition: 'NOT_FOUND' };
      }
      if (current.version !== write.expectedVersion) {
        await client.query('ROLLBACK');
        return { disposition: 'VERSION_CONFLICT' };
      }
      if (write.blockAiActive) {
        await client.query('ROLLBACK');
        return { disposition: 'KILL_SWITCH' };
      }
      if (current.control_mode === write.controlMode) {
        await client.query('ROLLBACK');
        return {
          disposition: 'UNCHANGED',
          controlMode: current.control_mode,
          version: current.version,
        };
      }

      const version = current.version + 1;
      const updated = await client.query(
        `
          UPDATE conversation.conversations
          SET control_mode = $1, version = $2
          WHERE id = $3 AND version = $4
        `,
        [write.controlMode, version, write.conversationId, write.expectedVersion],
      );
      if (updated.rowCount !== 1) {
        await client.query('ROLLBACK');
        return { disposition: 'VERSION_CONFLICT' };
      }

      await client.query(
        `
          INSERT INTO conversation.control_changes (
            id, conversation_id, control_mode, version, actor_id, correlation_id
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          write.changeId,
          write.conversationId,
          write.controlMode,
          version,
          write.actorId,
          write.correlationId,
        ],
      );
      const event = conversationControlEvent(write, version);
      await client.query(
        `
          INSERT INTO platform.outbox_events (
            event_id, event_type, event_version, aggregate_type, aggregate_id,
            occurred_at, correlation_id, payload
          )
          VALUES ($1, $2, 1, 'Conversation', $3, $4, $5, $6::jsonb)
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
      const audit = conversationControlAudit(write);
      await client.query(
        `
          INSERT INTO audit.entries (
            id, actor_id, action, entity_type, entity_id, reason_code, correlation_id, occurred_at
          )
          VALUES ($1, $2, $3, 'Conversation', $4, $5, $6, $7)
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
          VALUES ('conversation.control', $1, $2, 'Conversation', $3, 'CREATED')
        `,
        [write.idempotencyKey, write.requestFingerprint, write.changeId],
      );
      await client.query('COMMIT');
      open = false;
      return { disposition: 'CHANGED', controlMode: write.controlMode, version };
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
