import { isApprovedTemplate } from './templates';

export type CallbackStatus = 'DELIVERED' | 'FAILED';

export type CallbackDecision =
  | { ok: true; status: CallbackStatus }
  | { ok: false; code: 'UNSAFE_CHANNEL' | 'TEMPLATE_UNAPPROVED' | 'UNKNOWN_STATUS' };

export function assessDeliveryCallback(input: {
  channel: string;
  templateVersion: string;
  status: string;
}): CallbackDecision {
  if (input.channel !== 'MOCK') {
    return { ok: false, code: 'UNSAFE_CHANNEL' };
  }
  if (!isApprovedTemplate(input.channel, input.templateVersion)) {
    return { ok: false, code: 'TEMPLATE_UNAPPROVED' };
  }
  if (input.status !== 'DELIVERED' && input.status !== 'FAILED') {
    return { ok: false, code: 'UNKNOWN_STATUS' };
  }
  return { ok: true, status: input.status };
}

export interface DeliveryCallbackRecord {
  id: string;
  providerEventId: string;
  templateVersion: string;
  status: CallbackStatus;
}

export type CallbackSaveResult =
  { ok: true; disposition: 'CREATED' | 'DUPLICATE' } | { ok: false; code: 'CALLBACK_CONFLICT' };

export interface DeliveryCallbackStore {
  save(input: DeliveryCallbackRecord): Promise<CallbackSaveResult>;
}

export class InMemoryDeliveryCallbackStore implements DeliveryCallbackStore {
  private readonly byEvent = new Map<string, DeliveryCallbackRecord>();

  save(input: DeliveryCallbackRecord): Promise<CallbackSaveResult> {
    const existing = this.byEvent.get(input.providerEventId);
    if (!existing) {
      this.byEvent.set(input.providerEventId, input);
      return Promise.resolve({ ok: true, disposition: 'CREATED' });
    }
    if (existing.status !== input.status || existing.templateVersion !== input.templateVersion) {
      return Promise.resolve({ ok: false, code: 'CALLBACK_CONFLICT' });
    }
    return Promise.resolve({ ok: true, disposition: 'DUPLICATE' });
  }
}
