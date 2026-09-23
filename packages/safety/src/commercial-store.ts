export type CommercialKind = 'QUOTE' | 'NEGOTIATION' | 'FOLLOW_UP' | 'JOB' | 'PROVIDER_DELIVERY';

export type CommercialValue = string | number | boolean;

export interface CommercialRecord {
  id: string;
  leadId: string | null;
  kind: CommercialKind;
  idempotencyKey: string;
  fingerprint: string;
  payload: Record<string, CommercialValue>;
}

export class CommercialConflictError extends Error {
  constructor(readonly code: 'IDEMPOTENCY_KEY_REUSED' = 'IDEMPOTENCY_KEY_REUSED') {
    super(code);
    this.name = CommercialConflictError.name;
  }
}

export interface CommercialStore {
  findByKey(kind: CommercialKind, idempotencyKey: string): Promise<CommercialRecord | null>;
  listForLead(leadId: string, kind: CommercialKind): Promise<CommercialRecord[]>;
  save(record: CommercialRecord): Promise<'CREATED' | 'DUPLICATE'>;
}

export class InMemoryCommercialStore implements CommercialStore {
  private readonly records: CommercialRecord[] = [];

  findByKey(kind: CommercialKind, idempotencyKey: string): Promise<CommercialRecord | null> {
    return Promise.resolve(
      this.records.find(
        (record) => record.kind === kind && record.idempotencyKey === idempotencyKey,
      ) ?? null,
    );
  }

  listForLead(leadId: string, kind: CommercialKind): Promise<CommercialRecord[]> {
    return Promise.resolve(
      this.records.filter((record) => record.leadId === leadId && record.kind === kind),
    );
  }

  save(record: CommercialRecord): Promise<'CREATED' | 'DUPLICATE'> {
    const existing = this.records.find(
      (item) => item.kind === record.kind && item.idempotencyKey === record.idempotencyKey,
    );
    if (existing) {
      if (existing.fingerprint !== record.fingerprint) {
        return Promise.reject(new CommercialConflictError());
      }
      return Promise.resolve('DUPLICATE');
    }
    this.records.push(record);
    return Promise.resolve('CREATED');
  }
}
