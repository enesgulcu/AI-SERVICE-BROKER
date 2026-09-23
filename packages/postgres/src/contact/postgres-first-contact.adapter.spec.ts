import { SANDBOX_FIRST_CONTACT_DRAFT, type PreparationPlan } from '@ai-service-broker/contact';
import type { SqlClient, SqlPool, SqlQueryResult } from '../database';
import { PostgresFirstContactAdapter } from './postgres-first-contact.adapter';

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
    return Promise.reject(new Error('execute is not used by first contact'));
  }

  release(): void {
    return undefined;
  }
}

const empty = { rows: [], rowCount: 1 };

function plan(): PreparationPlan {
  return {
    idempotencyKey: 'contact:prepare-1',
    requestFingerprint: 'a'.repeat(64),
    expectedVersion: 1,
    leadId: '92d60e65-14f0-4d4f-b9ae-062c8f685213',
    nextStatus: 'CONTACT_PENDING',
    nextVersion: 2,
    review: {
      id: '11111111-1111-4111-8111-111111111111',
      leadId: '92d60e65-14f0-4d4f-b9ae-062c8f685213',
      messageId: '22222222-2222-4222-8222-222222222222',
      status: 'PENDING',
      actorId: 'operator-1',
      templateVersion: 'sandbox-first-contact-v1',
      reasonCode: 'ELIGIBLE_SYNTHETIC',
      draft: SANDBOX_FIRST_CONTACT_DRAFT,
      deliveryStatus: 'DRAFT',
      expiresAt: new Date('2026-09-24T09:00:00.000Z'),
      correlationId: 'request:trace-123',
    },
    audit: {
      id: '33333333-3333-4333-8333-333333333333',
      actorId: 'operator-1',
      action: 'FIRST_CONTACT_REQUESTED',
      entityType: 'ContactReview',
      entityId: '11111111-1111-4111-8111-111111111111',
      reasonCode: 'ELIGIBLE_SYNTHETIC',
      correlationId: 'request:trace-123',
      occurredAt: new Date('2026-09-23T09:00:00.000Z'),
    },
    event: {
      eventId: '44444444-4444-4444-8444-444444444444',
      eventType: 'ContactReviewOpened',
      eventVersion: 1,
      aggregateType: 'Lead',
      aggregateId: '92d60e65-14f0-4d4f-b9ae-062c8f685213',
      occurredAt: new Date('2026-09-23T09:00:00.000Z'),
      correlationId: 'request:trace-123',
      payload: {
        reviewId: '11111111-1111-4111-8111-111111111111',
        leadId: '92d60e65-14f0-4d4f-b9ae-062c8f685213',
        templateVersion: 'sandbox-first-contact-v1',
        expiresAt: '2026-09-24T09:00:00.000Z',
      },
    },
  };
}

describe('PostgresFirstContactAdapter', () => {
  it('commits a pending review without copying the draft into the outbox', async () => {
    const client = new ScriptedClient([
      { includes: 'BEGIN', result: empty },
      {
        includes: 'INSERT INTO platform.idempotency_keys',
        result: {
          rows: [{ request_fingerprint: 'a'.repeat(64), resource_id: plan().review.id }],
          rowCount: 1,
        },
      },
      { includes: 'UPDATE acquisition.leads', result: empty },
      { includes: 'INSERT INTO outreach.contact_reviews', result: empty },
      { includes: 'INSERT INTO outreach.outbound_messages', result: empty },
      { includes: 'INSERT INTO audit.entries', result: empty },
      { includes: 'INSERT INTO platform.outbox_events', result: empty },
      { includes: 'COMMIT', result: empty },
    ]);
    const pool: SqlPool = {
      connect: () => Promise.resolve(client),
      end: () => Promise.resolve(),
    };

    await expect(new PostgresFirstContactAdapter(pool).commitPreparation(plan())).resolves.toEqual({
      disposition: 'CREATED',
    });
    const outbox = client.calls.find((call) => call.text.includes('platform.outbox_events'));
    expect(JSON.stringify(outbox?.values)).not.toContain(SANDBOX_FIRST_CONTACT_DRAFT);
    expect(JSON.stringify(outbox?.values)).not.toContain('operator-1');
  });
});
