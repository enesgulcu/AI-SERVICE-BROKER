import { InMemoryOutboxStore } from './in-memory-outbox.store';
import { canRedrive, drainOutbox, type OutboxMessage } from './outbox';

const now = new Date('2026-09-23T10:00:00.000Z');
const clock = { now: () => now };

function message(overrides: Partial<OutboxMessage> = {}): OutboxMessage {
  return {
    eventId: '44444444-4444-4444-8444-444444444444',
    eventType: 'LeadCreated',
    eventVersion: 1,
    aggregateType: 'Lead',
    aggregateId: '92d60e65-14f0-4d4f-b9ae-062c8f685213',
    occurredAt: now,
    correlationId: 'request:trace-123',
    payload: {
      leadId: '92d60e65-14f0-4d4f-b9ae-062c8f685213',
      source: 'SYNTHETIC',
      sourceReference: 'listing-1',
      status: 'NEW',
    },
    attempts: 0,
    availableAt: now,
    ...overrides,
  };
}

const options = { batchSize: 10, maxAttempts: 3, automationPaused: false };

describe('drainOutbox', () => {
  it('publishes a known internal event once and does not send anything', async () => {
    const store = new InMemoryOutboxStore();
    store.add(message());

    await expect(drainOutbox(store, clock, options)).resolves.toEqual({
      disposition: 'DRAINED',
      published: 1,
      retried: 0,
      dead: 0,
    });
    await expect(drainOutbox(store, clock, options)).resolves.toMatchObject({ published: 0 });
    expect(store.snapshot()[0]?.publishedAt?.toISOString()).toBe(now.toISOString());
  });

  it('dead-letters an unknown event, an unsafe payload, and a non-mock channel', async () => {
    const store = new InMemoryOutboxStore();
    store.add(message({ eventId: '11111111-1111-4111-8111-111111111111', eventVersion: 2 }));
    store.add(
      message({
        eventId: '22222222-2222-4222-8222-222222222222',
        payload: {
          leadId: '92d60e65-14f0-4d4f-b9ae-062c8f685213',
          source: 'SYNTHETIC',
          sourceReference: 'listing-1',
          status: 'NEW',
          phone: '+905551112233',
        },
      }),
    );
    store.add(
      message({
        eventId: '33333333-3333-4333-8333-333333333333',
        eventType: 'LeadContacted',
        payload: {
          reviewId: '11111111-1111-4111-8111-111111111111',
          leadId: '92d60e65-14f0-4d4f-b9ae-062c8f685213',
          channel: 'WHATSAPP',
          templateVersion: 'sandbox-first-contact-v1',
        },
      }),
    );

    const result = await drainOutbox(store, clock, options);

    expect(result).toMatchObject({ published: 0, dead: 3 });
    const errors = store.snapshot().map((item) => item.lastError);
    expect(errors).toEqual(['UNKNOWN_EVENT', 'UNSAFE_PAYLOAD', 'UNSAFE_CHANNEL']);
    expect(errors.join(' ')).not.toContain('+905551112233');
  });

  it('publishes a recorded inbound fact and does not send a reply', async () => {
    const store = new InMemoryOutboxStore();
    store.add(
      message({
        eventType: 'InboundMessageRecorded',
        aggregateType: 'Conversation',
        payload: {
          messageId: '33333333-3333-4333-8333-333333333333',
          conversationId: '22222222-2222-4222-8222-222222222222',
          customerId: '11111111-1111-4111-8111-111111111111',
          channel: 'MOCK',
          controlMode: 'PAUSED',
        },
      }),
    );

    await expect(drainOutbox(store, clock, options)).resolves.toMatchObject({
      published: 1,
      dead: 0,
    });
  });

  it('publishes a conversation control change without an outbound message', async () => {
    const store = new InMemoryOutboxStore();
    store.add(
      message({
        eventType: 'ConversationControlChanged',
        aggregateType: 'Conversation',
        payload: {
          conversationId: '22222222-2222-4222-8222-222222222222',
          controlMode: 'HUMAN_CONTROL',
          version: 2,
        },
      }),
    );

    await expect(drainOutbox(store, clock, options)).resolves.toMatchObject({
      published: 1,
      dead: 0,
    });
  });

  it('publishes a workflow transition without a phone number', async () => {
    const store = new InMemoryOutboxStore();
    store.add(
      message({
        eventType: 'WorkflowTransitioned',
        payload: {
          leadId: '92d60e65-14f0-4d4f-b9ae-062c8f685213',
          fromStatus: 'CONTACTED',
          toStatus: 'INTERESTED',
          policyVersion: 'workflow-v1',
          reasonCode: 'NONE',
        },
      }),
    );

    await expect(drainOutbox(store, clock, options)).resolves.toMatchObject({
      published: 1,
      dead: 0,
    });
  });

  it('does not claim events while automation is paused', async () => {
    const store = new InMemoryOutboxStore();
    store.add(message());

    await expect(
      drainOutbox(store, clock, { ...options, automationPaused: true }),
    ).resolves.toEqual({
      disposition: 'PAUSED',
      published: 0,
      retried: 0,
      dead: 0,
    });
    expect(store.snapshot()[0]?.attempts).toBe(0);
    expect(store.snapshot()[0]?.publishedAt).toBeUndefined();
  });

  it('redrives a known safe event and refuses an unsafe channel', async () => {
    const safe = message({
      eventType: 'RequirementVersionRecorded',
      payload: {
        leadId: '92d60e65-14f0-4d4f-b9ae-062c8f685213',
        requirementVersion: 1,
        schemaVersion: 'regular-home-helper-v1',
        ready: false,
        missingCount: 2,
      },
    });
    expect(canRedrive(safe)).toBe(true);
    expect(
      canRedrive(
        message({
          eventType: 'LeadContacted',
          payload: {
            reviewId: '11111111-1111-4111-8111-111111111111',
            leadId: '92d60e65-14f0-4d4f-b9ae-062c8f685213',
            channel: 'WHATSAPP',
            templateVersion: 'sandbox-first-contact-v1',
          },
        }),
      ),
    ).toBe(false);
    const store = new InMemoryOutboxStore();
    store.add(safe);
    await expect(drainOutbox(store, clock, options)).resolves.toMatchObject({ published: 1 });
  });
});
