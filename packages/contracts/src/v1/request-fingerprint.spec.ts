import { createRequestFingerprint, stableJson } from './request-fingerprint';

describe('request fingerprint', () => {
  it('serializes object keys in a stable order', () => {
    expect(stableJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it('produces the same hash for equivalent objects with different key order', () => {
    expect(createRequestFingerprint({ source: 'SAHIBINDEN', phone: '+905551112233' })).toBe(
      createRequestFingerprint({ phone: '+905551112233', source: 'SAHIBINDEN' }),
    );
  });

  it('changes when a material field changes', () => {
    expect(createRequestFingerprint({ source: 'SAHIBINDEN' })).not.toBe(
      createRequestFingerprint({ source: 'FACEBOOK' }),
    );
  });
});
