export const APPROVED_TEMPLATE_VERSION = 'sandbox-first-contact-v1' as const;

export function isApprovedTemplate(channel: string, templateVersion: string): boolean {
  return channel === 'MOCK' && templateVersion === APPROVED_TEMPLATE_VERSION;
}
