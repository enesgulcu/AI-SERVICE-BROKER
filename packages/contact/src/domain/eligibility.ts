import type { LeadSnapshot } from '@ai-service-broker/lead';

const SYNTHETIC_SOURCES = new Set(['SYNTHETIC', 'TEST']);

export type EligibilityReason = 'ELIGIBLE_SYNTHETIC' | 'SOURCE_NOT_APPROVED';

export function evaluateContactEligibility(
  lead: Pick<LeadSnapshot, 'source' | 'status'>,
):
  | { eligible: true; reasonCode: 'ELIGIBLE_SYNTHETIC' }
  | { eligible: false; reasonCode: EligibilityReason } {
  if (lead.status === 'NEW' && SYNTHETIC_SOURCES.has(lead.source)) {
    return { eligible: true, reasonCode: 'ELIGIBLE_SYNTHETIC' };
  }

  return { eligible: false, reasonCode: 'SOURCE_NOT_APPROVED' };
}

export function isApprovedContactSource(source: string): boolean {
  return SYNTHETIC_SOURCES.has(source);
}
