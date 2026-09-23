import { performance } from 'node:perf_hooks';
import { InMemoryRiskStore } from './risk-store';
import { guardCustomerDraft, operationalDashboard } from './safety';

describe('in-process evaluation', () => {
  it('repeats the draft guard without opening cost or a phone number', () => {
    const started = performance.now();
    for (let index = 0; index < 1_000; index += 1) {
      expect(guardCustomerDraft(index % 2 === 0 ? ' ' : 'Net fiyat 1000 TL.').ok).toBe(false);
    }
    expect(performance.now() - started).toBeLessThan(2_000);
    const dashboard = operationalDashboard({
      statusCounts: { NEW: 2, QUALIFIED: 1 },
      manualReviewCount: 0,
      riskReviewCount: 1,
    });
    expect(dashboard).toMatchObject({
      qualifiedCount: 1,
      riskReviewCount: 1,
      cost: { available: false, code: 'COST_NOT_AVAILABLE' },
    });
    expect(JSON.stringify(dashboard)).not.toContain('+90');
  });

  it('rejects a repeated risk write instead of duplicating it', async () => {
    const store = new InMemoryRiskStore();
    const input = {
      id: '11111111-1111-4111-8111-111111111111',
      leadId: '22222222-2222-4222-8222-222222222222',
      idempotencyKey: 'risk:same',
      fingerprint: 'a'.repeat(64),
      actorId: 'operator-1',
      correlationId: 'request:trace-123',
      occurredAt: new Date('2026-09-23T12:00:00.000Z'),
      signal: { code: 'SENSITIVE_DATA' as const, severity: 'HIGH' as const },
    };
    await store.save(input);
    await expect(store.save(input)).rejects.toThrow('IDEMPOTENCY_KEY_REUSED');
    await expect(store.count()).resolves.toBe(1);
  });
});
