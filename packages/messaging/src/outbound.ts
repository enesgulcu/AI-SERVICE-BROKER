import { isApprovedTemplate } from './templates';

export type DeliveryOrigin = 'AI' | 'HUMAN';
export type DeliveryControl = 'AI_ACTIVE' | 'HUMAN_CONTROL' | 'PAUSED';

export type DeliveryDecision =
  | { ok: true; channel: 'MOCK'; disposition: 'MOCK_ACCEPTED' }
  | { ok: false; code: 'UNSAFE_CHANNEL' | 'AUTOMATION_STOPPED' | 'TEMPLATE_UNAPPROVED' };

export function assessOutbound(input: {
  channel: string;
  origin: DeliveryOrigin;
  controlMode: DeliveryControl;
  automationPaused: boolean;
  templateApproved: boolean;
  templateVersion: string;
}): DeliveryDecision {
  if (input.channel !== 'MOCK') {
    return { ok: false, code: 'UNSAFE_CHANNEL' };
  }
  if (!input.templateApproved || !isApprovedTemplate(input.channel, input.templateVersion)) {
    return { ok: false, code: 'TEMPLATE_UNAPPROVED' };
  }
  if (input.origin === 'AI' && (input.automationPaused || input.controlMode !== 'AI_ACTIVE')) {
    return { ok: false, code: 'AUTOMATION_STOPPED' };
  }
  return { ok: true, channel: 'MOCK', disposition: 'MOCK_ACCEPTED' };
}
