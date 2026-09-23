import {
  idempotencyKeySchema,
  ingestLeadRequestV1Schema,
  ingestLeadResponseV1Schema,
} from './lead-ingestion.contract';

describe('lead ingestion V1 contract', () => {
  const validRequest = {
    source: 'SAHIBINDEN',
    sourceReference: 'listing-123',
    phone: '+905551112233',
    city: 'İstanbul',
    listingText: 'Haftada beş gün ev yardımcısı aranıyor.',
  };

  it('accepts a normalized lead and supplies an empty raw-data default', () => {
    expect(ingestLeadRequestV1Schema.parse(validRequest)).toEqual({
      ...validRequest,
      rawData: {},
    });
  });

  it.each([
    ['non-E.164 phone', { ...validRequest, phone: '05551112233' }],
    ['unknown field', { ...validRequest, hidden: 'value' }],
    ['empty source reference', { ...validRequest, sourceReference: ' ' }],
  ])('rejects %s', (_case, input) => {
    expect(() => ingestLeadRequestV1Schema.parse(input)).toThrow();
  });

  it('requires safe idempotency keys', () => {
    expect(idempotencyKeySchema.parse('lead:request-123')).toBe('lead:request-123');
    expect(() => idempotencyKeySchema.parse('unsafe key')).toThrow();
  });

  it('validates the versioned response', () => {
    expect(
      ingestLeadResponseV1Schema.parse({
        leadId: '92d60e65-14f0-4d4f-b9ae-062c8f685213',
        disposition: 'CREATED',
      }),
    ).toBeDefined();
  });
});
