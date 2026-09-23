import { AcceptInboundMessage } from './accept-inbound';
import { InMemoryInboundStore } from './in-memory-inbound.store';
import {
  ConversationControlError,
  SetConversationControl,
  allowsAutomatedReply,
} from './set-conversation-control';

const leadId = '92d60e65-14f0-4d4f-b9ae-062c8f685213';
const clock = { now: () => new Date('2026-09-23T12:00:00.000Z') };
const fingerprint = 'a'.repeat(64);

function ids(values: string[]): { next(): string } {
  const remaining = [...values];
  return { next: () => remaining.shift() ?? '66666666-6666-4666-8666-666666666666' };
}

async function openConversation(): Promise<{
  store: InMemoryInboundStore;
  conversationId: string;
}> {
  const store = new InMemoryInboundStore();
  const recorded = await new AcceptInboundMessage(
    store,
    clock,
    ids([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
      '55555555-5555-4555-8555-555555555555',
    ]),
  ).execute({
    leadId,
    source: 'SYNTHETIC',
    phone: '+905551112233',
    providerMessageId: 'mock-message-1',
    body: 'gizli mesaj',
    correlationId: 'request:trace-123',
    automationPaused: false,
  });
  return { store, conversationId: recorded.conversationId };
}

function command(
  conversationId: string,
  overrides: Record<string, unknown> = {},
): {
  conversationId: string;
  actorId: string;
  controlMode: 'AI_ACTIVE' | 'HUMAN_CONTROL' | 'PAUSED';
  expectedVersion: number;
  idempotencyKey: string;
  requestFingerprint: string;
  correlationId: string;
  automationPaused: boolean;
} {
  return {
    conversationId,
    actorId: 'operator-1',
    controlMode: 'HUMAN_CONTROL',
    expectedVersion: 1,
    idempotencyKey: 'control:takeover-1',
    requestFingerprint: fingerprint,
    correlationId: 'request:trace-123',
    automationPaused: false,
    ...overrides,
  };
}

describe('SetConversationControl', () => {
  it('gives the conversation to a human and keeps the phone out of the event', async () => {
    const { store, conversationId } = await openConversation();
    const useCase = new SetConversationControl(
      store,
      clock,
      ids([
        '77777777-7777-4777-8777-777777777777',
        '88888888-8888-4888-8888-888888888888',
        '99999999-9999-4999-8999-999999999999',
      ]),
    );

    const changed = await useCase.execute(command(conversationId));
    const duplicate = await useCase.execute(command(conversationId));

    expect(changed).toEqual({
      disposition: 'CHANGED',
      conversationId,
      controlMode: 'HUMAN_CONTROL',
      version: 2,
      automatedReplyAllowed: false,
    });
    expect(duplicate.disposition).toBe('DUPLICATE');
    expect(duplicate.version).toBe(2);
    expect(store.controlEvents).toHaveLength(1);
    const evidence = JSON.stringify({
      events: store.controlEvents,
      audits: store.controlAudits,
    });
    expect(evidence).not.toContain('+905551112233');
    expect(evidence).not.toContain('gizli mesaj');
    expect(allowsAutomatedReply('HUMAN_CONTROL', false)).toBe(false);
    expect(allowsAutomatedReply('AI_ACTIVE', true)).toBe(false);
    expect(allowsAutomatedReply('AI_ACTIVE', false)).toBe(true);
  });

  it('refuses to resume automation while the kill switch is on', async () => {
    const { store, conversationId } = await openConversation();
    const useCase = new SetConversationControl(store, clock, ids([]));
    await useCase.execute(command(conversationId));

    await expect(
      useCase.execute(
        command(conversationId, {
          controlMode: 'AI_ACTIVE',
          expectedVersion: 2,
          idempotencyKey: 'control:resume-1',
          automationPaused: true,
        }),
      ),
    ).rejects.toMatchObject({ code: 'KILL_SWITCH_ACTIVE' });
    expect(store.controlEvents).toHaveLength(1);
  });

  it('rejects a stale version and a reused key with a different request', async () => {
    const { store, conversationId } = await openConversation();
    const useCase = new SetConversationControl(store, clock, ids([]));
    await useCase.execute(command(conversationId));

    await expect(
      useCase.execute(
        command(conversationId, {
          controlMode: 'PAUSED',
          expectedVersion: 1,
          idempotencyKey: 'control:pause-1',
        }),
      ),
    ).rejects.toBeInstanceOf(ConversationControlError);

    await expect(
      useCase.execute(
        command(conversationId, {
          requestFingerprint: 'b'.repeat(64),
        }),
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  });
});
