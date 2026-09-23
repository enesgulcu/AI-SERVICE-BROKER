import { hashPhone, linkLead } from './customer';

describe('customer identity', () => {
  it('hashes a phone and never marks the person verified', () => {
    const phoneHash = hashPhone('+905551112233');
    const customer = linkLead(null, {
      id: '11111111-1111-4111-8111-111111111111',
      phoneHash,
      leadId: '92d60e65-14f0-4d4f-b9ae-062c8f685213',
    });

    expect(customer.identityVerified).toBe(false);
    expect(customer.phoneHash).toHaveLength(64);
    expect(JSON.stringify(customer)).not.toContain('+905551112233');
  });

  it('links another lead to the same unverified customer', () => {
    const phoneHash = hashPhone('+905551112233');
    const first = linkLead(null, {
      id: '11111111-1111-4111-8111-111111111111',
      phoneHash,
      leadId: '92d60e65-14f0-4d4f-b9ae-062c8f685213',
    });
    const second = linkLead(first, {
      id: '22222222-2222-4222-8222-222222222222',
      phoneHash,
      leadId: '30ed6e26-dfaf-47f5-ac24-6db09622820a',
    });

    expect(second.id).toBe(first.id);
    expect(second.leadIds).toHaveLength(2);
    expect(second.identityVerified).toBe(false);
  });
});
