import type { NewRequirement } from '@ai-service-broker/requirement';
import type { SqlClient, SqlPool, SqlQueryResult } from '../database';
import { PostgresOperationsStore } from './postgres-operations.store';

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
    return Promise.reject(new Error('execute is not used by operations'));
  }

  release(): void {
    return undefined;
  }
}

const empty = { rows: [], rowCount: 0 };
const leadId = '92d60e65-14f0-4d4f-b9ae-062c8f685213';

function requirement(): NewRequirement {
  return {
    id: '77777777-7777-4777-8777-777777777777',
    leadId,
    idempotencyKey: 'requirement:e2e-1',
    fingerprint: 'a'.repeat(64),
    actorId: 'operator-1',
    correlationId: 'request:trace-123',
    occurredAt: new Date('2026-09-23T12:00:00.000Z'),
    snapshot: {
      schemaVersion: 'regular-home-helper-v1',
      confirmed: { working_hours: '09:00-17:00' },
      evidenceCount: 0,
      specialRequirements: [],
      missingFields: ['days_per_week', 'start_date'],
      contradictions: [],
      ready: false,
    },
  };
}

describe('PostgresOperationsStore', () => {
  it('records a requirement without copying field values into the outbox', async () => {
    const client = new ScriptedClient([
      { includes: 'BEGIN', result: empty },
      { includes: 'idempotency_key = $1', result: empty },
      { includes: 'FOR UPDATE', result: empty },
      { includes: 'ORDER BY version', result: empty },
      { includes: 'INSERT INTO requirement.versions', result: empty },
      { includes: 'RequirementVersionRecorded', result: empty },
      { includes: 'audit.entries', result: empty },
      { includes: 'COMMIT', result: empty },
    ]);
    const pool: SqlPool = {
      connect: () => Promise.resolve(client),
      end: () => Promise.resolve(),
    };

    await expect(
      new PostgresOperationsStore(pool).saveRequirement(requirement()),
    ).resolves.toMatchObject({
      snapshot: { version: 1, ready: false },
    });
    const outbox = client.calls.find((call) => call.text.includes('RequirementVersionRecorded'));
    expect(JSON.stringify(outbox?.values)).not.toContain('09:00-17:00');
    expect(JSON.stringify(outbox?.values)).toContain('regular-home-helper-v1');
  });

  it('refuses to redrive an unsafe dead letter', async () => {
    const client = new ScriptedClient([
      { includes: 'BEGIN', result: empty },
      {
        includes: 'FROM platform.outbox_events',
        result: {
          rows: [
            {
              event_id: '77777777-7777-4777-8777-777777777777',
              event_type: 'LeadContacted',
              event_version: 1,
              aggregate_type: 'Lead',
              aggregate_id: leadId,
              occurred_at: new Date('2026-09-23T12:00:00.000Z'),
              correlation_id: 'request:trace-123',
              payload: {
                reviewId: '11111111-1111-4111-8111-111111111111',
                leadId,
                channel: 'WHATSAPP',
                templateVersion: 'sandbox-first-contact-v1',
              },
              attempts: 1,
              published_at: null,
              last_error: 'UNSAFE_CHANNEL',
            },
          ],
          rowCount: 1,
        },
      },
      { includes: 'ROLLBACK', result: empty },
    ]);
    const pool: SqlPool = {
      connect: () => Promise.resolve(client),
      end: () => Promise.resolve(),
    };

    await expect(
      new PostgresOperationsStore(pool).redrive({
        eventId: '77777777-7777-4777-8777-777777777777',
        auditId: '88888888-8888-4888-8888-888888888888',
        actorId: 'operator-1',
        correlationId: 'request:trace-123',
        occurredAt: new Date('2026-09-23T12:00:00.000Z'),
      }),
    ).resolves.toEqual({ ok: false, code: 'NOT_REDRIVABLE' });
    expect(client.calls.some((call) => call.text.includes('UPDATE platform.outbox_events'))).toBe(
      false,
    );
  });
});
