import {
  assessPersonalDataPilot,
  authorizeOperator,
  buildJobSnapshot,
  calculatePrice,
  companyFact,
  concede,
  consumeRate,
  funnel,
  guardCustomerDraft,
  issueQuote,
  issueSandboxQuote,
  maskPhone,
  negotiateDiscount,
  planFollowUp,
  planSandboxFollowUp,
  recordRisk,
  SANDBOX_RATE_CARD,
  scheduledHours,
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

  it('rejects an empty draft and promise, legal, policy, or risk language', () => {
    expect(guardCustomerDraft('  ').reasons).toEqual(['DRAFT_EMPTY']);
    expect(guardCustomerDraft('Net fiyat 1000 TL.').reasons).toContain('PROMISE_LANGUAGE');
    expect(guardCustomerDraft('Kusur bizim, sorumluluğu kabul ediyoruz.').reasons).toEqual(
      expect.arrayContaining(['LEGAL_COMMITMENT']),
    );
    expect(guardCustomerDraft('10 yıldır 500 müşteriye hizmet veriyoruz.').reasons).toContain(
      'UNAPPROVED_COMPANY_FACT',
    );
    expect(guardCustomerDraft('Hastalık bilgisi gerekir.').reasons).toContain(
      'RISK_REVIEW_REQUIRED',
    );
    const sandbox = guardCustomerDraft(
      'Merhaba, bu mesaj otomatik bir taslaktır ve bir insan onayından sonra iletilir. Hizmet veya personel konusunda taahhüt içermez. İsterseniz bir insan temsilciden destek isteyebilirsiniz.',
    );
    expect(sandbox).toEqual({ ok: true, policyVersion: 'policy-empty-v1', reasons: [] });
  });

  it('limits repeated calls inside one window', () => {
    const state = new Map<string, { windowStart: number; count: number }>();
    expect(consumeRate(state, 'client', 1_000, 2, 60_000)).toBe(true);
    expect(consumeRate(state, 'client', 1_100, 2, 60_000)).toBe(true);
    expect(consumeRate(state, 'client', 1_200, 2, 60_000)).toBe(false);
  });

  it('issues a non-binding sandbox quote and refuses a discount', () => {
    const hours = scheduledHours('09:00-13:00');
    const quote = issueSandboxQuote(calculatePrice(SANDBOX_RATE_CARD, hours ?? 0));
    expect(quote).toMatchObject({
      ok: true,
      binding: false,
      authority: 'SANDBOX',
      tariff: false,
      totalMinor: 4,
    });
    expect(negotiateDiscount(100)).toEqual({ ok: false, code: 'NO_CONCESSION_AUTHORITY' });
    expect(negotiateDiscount(0)).toMatchObject({ ok: true, discountBps: 0, maxDiscountBps: 0 });
    expect(planSandboxFollowUp({ channel: 'MOCK', automatic: false })).toMatchObject({
      ok: true,
      sent: false,
    });
    expect(planSandboxFollowUp({ channel: 'WHATSAPP', automatic: false })).toEqual({
      ok: false,
      code: 'FOLLOW_UP_NOT_APPROVED',
    });
    expect(
      buildJobSnapshot({ requirementVersion: 1, quoteVersion: 1, totalMinor: 4 }),
    ).toMatchObject({ ok: true, contract: false });
  });

  it('keeps real data closed unless the pilot approval matches', () => {
    expect(
      assessPersonalDataPilot({
        mode: 'synthetic',
        synthetic: false,
        approvalId: 'approval-12345678',
        expectedApprovalId: 'approval-12345678',
      }),
    ).toEqual({ ok: false, code: 'REAL_DATA_INGESTION_BLOCKED' });
    expect(
      assessPersonalDataPilot({
        mode: 'approved',
        synthetic: false,
        approvalId: 'wrong-approval',
        expectedApprovalId: 'approval-12345678',
      }),
    ).toEqual({ ok: false, code: 'PILOT_APPROVAL_REQUIRED' });
    expect(
      assessPersonalDataPilot({
        mode: 'approved',
        synthetic: false,
        approvalId: 'approval-12345678',
        expectedApprovalId: 'approval-12345678',
      }),
    ).toEqual({ ok: true });
  });

  it('lets a viewer read and stops a viewer from writing when token auth is on', () => {
    expect(
      authorizeOperator({
        method: 'GET',
        path: '/health/live',
        authorization: undefined,
        mode: 'token',
        token: 'operator-token-1',
        role: 'viewer',
      }),
    ).toMatchObject({ ok: true });
    expect(
      authorizeOperator({
        method: 'GET',
        path: '/v1/funnel',
        authorization: 'Bearer operator-token-1',
        mode: 'token',
        token: 'operator-token-1',
        role: 'viewer',
      }),
    ).toMatchObject({ ok: true, role: 'viewer' });
    expect(
      authorizeOperator({
        method: 'POST',
        path: '/v1/quotes',
        authorization: 'Bearer operator-token-1',
        mode: 'token',
        token: 'operator-token-1',
        role: 'viewer',
      }),
    ).toEqual({ ok: false, status: 403, code: 'FORBIDDEN' });
    expect(
      authorizeOperator({
        method: 'POST',
        path: '/v1/quotes',
        authorization: undefined,
        mode: 'disabled',
        token: '',
        role: 'operator',
      }),
    ).toMatchObject({ ok: true, role: 'local' });
  });
});
