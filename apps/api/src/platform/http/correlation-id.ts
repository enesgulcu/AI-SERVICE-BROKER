export const SAFE_CORRELATION_ID = /^[a-zA-Z0-9._:-]{8,128}$/;

export function readCorrelationId(value: unknown): string | undefined {
  const candidate =
    typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  return SAFE_CORRELATION_ID.test(candidate) ? candidate : undefined;
}
