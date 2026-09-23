import { Lead, LeadInvariantError } from './lead';

describe('Lead', () => {
  const validInput = {
    id: '92d60e65-14f0-4d4f-b9ae-062c8f685213',
    source: ' sahibinden ',
    sourceReference: ' listing-123 ',
    phone: '+905551112233',
    receivedAt: new Date('2026-09-23T08:00:00.000Z'),
    customerName: ' Ayşe ',
    city: ' İstanbul ',
  };

  it('normalizes stable acquisition fields and starts as NEW', () => {
    expect(Lead.create(validInput).snapshot()).toMatchObject({
      id: validInput.id,
      status: 'NEW',
      source: 'SAHIBINDEN',
      sourceReference: 'listing-123',
      phone: '+905551112233',
      customerName: 'Ayşe',
      city: 'İstanbul',
    });
  });

  it('moves to contact pending and contacted only in order', () => {
    const pending = Lead.create(validInput).markContactPending();
    const contacted = pending.markContacted();

    expect(pending.snapshot()).toMatchObject({ status: 'CONTACT_PENDING', version: 2 });
    expect(contacted.snapshot()).toMatchObject({ status: 'CONTACTED', version: 3 });
    expect(pending.releaseToNew().snapshot()).toMatchObject({ status: 'NEW', version: 3 });
  });

  it('rejects a contact transition from the wrong status', () => {
    expect(() => Lead.create(validInput).markContacted()).toThrow(LeadInvariantError);
  });

  it('protects date values from external mutation', () => {
    const lead = Lead.create(validInput);
    const firstSnapshot = lead.snapshot();
    firstSnapshot.receivedAt.setUTCFullYear(2000);

    expect(lead.snapshot().receivedAt.toISOString()).toBe('2026-09-23T08:00:00.000Z');
  });

  it.each([
    ['INVALID_ID', { ...validInput, id: 'not-a-uuid' }],
    ['INVALID_SOURCE', { ...validInput, source: 'unsupported source!' }],
    ['INVALID_SOURCE_REFERENCE', { ...validInput, sourceReference: ' ' }],
    ['INVALID_PHONE', { ...validInput, phone: '05551112233' }],
    ['INVALID_RECEIVED_AT', { ...validInput, receivedAt: new Date('invalid') }],
  ] as const)('rejects %s', (code, input) => {
    expect(() => Lead.create(input)).toThrow(new LeadInvariantError(code));
  });
});
