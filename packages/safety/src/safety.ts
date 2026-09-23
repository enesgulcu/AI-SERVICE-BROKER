import { timingSafeEqual } from 'node:crypto';

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

const PROMISE_LANGUAGE = /garanti|iade|tazminat|ücret|fiyat|maaş|işe al|₺|\btl\b|\btry\b/i;
const LEGAL_COMMITMENT =
  /sorumluluğu kabul|kusur biz|iş sözleşmesi|işvereniyiz|kadromuza|bağlayıcı sözleşme/i;
const UNAPPROVED_FACT = /\d+\s*(yıl|yıldır|personel|çalışan|müşteri)|%\d|\d+\s*%/i;
const RISK_LANGUAGE = /\b(amk|siktir|orospu)\b|tc kimlik|kimlik numarası|hastalık|hamile|engelli/i;

export type CustomerDraftGuardReason =
  | 'DRAFT_EMPTY'
  | 'PROMISE_LANGUAGE'
  | 'LEGAL_COMMITMENT'
  | 'UNAPPROVED_COMPANY_FACT'
  | 'RISK_REVIEW_REQUIRED';

export function guardCustomerDraft(draft: string): {
  ok: boolean;
  policyVersion: typeof POLICY_VERSION;
  reasons: CustomerDraftGuardReason[];
} {
  const text = draft.trim();
  if (text.length === 0) {
    return { ok: false, policyVersion: POLICY_VERSION, reasons: ['DRAFT_EMPTY'] };
  }

  const reasons: CustomerDraftGuardReason[] = [];
  if (PROMISE_LANGUAGE.test(text)) {
    reasons.push('PROMISE_LANGUAGE');
  }
  if (LEGAL_COMMITMENT.test(text)) {
    reasons.push('LEGAL_COMMITMENT');
  }
  if (UNAPPROVED_FACT.test(text)) {
    reasons.push('UNAPPROVED_COMPANY_FACT');
  }
  if (RISK_LANGUAGE.test(text)) {
    reasons.push('RISK_REVIEW_REQUIRED');
  }
  return { ok: reasons.length === 0, policyVersion: POLICY_VERSION, reasons };
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

export function operationalDashboard(input: {
  statusCounts: Readonly<Record<string, number>>;
  manualReviewCount: number;
  riskReviewCount: number;
}): {
  stages: Array<{ status: string; count: number }>;
  qualifiedCount: number;
  manualReviewCount: number;
  riskReviewCount: number;
  cost: { available: false; code: 'COST_NOT_AVAILABLE' };
} {
  const stages = funnel(input.statusCounts);
  return {
    stages,
    qualifiedCount: stages.find((stage) => stage.status === 'QUALIFIED')?.count ?? 0,
    manualReviewCount: input.manualReviewCount,
    riskReviewCount: input.riskReviewCount,
    cost: { available: false, code: 'COST_NOT_AVAILABLE' },
  };
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `***${digits.slice(-2)}`;
}

export const SANDBOX_RATE_CARD: PriceCard = {
  version: 'sandbox-rate-card-v1',
  currency: 'TRY',
  hourlyMinor: 1,
};

export const SANDBOX_FOLLOW_UP_POLICY = 'sandbox-follow-up-v1';

export function scheduledHours(value: string): number | null {
  const match = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const start = Number(match[1]) * 60 + Number(match[2]);
  const end = Number(match[3]) * 60 + Number(match[4]);
  const minutes = end - start;
  if (minutes <= 0 || minutes % 60 !== 0) {
    return null;
  }
  const hours = minutes / 60;
  if (hours < 1 || hours > 24) {
    return null;
  }
  return hours;
}

export function issueSandboxQuote(calculation: ReturnType<typeof calculatePrice>):
  | { ok: false; code: 'PRICING_NOT_AVAILABLE' | 'QUOTE_NOT_BINDING' }
  | {
      ok: true;
      binding: false;
      authority: 'SANDBOX';
      tariff: false;
      currency: 'TRY';
      totalMinor: number;
      cardVersion: string;
    } {
  if (!calculation.ok || calculation.cardVersion !== SANDBOX_RATE_CARD.version) {
    return { ok: false, code: 'PRICING_NOT_AVAILABLE' };
  }
  if (calculation.binding !== false) {
    return { ok: false, code: 'QUOTE_NOT_BINDING' };
  }
  return {
    ok: true,
    binding: false,
    authority: 'SANDBOX',
    tariff: false,
    currency: calculation.currency,
    totalMinor: calculation.totalMinor,
    cardVersion: calculation.cardVersion,
  };
}

export function negotiateDiscount(
  requestedDiscountBps: number,
):
  | { ok: true; discountBps: 0; authority: 'SANDBOX'; maxDiscountBps: 0 }
  | { ok: false; code: 'NO_CONCESSION_AUTHORITY' } {
  if (requestedDiscountBps !== 0) {
    return { ok: false, code: 'NO_CONCESSION_AUTHORITY' };
  }
  return { ok: true, discountBps: 0, authority: 'SANDBOX', maxDiscountBps: 0 };
}

export function planSandboxFollowUp(input: { channel: string; automatic: boolean }):
  | { ok: false; code: 'FOLLOW_UP_NOT_APPROVED' }
  | {
      ok: true;
      policyVersion: typeof SANDBOX_FOLLOW_UP_POLICY;
      channel: 'MOCK';
      automatic: false;
      sent: false;
    } {
  if (input.channel !== 'MOCK' || input.automatic) {
    return { ok: false, code: 'FOLLOW_UP_NOT_APPROVED' };
  }
  return {
    ok: true,
    policyVersion: SANDBOX_FOLLOW_UP_POLICY,
    channel: 'MOCK',
    automatic: false,
    sent: false,
  };
}

export function attestAcceptance(): {
  ok: true;
  kind: 'OPERATIONAL';
  contract: false;
} {
  return { ok: true, kind: 'OPERATIONAL', contract: false };
}

export function buildJobSnapshot(input: {
  requirementVersion: number;
  quoteVersion: number;
  totalMinor: number;
}):
  | { ok: false; code: 'JOB_NOT_AVAILABLE' }
  | {
      ok: true;
      contract: false;
      authority: 'SANDBOX';
      requirementVersion: number;
      quoteVersion: number;
      totalMinor: number;
      currency: 'TRY';
      binding: false;
    } {
  if (
    !Number.isInteger(input.requirementVersion) ||
    input.requirementVersion < 1 ||
    !Number.isInteger(input.quoteVersion) ||
    input.quoteVersion < 1 ||
    !Number.isInteger(input.totalMinor) ||
    input.totalMinor < 1
  ) {
    return { ok: false, code: 'JOB_NOT_AVAILABLE' };
  }
  return {
    ok: true,
    contract: false,
    authority: 'SANDBOX',
    requirementVersion: input.requirementVersion,
    quoteVersion: input.quoteVersion,
    totalMinor: input.totalMinor,
    currency: 'TRY',
    binding: false,
  };
}

export function assessPersonalDataPilot(input: {
  mode: 'synthetic' | 'approved';
  synthetic: boolean;
  approvalId: string | undefined;
  expectedApprovalId: string;
}): { ok: true } | { ok: false; code: 'REAL_DATA_INGESTION_BLOCKED' | 'PILOT_APPROVAL_REQUIRED' } {
  if (input.synthetic) {
    return { ok: true };
  }
  if (input.mode !== 'approved') {
    return { ok: false, code: 'REAL_DATA_INGESTION_BLOCKED' };
  }
  if (!input.expectedApprovalId || input.approvalId !== input.expectedApprovalId) {
    return { ok: false, code: 'PILOT_APPROVAL_REQUIRED' };
  }
  return { ok: true };
}

export function authorizeOperator(input: {
  method: string;
  path: string;
  authorization: string | undefined;
  mode: 'disabled' | 'token';
  token: string;
  role: 'viewer' | 'operator';
}):
  | { ok: true; role: 'local' | 'viewer' | 'operator' }
  | { ok: false; status: 401 | 403; code: 'UNAUTHENTICATED' | 'FORBIDDEN' } {
  if (input.path.startsWith('/health/')) {
    return { ok: true, role: 'local' };
  }
  if (input.mode === 'disabled') {
    return { ok: true, role: 'local' };
  }
  if (!bearerMatches(input.authorization, input.token)) {
    return { ok: false, status: 401, code: 'UNAUTHENTICATED' };
  }
  if (input.method !== 'GET' && input.method !== 'HEAD' && input.role === 'viewer') {
    return { ok: false, status: 403, code: 'FORBIDDEN' };
  }
  return { ok: true, role: input.role };
}

function bearerMatches(authorization: string | undefined, token: string): boolean {
  if (!authorization || !token) {
    return false;
  }
  const expected = Buffer.from(`Bearer ${token}`);
  const actual = Buffer.from(authorization);
  if (expected.length !== actual.length) {
    return false;
  }
  return timingSafeEqual(expected, actual);
}
