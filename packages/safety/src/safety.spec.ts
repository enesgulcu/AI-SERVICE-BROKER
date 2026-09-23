import {
  calculatePrice,
  companyFact,
  concede,
  consumeRate,
  funnel,
  issueQuote,
  maskPhone,
  planFollowUp,
  recordRisk,
} from './safety';

describe('closed commercial and safety gates', () => {
  it('prices only a supplied card and still refuses to issue a binding quote', () => {
    expect(calculatePrice(null, 2)).toEqual({ ok: false, code: 'PRICING_NOT_AVAILABLE' });
    const fixture = calculatePrice(
      { version: 'fixture-not-approved', currency: 'TRY', hourlyMinor: 100 },
      2,
    );
    expect(fixture).toMatchObject({ ok: true, totalMinor: 200, binding: false });
    expect(issueQuote(fixture)).toEqual({ ok: false, code: 'QUOTE_NOT_BINDING' });
    expect(concede().code).toBe('NO_CONCESSION_AUTHORITY');
    expect(companyFact().code).toBe('NO_APPROVED_FACT');
    expect(planFollowUp().code).toBe('FOLLOW_UP_NOT_APPROVED');
  });

  it('keeps risk in review and masks a phone', () => {
    const recorded = recordRisk([], { code: 'SENSITIVE_DATA', severity: 'HIGH' });
    expect(recorded.ok && recorded.disposition).toBe('REVIEW');
    expect(maskPhone('+905551112233')).toBe('***33');
    expect(funnel({ NEW: 2, CONTACTED: 1 })).toEqual([
      { status: 'CONTACTED', count: 1 },
      { status: 'NEW', count: 2 },
    ]);
  });

  it('limits repeated calls inside one window', () => {
    const state = new Map<string, { windowStart: number; count: number }>();
    expect(consumeRate(state, 'client', 1_000, 2, 60_000)).toBe(true);
    expect(consumeRate(state, 'client', 1_100, 2, 60_000)).toBe(true);
    expect(consumeRate(state, 'client', 1_200, 2, 60_000)).toBe(false);
  });
});
