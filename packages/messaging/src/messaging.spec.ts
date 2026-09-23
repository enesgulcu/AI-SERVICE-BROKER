import { createHmac } from 'node:crypto';
import { assessOutbound } from './outbound';
import { verifyWebhookSignature } from './signature';

describe('outbound delivery', () => {
  it('accepts a human-approved mock template and refuses WhatsApp and unattended AI', () => {
    expect(
      assessOutbound({
        channel: 'MOCK',
        origin: 'HUMAN',
        controlMode: 'PAUSED',
        automationPaused: true,
        templateApproved: true,
      }),
    ).toEqual({ ok: true, channel: 'MOCK', disposition: 'MOCK_ACCEPTED' });
    expect(
      assessOutbound({
        channel: 'WHATSAPP',
        origin: 'HUMAN',
        controlMode: 'AI_ACTIVE',
        automationPaused: false,
        templateApproved: true,
      }),
    ).toMatchObject({ ok: false, code: 'UNSAFE_CHANNEL' });
    expect(
      assessOutbound({
        channel: 'MOCK',
        origin: 'AI',
        controlMode: 'HUMAN_CONTROL',
        automationPaused: false,
        templateApproved: true,
      }),
    ).toMatchObject({ ok: false, code: 'AUTOMATION_STOPPED' });
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
