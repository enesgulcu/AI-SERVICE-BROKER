import type { SqlClient, SqlPool, SqlQueryResult } from '../database';
import { PostgresDeliveryCallbackStore } from './postgres-delivery-callback.store';

class ScriptedClient implements SqlClient {
  constructor(
    private readonly script: Array<{
      includes: string;
      rowCount: number;
      rows?: Record<string, unknown>[];
    }>,
  ) {}

  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
  ): Promise<SqlQueryResult<Row>> {
    const step = this.script.shift();
    if (!step || !text.includes(step.includes)) {
      return Promise.reject(new Error(`Unexpected query: ${text}`));
    }
    return Promise.resolve({
      rows: (step.rows ?? []) as Row[],
      rowCount: step.rowCount,
    });
  }

  execute(): Promise<void> {
    return Promise.reject(new Error('execute is not used'));
  }

  release(): void {
    return undefined;
  }
}

describe('PostgresDeliveryCallbackStore', () => {
  it('records a mock callback once', async () => {
    const client = new ScriptedClient([
      { includes: 'INSERT INTO outreach.delivery_callbacks', rowCount: 1 },
    ]);
    const pool: SqlPool = {
      connect: () => Promise.resolve(client),
      end: () => Promise.resolve(),
    };
    await expect(
      new PostgresDeliveryCallbackStore(pool).save({
        id: '11111111-1111-4111-8111-111111111111',
        providerEventId: 'mock-event-1',
        templateVersion: 'sandbox-first-contact-v1',
        status: 'DELIVERED',
      }),
    ).resolves.toEqual({ ok: true, disposition: 'CREATED' });
  });
});
