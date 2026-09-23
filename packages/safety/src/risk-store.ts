import type { RiskSignal } from './safety';

export interface StoredRisk {
  id: string;
  leadId: string;
  idempotencyKey: string;
  fingerprint: string;
  signal: RiskSignal;
  disposition: 'REVIEW';
}

export interface NewRisk {
  id: string;
  leadId: string;
  idempotencyKey: string;
  fingerprint: string;
  actorId: string;
  correlationId: string;
  occurredAt: Date;
  signal: RiskSignal;
}

export interface RiskStore {
  findByKey(idempotencyKey: string): Promise<StoredRisk | null>;
  save(input: NewRisk): Promise<StoredRisk>;
}

export class InMemoryRiskStore implements RiskStore {
  private readonly byKey = new Map<string, StoredRisk>();

  findByKey(idempotencyKey: string): Promise<StoredRisk | null> {
    return Promise.resolve(this.byKey.get(idempotencyKey) ?? null);
  }

  save(input: NewRisk): Promise<StoredRisk> {
    const existing = this.byKey.get(input.idempotencyKey);
    if (existing) {
      return Promise.reject(new Error('IDEMPOTENCY_KEY_REUSED'));
    }
    const stored: StoredRisk = {
      id: input.id,
      leadId: input.leadId,
      idempotencyKey: input.idempotencyKey,
      fingerprint: input.fingerprint,
      signal: input.signal,
      disposition: 'REVIEW',
    };
    this.byKey.set(input.idempotencyKey, stored);
    return Promise.resolve(stored);
  }
}
