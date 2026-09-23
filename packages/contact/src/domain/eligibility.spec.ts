import { evaluateContactEligibility } from './eligibility';

describe('contact eligibility', () => {
  it('allows a new synthetic lead', () => {
    expect(evaluateContactEligibility({ source: 'SYNTHETIC', status: 'NEW' })).toEqual({
      eligible: true,
      reasonCode: 'ELIGIBLE_SYNTHETIC',
    });
  });

  it('blocks an unapproved source', () => {
    expect(evaluateContactEligibility({ source: 'SAHIBINDEN', status: 'NEW' })).toEqual({
      eligible: false,
      reasonCode: 'SOURCE_NOT_APPROVED',
    });
  });
});
