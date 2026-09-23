import { IdempotencyConflictError, type CreateLeadTransaction } from '@ai-service-broker/lead';
import type { SqlClient, SqlPool, SqlQueryResult } from '../database';
import { PostgresLeadIngestionAdapter } from './postgres-lead-ingestion.adapter';

interface ScriptStep {
  includes: string;
  result?: SqlQueryResult<Record<string, unknown>>;
  error?: Error;
}

class ScriptedClient implements SqlClient {
  readonly calls: Array<{ text: string; values: readonly unknown[] }> = [];
  released = false;

  constructor(private readonly script: ScriptStep[]) {}

  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<SqlQueryResult<Row>> {
    this.calls.push({ text, values });
    const step = this.script.shift();
    if (!step) {
      throw new Error(`Unexpected query: ${text}`);
    }
    expect(text).toContain(step.includes);
    if (step.error) {
      return Promise.reject(step.error);
    }
    return Promise.resolve((step.result ?? { rows: [], rowCount: null }) as SqlQueryResult<Row>);
  }

  release(): void {
    this.released = true;
  }

  assertComplete(): void {
    expect(this.script).toHaveLength(0);
  }
}

class SingleClientPool implements SqlPool {
  constructor(readonly client: ScriptedClient) {}

  connect(): Promise<SqlClient> {
    return Promise.resolve(this.client);
  }

  end(): Promise<void> {
    return Promise.resolve();
  }
}

const emptyResult = { rows: [], rowCount: null };

function transaction(): CreateLeadTransaction {
  return {
    idempotencyKey: 'lead:request-123',
    requestFingerprint: 'a'.repeat(64),
    lead: {
      id: '92d60e65-14f0-4d4f-b9ae-062c8f685213',
      status: 'NEW',
      source: 'SAHIBINDEN',
      sourceReference: 'listing-123',
      phone: '+905551112233',
      customerName: 'Ayşe',
      city: 'İstanbul',
      receivedAt: new Date('2026-09-23T08:00:00.000Z'),
    },
    event: {
      eventId: '30ed6e26-dfaf-47f5-ac24-6db09622820a',
      eventType: 'LeadCreated',
      eventVersion: 1,
      aggregateType: 'Lead',
      aggregateId: '92d60e65-14f0-4d4f-b9ae-062c8f685213',
      occurredAt: new Date('2026-09-23T08:00:00.000Z'),
      correlationId: 'request:trace-123',
      payload: {
        leadId: '92d60e65-14f0-4d4f-b9ae-062c8f685213',
        source: 'SAHIBINDEN',
        sourceReference: 'listing-123',
        status: 'NEW',
      },
    },
  };
}

describe('PostgresLeadIngestionAdapter', () => {
  it('commits a new lead and its outbox event atomically', async () => {
    const client = new ScriptedClient([
      { includes: 'BEGIN', result: emptyResult },
      {
        includes: 'INSERT INTO platform.idempotency_keys',
        result: {
          rows: [
            {
              request_fingerprint: 'a'.repeat(64),
              resource_id: transaction().lead.id,
            },
          ],
          rowCount: 1,
        },
      },
      {
        includes: 'INSERT INTO acquisition.leads',
        result: { rows: [{ id: transaction().lead.id }], rowCount: 1 },
      },
      {
        includes: 'INSERT INTO platform.outbox_events',
        result: { rows: [], rowCount: 1 },
      },
      { includes: 'COMMIT', result: emptyResult },
    ]);
    const adapter = new PostgresLeadIngestionAdapter(new SingleClientPool(client));

    await expect(adapter.createLeadWithOutbox(transaction())).resolves.toEqual({
      disposition: 'CREATED',
      leadId: transaction().lead.id,
    });
    const outboxCall = client.calls.find((call) =>
      call.text.includes('INSERT INTO platform.outbox_events'),
    );
    expect(JSON.stringify(outboxCall?.values)).not.toContain(transaction().lead.phone);
    expect(client.released).toBe(true);
    client.assertComplete();
  });

  it('returns an idempotent replay without creating another lead', async () => {
    const existingLeadId = '8cbad6fe-aeb8-4530-9ca7-96fd228212c7';
    const client = new ScriptedClient([
      { includes: 'BEGIN', result: emptyResult },
      {
        includes: 'INSERT INTO platform.idempotency_keys',
        result: { rows: [], rowCount: 0 },
      },
      {
        includes: 'SELECT request_fingerprint',
        result: {
          rows: [
            {
              request_fingerprint: transaction().requestFingerprint,
              resource_id: existingLeadId,
            },
          ],
          rowCount: 1,
        },
      },
      { includes: 'COMMIT', result: emptyResult },
    ]);
    const adapter = new PostgresLeadIngestionAdapter(new SingleClientPool(client));

    await expect(adapter.createLeadWithOutbox(transaction())).resolves.toEqual({
      disposition: 'DUPLICATE',
      leadId: existingLeadId,
      duplicateReason: 'IDEMPOTENCY_KEY',
    });
    expect(client.calls.some((call) => call.text.includes('acquisition.leads'))).toBe(false);
    client.assertComplete();
  });

  it('rejects reuse of an idempotency key with a different request', async () => {
    const client = new ScriptedClient([
      { includes: 'BEGIN', result: emptyResult },
      {
        includes: 'INSERT INTO platform.idempotency_keys',
        result: { rows: [], rowCount: 0 },
      },
      {
        includes: 'SELECT request_fingerprint',
        result: {
          rows: [
            {
              request_fingerprint: 'b'.repeat(64),
              resource_id: transaction().lead.id,
            },
          ],
          rowCount: 1,
        },
      },
      { includes: 'ROLLBACK', result: emptyResult },
    ]);
    const adapter = new PostgresLeadIngestionAdapter(new SingleClientPool(client));

    await expect(adapter.createLeadWithOutbox(transaction())).rejects.toBeInstanceOf(
      IdempotencyConflictError,
    );
    expect(client.released).toBe(true);
    client.assertComplete();
  });

  it('links a new idempotency key to an existing source lead', async () => {
    const existingLeadId = '8cbad6fe-aeb8-4530-9ca7-96fd228212c7';
    const client = new ScriptedClient([
      { includes: 'BEGIN', result: emptyResult },
      {
        includes: 'INSERT INTO platform.idempotency_keys',
        result: {
          rows: [
            {
              request_fingerprint: transaction().requestFingerprint,
              resource_id: transaction().lead.id,
            },
          ],
          rowCount: 1,
        },
      },
      {
        includes: 'INSERT INTO acquisition.leads',
        result: { rows: [], rowCount: 0 },
      },
      {
        includes: 'SELECT id',
        result: { rows: [{ id: existingLeadId }], rowCount: 1 },
      },
      {
        includes: 'UPDATE platform.idempotency_keys',
        result: { rows: [], rowCount: 1 },
      },
      { includes: 'COMMIT', result: emptyResult },
    ]);
    const adapter = new PostgresLeadIngestionAdapter(new SingleClientPool(client));

    await expect(adapter.createLeadWithOutbox(transaction())).resolves.toEqual({
      disposition: 'DUPLICATE',
      leadId: existingLeadId,
      duplicateReason: 'SOURCE_REFERENCE',
    });
    expect(
      client.calls.some((call) => call.text.includes('INSERT INTO platform.outbox_events')),
    ).toBe(false);
    client.assertComplete();
  });

  it('rolls back when the outbox insert fails', async () => {
    const client = new ScriptedClient([
      { includes: 'BEGIN', result: emptyResult },
      {
        includes: 'INSERT INTO platform.idempotency_keys',
        result: {
          rows: [
            {
              request_fingerprint: transaction().requestFingerprint,
              resource_id: transaction().lead.id,
            },
          ],
          rowCount: 1,
        },
      },
      {
        includes: 'INSERT INTO acquisition.leads',
        result: { rows: [{ id: transaction().lead.id }], rowCount: 1 },
      },
      {
        includes: 'INSERT INTO platform.outbox_events',
        error: new Error('outbox unavailable'),
      },
      { includes: 'ROLLBACK', result: emptyResult },
    ]);
    const adapter = new PostgresLeadIngestionAdapter(new SingleClientPool(client));

    await expect(adapter.createLeadWithOutbox(transaction())).rejects.toThrow('outbox unavailable');
    expect(client.released).toBe(true);
    client.assertComplete();
  });
});
