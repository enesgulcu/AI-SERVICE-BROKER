import { AcceptInboundMessage, InboundMessageConflictError } from './accept-inbound';
import { InMemoryInboundStore } from './in-memory-inbound.store';

const leadId = '92d60e65-14f0-4d4f-b9ae-062c8f685213';
const clock = { now: () => new Date('2026-09-23T12:00:00.000Z') };

function ids(): { next(): string } {
  const values = [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444',
    '55555555-5555-4555-8555-555555555555',
  ];
  return { next: () => values.shift() ?? '66666666-6666-4666-8666-666666666666' };
}

function command(overrides: Record<string, unknown> = {}) {
  return {
    leadId,
    source: 'SYNTHETIC',
    phone: '+905551112233',
    providerMessageId: 'mock-message-1',
    body: 'gizli mesaj',
    correlationId: 'request:trace-123',
    automationPaused: false,
    ...overrides,
  };
}

describe('AcceptInboundMessage', () => {
  it('records one inbound message and keeps the phone and body out of events', async () => {
    const store = new InMemoryInboundStore();
    const useCase = new AcceptInboundMessage(store, clock, ids());
    const recorded = await useCase.execute(command());
    const duplicate = await useCase.execute(command());

    expect(recorded).toMatchObject({
      disposition: 'RECORDED',
      controlMode: 'AI_ACTIVE',
      identityVerified: false,
    });
    expect(duplicate).toMatchObject({
      disposition: 'DUPLICATE',
      messageId: recorded.messageId,
      customerId: recorded.customerId,
    });
    expect(store.events).toHaveLength(1);
    const evidence = JSON.stringify({ events: store.events, audits: store.audits });
    expect(evidence).not.toContain('+905551112233');
    expect(evidence).not.toContain('gizli mesaj');
  });

  it('pauses the conversation and still stores the message when automation is paused', async () => {
    const store = new InMemoryInboundStore();
    const result = await new AcceptInboundMessage(store, clock, ids()).execute(
      command({ automationPaused: true, providerMessageId: 'mock-message-2' }),
    );

    expect(result.controlMode).toBe('PAUSED');
    expect(store.events[0]?.payload.controlMode).toBe('PAUSED');
  });

  it('rejects the same provider message when the body changes', async () => {
    const store = new InMemoryInboundStore();
    const useCase = new AcceptInboundMessage(store, clock, ids());
    await useCase.execute(command());

    await expect(useCase.execute(command({ body: 'baska metin' }))).rejects.toBeInstanceOf(
      InboundMessageConflictError,
    );
  });

  it('keeps one customer when a second lead uses the same phone', async () => {
    const store = new InMemoryInboundStore();
    const useCase = new AcceptInboundMessage(store, clock, ids());
    const first = await useCase.execute(command());
    const second = await useCase.execute(
      command({
        leadId: '92d60e65-14f0-4d4f-b9ae-062c8f685214',
        providerMessageId: 'mock-message-2',
        body: 'ikinci mesaj',
      }),
    );

    expect(second.customerId).toBe(first.customerId);
    expect(second.conversationId).toBe(first.conversationId);
    expect(second.messageId).not.toBe(first.messageId);
    expect(store.events).toHaveLength(2);
  });

  it('rejects a real lead source', async () => {
    const store = new InMemoryInboundStore();
    await expect(
      new AcceptInboundMessage(store, clock, ids()).execute(command({ source: 'SAHIBINDEN' })),
    ).rejects.toMatchObject({ code: 'CONTACT_NOT_ELIGIBLE' });
    expect(store.events).toHaveLength(0);
  });
});
