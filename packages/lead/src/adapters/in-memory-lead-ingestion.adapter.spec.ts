import type { CreateLeadTransaction } from '../application/lead-ingestion.port';
import { IdempotencyConflictError } from '../application/lead-ingestion.port';
import { InMemoryLeadIngestionAdapter } from './in-memory-lead-ingestion.adapter';

function transaction(overrides: Partial<CreateLeadTransaction> = {}): CreateLeadTransaction {
  const leadId = '92d60e65-14f0-4d4f-b9ae-062c8f685213';

  return {
    idempotencyKey: 'lead:request-123',
    requestFingerprint: 'a'.repeat(64),
    lead: {
      id: leadId,
      status: 'NEW',
      source: 'SYNTHETIC',
      sourceReference: 'listing-123',
      phone: '+905551112233',
      receivedAt: new Date('2026-09-23T08:00:00.000Z'),
    },
    event: {
      eventId: '30ed6e26-dfaf-47f5-ac24-6db09622820a',
      eventType: 'LeadCreated',
      eventVersion: 1,
      aggregateType: 'Lead',
      aggregateId: leadId,
      occurredAt: new Date('2026-09-23T08:00:00.000Z'),
      correlationId: 'request:trace-123',
      payload: {
        leadId,
        source: 'SYNTHETIC',
        sourceReference: 'listing-123',
        status: 'NEW',
      },
    },
    ...overrides,
  };
}

describe('InMemoryLeadIngestionAdapter', () => {
  it('creates a lead and keeps the event without phone data', async () => {
    const adapter = new InMemoryLeadIngestionAdapter();
    const first = transaction();

    await expect(adapter.createLeadWithOutbox(first)).resolves.toEqual({
      disposition: 'CREATED',
      leadId: first.lead.id,
    });
    expect(adapter.events).toHaveLength(1);
    expect(JSON.stringify(adapter.events[0])).not.toContain(first.lead.phone);
  });

  it('replays the same idempotency key without a second event', async () => {
    const adapter = new InMemoryLeadIngestionAdapter();
    const first = transaction();
    await adapter.createLeadWithOutbox(first);

    await expect(adapter.createLeadWithOutbox(first)).resolves.toEqual({
      disposition: 'DUPLICATE',
      leadId: first.lead.id,
      duplicateReason: 'IDEMPOTENCY_KEY',
    });
    expect(adapter.events).toHaveLength(1);
  });

  it('rejects the same key with a different fingerprint', async () => {
    const adapter = new InMemoryLeadIngestionAdapter();
    await adapter.createLeadWithOutbox(transaction());

    await expect(
      adapter.createLeadWithOutbox(transaction({ requestFingerprint: 'b'.repeat(64) })),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it('links a new key to an existing source reference', async () => {
    const adapter = new InMemoryLeadIngestionAdapter();
    const first = transaction();
    await adapter.createLeadWithOutbox(first);

    await expect(
      adapter.createLeadWithOutbox(
        transaction({
          idempotencyKey: 'lead:request-456',
          requestFingerprint: 'c'.repeat(64),
          lead: { ...first.lead, id: '8cbad6fe-aeb8-4530-9ca7-96fd228212c7' },
        }),
      ),
    ).resolves.toEqual({
      disposition: 'DUPLICATE',
      leadId: first.lead.id,
      duplicateReason: 'SOURCE_REFERENCE',
    });
    expect(adapter.events).toHaveLength(1);
  });
});
