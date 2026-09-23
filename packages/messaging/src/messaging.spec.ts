import { createHmac } from 'node:crypto';
import { InMemoryDeliveryCallbackStore, assessDeliveryCallback } from './callback';
import { assessOutbound } from './outbound';
import { assessWhatsAppProvider, handoffPublishedEvent } from './provider';
import { verifyWebhookSignature } from './signature';
import { APPROVED_TEMPLATE_VERSION } from './templates';

describe('outbound delivery', () => {
  it('accepts a human-approved mock template and refuses WhatsApp and unattended AI', () => {
    expect(
      assessOutbound({
        channel: 'MOCK',
        origin: 'HUMAN',
        controlMode: 'PAUSED',
        automationPaused: true,
        templateApproved: true,
        templateVersion: APPROVED_TEMPLATE_VERSION,
      }),
    ).toEqual({ ok: true, channel: 'MOCK', disposition: 'MOCK_ACCEPTED' });
    expect(
      assessOutbound({
        channel: 'WHATSAPP',
        origin: 'HUMAN',
        controlMode: 'AI_ACTIVE',
        automationPaused: false,
        templateApproved: true,
        templateVersion: APPROVED_TEMPLATE_VERSION,
      }),
    ).toMatchObject({ ok: false, code: 'UNSAFE_CHANNEL' });
    expect(
      assessOutbound({
        channel: 'MOCK',
        origin: 'AI',
        controlMode: 'HUMAN_CONTROL',
        automationPaused: false,
        templateApproved: true,
        templateVersion: APPROVED_TEMPLATE_VERSION,
      }),
    ).toMatchObject({ ok: false, code: 'AUTOMATION_STOPPED' });
    expect(
      assessOutbound({
        channel: 'MOCK',
        origin: 'HUMAN',
        controlMode: 'AI_ACTIVE',
        automationPaused: false,
        templateApproved: true,
        templateVersion: 'whatsapp-utility-v1',
      }),
    ).toMatchObject({ ok: false, code: 'TEMPLATE_UNAPPROVED' });
  });
});

describe('delivery callbacks', () => {
  it('accepts one mock callback and rejects a different status for the same event', async () => {
    expect(
      assessDeliveryCallback({
        channel: 'WHATSAPP',
        templateVersion: APPROVED_TEMPLATE_VERSION,
        status: 'DELIVERED',
      }),
    ).toMatchObject({ ok: false, code: 'UNSAFE_CHANNEL' });
    const store = new InMemoryDeliveryCallbackStore();
    const input = {
      id: '11111111-1111-4111-8111-111111111111',
      providerEventId: 'mock-event-1',
      templateVersion: APPROVED_TEMPLATE_VERSION,
      status: 'DELIVERED' as const,
    };
    await expect(store.save(input)).resolves.toEqual({ ok: true, disposition: 'CREATED' });
    await expect(store.save(input)).resolves.toEqual({ ok: true, disposition: 'DUPLICATE' });
    await expect(store.save({ ...input, status: 'FAILED' })).resolves.toEqual({
      ok: false,
      code: 'CALLBACK_CONFLICT',
    });
  });
});

describe('provider handoff', () => {
  it('records a sandbox WhatsApp payload without a network call and refuses live mode', () => {
    expect(
      assessWhatsAppProvider({ mode: 'sandbox', templateVersion: APPROVED_TEMPLATE_VERSION }),
    ).toEqual({
      ok: true,
      provider: 'WHATSAPP_SANDBOX',
      network: false,
      templateVersion: APPROVED_TEMPLATE_VERSION,
    });
    expect(
      assessWhatsAppProvider({ mode: 'disabled', templateVersion: APPROVED_TEMPLATE_VERSION }),
    ).toEqual({
      ok: false,
      code: 'UNSAFE_CHANNEL',
    });
    expect(handoffPublishedEvent('LeadCreated', 'MOCK')).toMatchObject({
      provider: 'MOCK',
      network: false,
    });
    expect(handoffPublishedEvent('LeadCreated', 'WHATSAPP')).toEqual({
      ok: false,
      code: 'UNSAFE_CHANNEL',
    });
  });
});

describe('webhook signature', () => {
  it('accepts a fresh signature and rejects a missing secret', () => {
    const secret = 'test-webhook-secret';
    const timestamp = '1750000000000';
    const body = '{"ok":true}';
    const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
    const now = new Date(1750000000000);
    expect(verifyWebhookSignature({ secret, timestamp, body, signature, now })).toBe(true);
    expect(verifyWebhookSignature({ secret: '', timestamp, body, signature, now })).toBe(false);
    expect(verifyWebhookSignature({ secret, timestamp, body, signature: '00', now })).toBe(false);
  });
});
