import type { WorkflowWrite } from '@ai-service-broker/workflow';
import type { SqlClient, SqlPool, SqlQueryResult } from '../database';
import { PostgresWorkflowStore } from './postgres-workflow.store';

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
    return Promise.reject(new Error('execute is not used by workflow'));
  }

  release(): void {
    return undefined;
  }
}

const empty = { rows: [], rowCount: 0 };

function write(): WorkflowWrite {
  return {
    eventId: '77777777-7777-4777-8777-777777777777',
    auditId: '88888888-8888-4888-8888-888888888888',
    leadId: '92d60e65-14f0-4d4f-b9ae-062c8f685213',
    actorId: 'operator-1',
    toStatus: 'CLOSED_LOST',
    reasonCode: 'WITHDRAWN',
    expectedVersion: 1,
    idempotencyKey: 'workflow:close-1',
    requestFingerprint: 'a'.repeat(64),
    correlationId: 'request:trace-123',
    occurredAt: new Date('2026-09-23T12:00:00.000Z'),
    requirementsReady: false,
  };
}

describe('PostgresWorkflowStore', () => {
  it('closes a lead without copying the phone into the outbox', async () => {
    const client = new ScriptedClient([
      { includes: 'BEGIN', result: empty },
      { includes: 'FROM platform.idempotency_keys', result: empty },
      {
        includes: 'FROM acquisition.leads',
        result: {
          rows: [
            {
              id: write().leadId,
              status: 'NEW',
              version: 1,
              previous_status: null,
              resume_status: null,
              source: 'SYNTHETIC',
              source_reference: 'listing-1',
              phone: '+905551112233',
              customer_name: null,
              city: null,
              district: null,
              listing_title: null,
              listing_text: null,
              published_at: null,
              received_at: new Date('2026-09-23T08:00:00.000Z'),
              raw_payload_reference: null,
            },
          ],
          rowCount: 1,
        },
      },
      { includes: 'UPDATE acquisition.leads', result: { rows: [], rowCount: 1 } },
      { includes: 'INSERT INTO workflow.transitions', result: empty },
      { includes: 'INSERT INTO platform.outbox_events', result: empty },
      { includes: 'INSERT INTO audit.entries', result: empty },
      { includes: 'INSERT INTO platform.idempotency_keys', result: empty },
      { includes: 'COMMIT', result: empty },
    ]);
    const pool: SqlPool = {
      connect: () => Promise.resolve(client),
      end: () => Promise.resolve(),
    };

    await expect(new PostgresWorkflowStore(pool).commit(write())).resolves.toMatchObject({
      disposition: 'CHANGED',
      toStatus: 'CLOSED_LOST',
      version: 2,
      reasonCode: 'WITHDRAWN',
    });
    const outbox = client.calls.find((call) => call.text.includes('platform.outbox_events'));
    expect(JSON.stringify(outbox?.values)).not.toContain('+905551112233');
    expect(JSON.stringify(outbox?.values)).toContain('WITHDRAWN');
  });
});
