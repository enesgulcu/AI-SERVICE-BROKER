import type { ControlWrite } from '@ai-service-broker/conversation';
import type { SqlClient, SqlPool, SqlQueryResult } from '../database';
import { PostgresConversationControlStore } from './postgres-conversation-control.store';

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
    return Promise.reject(new Error('execute is not used by conversation control'));
  }

  release(): void {
    return undefined;
  }
}

const empty = { rows: [], rowCount: 0 };

function write(): ControlWrite {
  return {
    changeId: '77777777-7777-4777-8777-777777777777',
    eventId: '88888888-8888-4888-8888-888888888888',
    auditId: '99999999-9999-4999-8999-999999999999',
    conversationId: '22222222-2222-4222-8222-222222222222',
    actorId: 'operator-1',
    controlMode: 'HUMAN_CONTROL',
    expectedVersion: 1,
    idempotencyKey: 'control:takeover-1',
    requestFingerprint: 'a'.repeat(64),
    correlationId: 'request:trace-123',
    blockAiActive: false,
    occurredAt: new Date('2026-09-23T12:00:00.000Z'),
  };
}

describe('PostgresConversationControlStore', () => {
  it('records a human takeover without copying the actor into the outbox', async () => {
    const client = new ScriptedClient([
      { includes: 'BEGIN', result: empty },
      { includes: 'FROM platform.idempotency_keys', result: empty },
      {
        includes: 'FROM conversation.conversations',
        result: {
          rows: [{ id: write().conversationId, control_mode: 'AI_ACTIVE', version: 1 }],
          rowCount: 1,
        },
      },
      { includes: 'UPDATE conversation.conversations', result: { rows: [], rowCount: 1 } },
      { includes: 'INSERT INTO conversation.control_changes', result: empty },
      { includes: 'INSERT INTO platform.outbox_events', result: empty },
      { includes: 'INSERT INTO audit.entries', result: empty },
      { includes: 'INSERT INTO platform.idempotency_keys', result: empty },
      { includes: 'COMMIT', result: empty },
    ]);
    const pool: SqlPool = {
      connect: () => Promise.resolve(client),
      end: () => Promise.resolve(),
    };

    await expect(
      new PostgresConversationControlStore(pool).commitControl(write()),
    ).resolves.toEqual({
      disposition: 'CHANGED',
      controlMode: 'HUMAN_CONTROL',
      version: 2,
    });
    const outbox = client.calls.find((call) => call.text.includes('platform.outbox_events'));
    expect(JSON.stringify(outbox?.values)).not.toContain('operator-1');
    expect(JSON.stringify(outbox?.values)).toContain('HUMAN_CONTROL');
  });
});
