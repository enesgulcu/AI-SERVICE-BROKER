import { readCorrelationId } from './correlation-id';

describe('readCorrelationId', () => {
  it('keeps an 8 to 128 character safe identifier', () => {
    expect(readCorrelationId('trace-123')).toBe('trace-123');
  });

  it('rejects short, unsafe, and missing identifiers', () => {
    expect(readCorrelationId('short')).toBeUndefined();
    expect(readCorrelationId('bad id')).toBeUndefined();
    expect(readCorrelationId(undefined)).toBeUndefined();
  });
});
