import { APPROVED_TEMPLATE_VERSION, isApprovedTemplate } from './templates';

export function assessWhatsAppProvider(input: {
  mode: 'disabled' | 'sandbox';
  templateVersion: string;
}):
  | { ok: false; code: 'UNSAFE_CHANNEL' | 'TEMPLATE_UNAPPROVED' }
  | {
      ok: true;
      provider: 'WHATSAPP_SANDBOX';
      network: false;
      templateVersion: typeof APPROVED_TEMPLATE_VERSION;
    } {
  if (input.mode !== 'sandbox') {
    return { ok: false, code: 'UNSAFE_CHANNEL' };
  }
  if (!isApprovedTemplate('MOCK', input.templateVersion)) {
    return { ok: false, code: 'TEMPLATE_UNAPPROVED' };
  }
  return {
    ok: true,
    provider: 'WHATSAPP_SANDBOX',
    network: false,
    templateVersion: APPROVED_TEMPLATE_VERSION,
  };
}

export function handoffPublishedEvent(
  eventType: string,
  channel: unknown,
): { provider: 'MOCK'; network: false; eventType: string } | { ok: false; code: 'UNSAFE_CHANNEL' } {
  if (channel !== undefined && channel !== 'MOCK') {
    return { ok: false, code: 'UNSAFE_CHANNEL' };
  }
  if (!eventType.trim()) {
    return { ok: false, code: 'UNSAFE_CHANNEL' };
  }
  return { provider: 'MOCK', network: false, eventType };
}
