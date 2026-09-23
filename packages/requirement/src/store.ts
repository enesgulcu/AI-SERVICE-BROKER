import type { RequirementSnapshot } from './requirement';

export class RequirementConflictError extends Error {
  constructor(readonly code: 'IDEMPOTENCY_KEY_REUSED' | 'IDEMPOTENCY_CONFLICT') {
    super(code);
    this.name = RequirementConflictError.name;
  }
}

export interface StoredRequirement {
  id: string;
  leadId: string;
  idempotencyKey: string;
  fingerprint: string;
  snapshot: RequirementSnapshot;
}

export interface NewRequirement {
  id: string;
  leadId: string;
  idempotencyKey: string;
  fingerprint: string;
  actorId: string;
  correlationId: string;
  occurredAt: Date;
  snapshot: Omit<RequirementSnapshot, 'version'>;
}

export interface RequirementStore {
  findByKey(idempotencyKey: string): Promise<StoredRequirement | null>;
  latestForLead(leadId: string): Promise<StoredRequirement | null>;
  save(input: NewRequirement): Promise<StoredRequirement>;
}

export class InMemoryRequirementStore implements RequirementStore {
  private readonly byKey = new Map<string, StoredRequirement>();
  private readonly versions = new Map<string, number>();

  findByKey(idempotencyKey: string): Promise<StoredRequirement | null> {
    return Promise.resolve(this.byKey.get(idempotencyKey) ?? null);
  }

  latestForLead(leadId: string): Promise<StoredRequirement | null> {
    let latest: StoredRequirement | null = null;
    for (const item of this.byKey.values()) {
      if (item.leadId !== leadId) {
        continue;
      }
      if (!latest || item.snapshot.version > latest.snapshot.version) {
        latest = item;
      }
    }
    return Promise.resolve(latest);
  }

  save(input: NewRequirement): Promise<StoredRequirement> {
    const existing = this.byKey.get(input.idempotencyKey);
    if (existing) {
      return Promise.reject(new RequirementConflictError('IDEMPOTENCY_KEY_REUSED'));
    }
    const version = (this.versions.get(input.leadId) ?? 0) + 1;
    const stored: StoredRequirement = {
      id: input.id,
      leadId: input.leadId,
      idempotencyKey: input.idempotencyKey,
      fingerprint: input.fingerprint,
      snapshot: { ...input.snapshot, version },
    };
    this.byKey.set(input.idempotencyKey, stored);
    this.versions.set(input.leadId, version);
    return Promise.resolve(stored);
  }
}
