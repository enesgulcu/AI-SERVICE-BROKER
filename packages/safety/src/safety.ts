export const POLICY_VERSION = 'policy-empty-v1';

export type RiskCode = 'ABUSE_LANGUAGE' | 'SENSITIVE_DATA' | 'CONTRADICTION';
export type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface RiskSignal {
  code: RiskCode;
  severity: RiskSeverity;
}

const CODES = new Set<RiskCode>(['ABUSE_LANGUAGE', 'SENSITIVE_DATA', 'CONTRADICTION']);

export function recordRisk(
  existing: readonly RiskSignal[],
  signal: RiskSignal,
):
  | { ok: true; disposition: 'REVIEW'; signals: RiskSignal[] }
  | { ok: false; code: 'UNKNOWN_SIGNAL' } {
  if (!CODES.has(signal.code)) {
    return { ok: false, code: 'UNKNOWN_SIGNAL' };
  }
  return { ok: true, disposition: 'REVIEW', signals: [...existing, signal] };
}

export function companyFact(): {
  ok: false;
  code: 'NO_APPROVED_FACT';
  policyVersion: typeof POLICY_VERSION;
} {
  return { ok: false, code: 'NO_APPROVED_FACT', policyVersion: POLICY_VERSION };
}

export interface PriceCard {
  version: string;
  currency: 'TRY';
  hourlyMinor: number;
}

export function calculatePrice(
  card: PriceCard | null,
  hours: number,
):
  | { ok: false; code: 'PRICING_NOT_AVAILABLE' }
  | { ok: true; currency: 'TRY'; totalMinor: number; cardVersion: string; binding: false } {
  if (!card || !Number.isInteger(hours) || hours < 1 || hours > 24 || card.hourlyMinor < 1) {
    return { ok: false, code: 'PRICING_NOT_AVAILABLE' };
  }
  return {
    ok: true,
    currency: 'TRY',
    totalMinor: card.hourlyMinor * hours,
    cardVersion: card.version,
    binding: false,
  };
}

export function issueQuote(calculation: { ok: boolean; binding?: false }): {
  ok: false;
  code: 'PRICING_NOT_AVAILABLE' | 'QUOTE_NOT_BINDING';
} {
  if (!calculation.ok) {
    return { ok: false, code: 'PRICING_NOT_AVAILABLE' };
  }
  return { ok: false, code: 'QUOTE_NOT_BINDING' };
}

export function concede(): { ok: false; code: 'NO_CONCESSION_AUTHORITY' } {
  return { ok: false, code: 'NO_CONCESSION_AUTHORITY' };
}

export function planFollowUp(): { ok: false; code: 'FOLLOW_UP_NOT_APPROVED' } {
  return { ok: false, code: 'FOLLOW_UP_NOT_APPROVED' };
}

export function consumeRate(
  state: Map<string, { windowStart: number; count: number }>,
  key: string,
  now: number,
  limit: number,
  windowMs: number,
): boolean {
  const current = state.get(key);
  if (!current || now - current.windowStart >= windowMs) {
    state.set(key, { windowStart: now, count: 1 });
    return true;
  }
  if (current.count >= limit) {
    return false;
  }
  current.count += 1;
  return true;
}

export function funnel(
  counts: Readonly<Record<string, number>>,
): Array<{ status: string; count: number }> {
  return Object.entries(counts)
    .map(([status, count]) => ({ status, count }))
    .sort((left, right) => left.status.localeCompare(right.status));
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `***${digits.slice(-2)}`;
}
