import { InMemoryLeadIngestionAdapter, Lead } from '@ai-service-broker/lead';
import { AdvanceWorkflow, WorkflowFlowError } from './advance-workflow';
import { InMemoryWorkflowStore } from './in-memory-workflow.store';

const leadId = '92d60e65-14f0-4d4f-b9ae-062c8f685213';
const clock = { now: () => new Date('2026-09-23T12:00:00.000Z') };
const fingerprint = 'a'.repeat(64);

async function contactedStore(): Promise<InMemoryWorkflowStore> {
  const leads = new InMemoryLeadIngestionAdapter();
  const created = Lead.create({
    id: leadId,
    source: 'SYNTHETIC',
    sourceReference: 'listing-1',
    phone: '+905551112233',
    receivedAt: new Date('2026-09-23T08:00:00.000Z'),
  });
  await leads.createLeadWithOutbox({
    idempotencyKey: 'lead:seed-1',
    requestFingerprint: 'c'.repeat(64),
    lead: created.snapshot(),
    rawPayload: {},
    event: {
      eventId: '44444444-4444-4444-8444-444444444444',
      eventType: 'LeadCreated',
      eventVersion: 1,
      aggregateType: 'Lead',
      aggregateId: leadId,
      occurredAt: created.snapshot().receivedAt,
      correlationId: 'request:trace-123',
      payload: {
        leadId,
        source: 'SYNTHETIC',
        sourceReference: 'listing-1',
        status: 'NEW',
      },
    },
  });
  await leads.save(created.markContactPending().snapshot());
  const pending = await leads.findById(leadId);
  await leads.save(Lead.rehydrate(pending!).markContacted().snapshot());
  return new InMemoryWorkflowStore(leads);
}

describe('AdvanceWorkflow', () => {
  it('records interest once and keeps the phone out of the event', async () => {
    const store = await contactedStore();
    const useCase = new AdvanceWorkflow(store, clock, {
      next: () => '77777777-7777-4777-8777-777777777777',
    });
    const command = {
      leadId,
      actorId: 'operator-1',
      toStatus: 'INTERESTED' as const,
      reasonCode: null,
      expectedVersion: 3,
      idempotencyKey: 'workflow:interest-1',
      requestFingerprint: fingerprint,
      correlationId: 'request:trace-123',
    };

    const changed = await useCase.execute(command);
    const duplicate = await useCase.execute(command);

    expect(changed).toMatchObject({
      disposition: 'CHANGED',
      toStatus: 'INTERESTED',
      version: 4,
      policyVersion: 'workflow-v1',
      reasonCode: 'NONE',
    });
    expect(duplicate.disposition).toBe('DUPLICATE');
    expect(JSON.stringify(store.events)).not.toContain('+905551112233');
    expect(store.events).toHaveLength(1);
  });

  it('refuses a quote transition before pricing exists', async () => {
    const store = await contactedStore();
    await expect(
      new AdvanceWorkflow(store, clock, {
        next: () => '77777777-7777-4777-8777-777777777777',
      }).execute({
        leadId,
        actorId: 'operator-1',
        toStatus: 'QUOTE_READY',
        reasonCode: null,
        expectedVersion: 3,
        idempotencyKey: 'workflow:quote-1',
        requestFingerprint: fingerprint,
        correlationId: 'request:trace-123',
      }),
    ).rejects.toMatchObject({ code: 'GATE_CLOSED', gate: 'PRICING_NOT_AVAILABLE' });
    expect(store.events).toHaveLength(0);
  });

  it('does not bypass first contact', async () => {
    const store = await contactedStore();
    const fresh = await store.findLead(leadId);
    expect(fresh?.status).toBe('CONTACTED');
    await expect(
      new AdvanceWorkflow(store, clock, {
        next: () => '77777777-7777-4777-8777-777777777777',
      }).execute({
        leadId,
        actorId: 'operator-1',
        toStatus: 'NEW',
        reasonCode: null,
        expectedVersion: 3,
        idempotencyKey: 'workflow:back-1',
        requestFingerprint: fingerprint,
        correlationId: 'request:trace-123',
      }),
    ).rejects.toBeInstanceOf(WorkflowFlowError);
  });
});
