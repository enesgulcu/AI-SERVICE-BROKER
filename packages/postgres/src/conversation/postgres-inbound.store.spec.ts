import type { InboundWrite } from '@ai-service-broker/conversation';
import type { SqlClient, SqlPool, SqlQueryResult } from '../database';
import { PostgresInboundStore } from './postgres-inbound.store';

interface ScriptStep {
  includes: string;
  result?: SqlQueryResult<Record<string, unknown>>;
}

class ScriptedClient implements SqlClient {
  readonly calls: Array<{ text: string; values: readonly unknown[] }> = [];

  constructor(private readonly script: ScriptStep[]) {}

  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<SqlQueryResult<Row>> {
    this.calls.push({ text, values });
    const step = this.script.shift();
    if (!step || !text.includes(step.includes)) {
      throw new Error(`Unexpected query: ${text}`);
    }
    return Promise.resolve((step.result ?? { rows: [], rowCount: 1 }) as SqlQueryResult<Row>);
  }

  execute(): Promise<void> {
    return Promise.reject(new Error('execute is not used by inbound recording'));
  }

  release(): void {
    return undefined;
  }
}

const empty = { rows: [], rowCount: 0 };

function write(): InboundWrite {
  return {
    customerId: '11111111-1111-4111-8111-111111111111',
    conversationId: '22222222-2222-4222-8222-222222222222',
    messageId: '33333333-3333-4333-8333-333333333333',
    eventId: '44444444-4444-4444-8444-444444444444',
    auditId: '55555555-5555-4555-8555-555555555555',
    leadId: '92d60e65-14f0-4d4f-b9ae-062c8f685213',
    phone: '+905551112233',
    phoneHash: 'a'.repeat(64),
    body: 'gizli mesaj',
    providerMessageId: 'mock-message-1',
    controlMode: 'PAUSED',
    correlationId: 'request:trace-123',
    receivedAt: new Date('2026-09-23T12:00:00.000Z'),
  };
}

describe('PostgresInboundStore', () => {
  it('records the message once and keeps the phone and body out of events and audit', async () => {
    const client = new ScriptedClient([
      { includes: 'BEGIN', result: empty },
      { includes: "hashtext('phone:'", result: empty },
      { includes: "hashtext('message:'", result: empty },
      { includes: 'FROM conversation.messages', result: empty },
      { includes: 'FROM customer.customers', result: empty },
      { includes: 'INSERT INTO customer.customers', result: empty },
      { includes: 'INSERT INTO customer.customer_leads', result: empty },
      { includes: 'FROM conversation.conversations', result: empty },
      { includes: 'INSERT INTO conversation.conversations', result: empty },
      { includes: 'INSERT INTO conversation.messages', result: empty },
      { includes: 'INSERT INTO platform.inbox_messages', result: empty },
      { includes: 'INSERT INTO platform.outbox_events', result: empty },
      { includes: 'INSERT INTO audit.entries', result: empty },
      { includes: 'COMMIT', result: empty },
    ]);
    const pool: SqlPool = {
      connect: () => Promise.resolve(client),
      end: () => Promise.resolve(),
    };

    await expect(new PostgresInboundStore(pool).commit(write())).resolves.toMatchObject({
      disposition: 'RECORDED',
      stored: { controlMode: 'PAUSED', phone: '' },
    });

    const outbox = client.calls.find((call) => call.text.includes('platform.outbox_events'));
    const audit = client.calls.find((call) => call.text.includes('audit.entries'));
    const evidence = JSON.stringify({ outbox: outbox?.values, audit: audit?.values });
    expect(evidence).not.toContain('+905551112233');
    expect(evidence).not.toContain('gizli mesaj');
    expect(evidence).toContain('PAUSED');
  });

  it('reports a conflict when the same provider message has a different body', async () => {
    const client = new ScriptedClient([
      { includes: 'BEGIN', result: empty },
      { includes: "hashtext('phone:'", result: empty },
      { includes: "hashtext('message:'", result: empty },
      {
        includes: 'FROM conversation.messages',
        result: {
          rows: [
            {
              id: write().messageId,
              conversation_id: write().conversationId,
              customer_id: write().customerId,
              lead_id: write().leadId,
              provider_message_id: write().providerMessageId,
              phone_hash: write().phoneHash,
              body: 'baska metin',
              control_mode: 'AI_ACTIVE',
              correlation_id: write().correlationId,
              received_at: write().receivedAt,
            },
          ],
          rowCount: 1,
        },
      },
      { includes: 'COMMIT', result: empty },
    ]);
    const pool: SqlPool = {
      connect: () => Promise.resolve(client),
      end: () => Promise.resolve(),
    };

    await expect(new PostgresInboundStore(pool).commit(write())).resolves.toEqual({
      disposition: 'CONFLICT',
    });
  });
});
