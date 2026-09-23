import type { SqlClient, SqlPool, SqlQueryResult } from '../database';
import { PostgresOutboxStore } from './postgres-outbox.store';

class ScriptedClient implements SqlClient {
  constructor(private readonly result: SqlQueryResult<Record<string, unknown>>) {}

  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<SqlQueryResult<Row>> {
    expect(text).toContain('FOR UPDATE SKIP LOCKED');
    expect(values).toEqual([new Date('2026-09-23T10:00:00.000Z'), 5, 20]);
    return Promise.resolve(this.result as SqlQueryResult<Row>);
  }

  execute(): Promise<void> {
    return Promise.reject(new Error('execute is not used by the outbox claim'));
  }

  release(): void {
    return undefined;
  }
}

describe('PostgresOutboxStore', () => {
  it('claims unpublished events without returning a phone number', async () => {
    const client = new ScriptedClient({
      rows: [
        {
          event_id: '44444444-4444-4444-8444-444444444444',
          event_type: 'LeadCreated',
          event_version: 1,
          aggregate_type: 'Lead',
          aggregate_id: '92d60e65-14f0-4d4f-b9ae-062c8f685213',
          occurred_at: new Date('2026-09-23T10:00:00.000Z'),
          correlation_id: 'request:trace-123',
          payload: {
            leadId: '92d60e65-14f0-4d4f-b9ae-062c8f685213',
            source: 'SYNTHETIC',
            sourceReference: 'listing-1',
            status: 'NEW',
          },
          attempts: 1,
        },
      ],
      rowCount: 1,
    });
    const pool: SqlPool = {
      connect: () => Promise.resolve(client),
      end: () => Promise.resolve(),
    };

    const claimed = await new PostgresOutboxStore(pool).claim(
      new Date('2026-09-23T10:00:00.000Z'),
      20,
      5,
    );

    expect(claimed).toHaveLength(1);
    expect(JSON.stringify(claimed)).not.toContain('+90555');
  });
});
