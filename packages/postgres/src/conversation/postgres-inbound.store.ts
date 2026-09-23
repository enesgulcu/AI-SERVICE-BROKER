import type {
  InboundCommit,
  InboundStore,
  InboundWrite,
  ConversationLeadSummary,
  StoredInbound,
} from '@ai-service-broker/conversation';
import { inboundAudit, inboundEvent } from '@ai-service-broker/conversation';
import type { SqlPool } from '../database';

interface SummaryRow extends Record<string, unknown> {
  conversation_id: string;
  channel: string;
  control_mode: ConversationLeadSummary['controlMode'];
  message_count: number;
}

interface MessageRow extends Record<string, unknown> {
  id: string;
  conversation_id: string;
  customer_id: string;
  lead_id: string;
  provider_message_id: string;
  phone_hash: string;
  body: string;
  control_mode: StoredInbound['controlMode'];
  correlation_id: string;
  received_at: Date;
}

interface IdRow extends Record<string, unknown> {
  id: string;
}

function storedFrom(row: MessageRow): StoredInbound {
  return {
    customerId: row.customer_id,
    conversationId: row.conversation_id,
    messageId: row.id,
    leadId: row.lead_id,
    phone: '',
    phoneHash: row.phone_hash.trim(),
    body: row.body,
    providerMessageId: row.provider_message_id,
    controlMode: row.control_mode,
    correlationId: row.correlation_id,
    receivedAt: row.received_at,
  };
}

export class PostgresInboundStore implements InboundStore {
  constructor(private readonly pool: SqlPool) {}

  async commit(write: InboundWrite): Promise<InboundCommit> {
    const client = await this.pool.connect();
    let open = false;
    try {
      await client.query('BEGIN');
      open = true;
      await client.query("SELECT pg_advisory_xact_lock(hashtext('phone:' || $1))", [
        write.phoneHash,
      ]);
      await client.query("SELECT pg_advisory_xact_lock(hashtext('message:' || $1))", [
        write.providerMessageId,
      ]);

      const existing = await client.query<MessageRow>(
        `
          SELECT
            id, conversation_id, customer_id, lead_id, provider_message_id, phone_hash,
            body, control_mode, correlation_id, received_at
          FROM conversation.messages
          WHERE provider = 'MOCK' AND provider_message_id = $1
        `,
        [write.providerMessageId],
      );
      const existingRow = existing.rows[0];
      if (existingRow) {
        const stored = storedFrom(existingRow);
        await client.query('COMMIT');
        open = false;
        if (stored.body !== write.body || stored.phoneHash !== write.phoneHash) {
          return { disposition: 'CONFLICT' };
        }
        return { disposition: 'DUPLICATE', stored };
      }

      const customer = await client.query<IdRow>(
        'SELECT id FROM customer.customers WHERE phone_hash = $1',
        [write.phoneHash],
      );
      const customerId = customer.rows[0]?.id ?? write.customerId;
      if (!customer.rows[0]) {
        await client.query(
          `
            INSERT INTO customer.customers (id, phone_hash, phone)
            VALUES ($1, $2, $3)
          `,
          [customerId, write.phoneHash, write.phone],
        );
      }
      await client.query(
        `
          INSERT INTO customer.customer_leads (customer_id, lead_id)
          VALUES ($1, $2)
          ON CONFLICT (customer_id, lead_id) DO NOTHING
        `,
        [customerId, write.leadId],
      );

      const conversation = await client.query<
        IdRow & { control_mode: StoredInbound['controlMode'] }
      >('SELECT id, control_mode FROM conversation.conversations WHERE customer_id = $1', [
        customerId,
      ]);
      const conversationId = conversation.rows[0]?.id ?? write.conversationId;
      const controlMode = conversation.rows[0]?.control_mode ?? write.controlMode;
      if (!conversation.rows[0]) {
        await client.query(
          `
            INSERT INTO conversation.conversations (id, customer_id, channel, control_mode)
            VALUES ($1, $2, 'MOCK', $3)
          `,
          [conversationId, customerId, controlMode],
        );
      }

      await client.query(
        `
          INSERT INTO conversation.messages (
            id, conversation_id, customer_id, lead_id, provider, provider_message_id,
            phone_hash, body, control_mode, correlation_id, received_at
          )
          VALUES ($1, $2, $3, $4, 'MOCK', $5, $6, $7, $8, $9, $10)
        `,
        [
          write.messageId,
          conversationId,
          customerId,
          write.leadId,
          write.providerMessageId,
          write.phoneHash,
          write.body,
          controlMode,
          write.correlationId,
          write.receivedAt,
        ],
      );
      await client.query(
        `
          INSERT INTO platform.inbox_messages (
            id, provider, provider_message_id, correlation_id, payload_reference,
            status, received_at, processed_at
          )
          VALUES ($1, 'MOCK', $2, $3, $4, 'PROCESSED', $5, $5)
        `,
        [
          write.messageId,
          write.providerMessageId,
          write.correlationId,
          write.messageId,
          write.receivedAt,
        ],
      );

      const recorded = { ...write, customerId, conversationId, controlMode };
      const event = inboundEvent(recorded);
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
      const audit = inboundAudit(recorded);
      await client.query(
        `
          INSERT INTO audit.entries (
            id, actor_id, action, entity_type, entity_id, reason_code, correlation_id, occurred_at
          )
          VALUES ($1, 'system', $2, 'Message', $3, $4, $5, $6)
        `,
        [
          audit.id,
          audit.action,
          audit.entityId,
          audit.reasonCode,
          audit.correlationId,
          audit.occurredAt,
        ],
      );

      await client.query('COMMIT');
      open = false;
      return {
        disposition: 'RECORDED',
        stored: {
          ...recorded,
          messageId: write.messageId,
          phone: '',
        },
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

  async summariesForLead(leadId: string): Promise<ConversationLeadSummary[]> {
    const client = await this.pool.connect();
    try {
      const found = await client.query<SummaryRow>(
        `
          SELECT
            c.id AS conversation_id,
            c.channel,
            c.control_mode,
            count(m.id)::int AS message_count
          FROM conversation.messages m
          JOIN conversation.conversations c ON c.id = m.conversation_id
          WHERE m.lead_id = $1
          GROUP BY c.id, c.channel, c.control_mode
          ORDER BY c.id
        `,
        [leadId],
      );
      return found.rows
        .filter((row) => row.channel === 'MOCK')
        .map((row) => ({
          conversationId: row.conversation_id,
          channel: 'MOCK',
          controlMode: row.control_mode,
          messageCount: Number(row.message_count),
        }));
    } finally {
      client.release();
    }
  }
}
