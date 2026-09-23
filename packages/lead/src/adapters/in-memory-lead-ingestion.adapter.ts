import type { LeadSnapshot } from '../domain/lead';
import type {
  CreateLeadTransaction,
  CreateLeadTransactionResult,
  LeadCreatedV1,
  LeadDirectory,
  LeadIngestionPort,
  LeadStatusStore,
  LeadSummary,
} from '../application/lead-ingestion.port';
import {
  IdempotencyConflictError,
  LeadVersionConflictError,
} from '../application/lead-ingestion.port';

interface IdempotencyRecord {
  requestFingerprint: string;
  leadId: string;
}

function cloneLead(lead: LeadSnapshot): LeadSnapshot {
  return {
    ...lead,
    receivedAt: new Date(lead.receivedAt),
    publishedAt: lead.publishedAt ? new Date(lead.publishedAt) : undefined,
  };
}

export class InMemoryLeadIngestionAdapter
  implements LeadIngestionPort, LeadStatusStore, LeadDirectory
{
  private readonly byIdempotencyKey = new Map<string, IdempotencyRecord>();
  private readonly bySourceReference = new Map<string, string>();
  private readonly leads = new Map<string, LeadSnapshot>();
  private readonly rawPayloads = new Map<string, Record<string, unknown>>();
  readonly events: LeadCreatedV1[] = [];

  createLeadWithOutbox(transaction: CreateLeadTransaction): Promise<CreateLeadTransactionResult> {
    const existingKey = this.byIdempotencyKey.get(transaction.idempotencyKey);
    if (existingKey) {
      if (existingKey.requestFingerprint !== transaction.requestFingerprint) {
        return Promise.reject(new IdempotencyConflictError());
      }

      return Promise.resolve({
        disposition: 'DUPLICATE',
        leadId: existingKey.leadId,
        duplicateReason: 'IDEMPOTENCY_KEY',
      });
    }

    const sourceKey = `${transaction.lead.source}:${transaction.lead.sourceReference}`;
    const existingLeadId = this.bySourceReference.get(sourceKey);
    if (existingLeadId) {
      this.byIdempotencyKey.set(transaction.idempotencyKey, {
        requestFingerprint: transaction.requestFingerprint,
        leadId: existingLeadId,
      });

      return Promise.resolve({
        disposition: 'DUPLICATE',
        leadId: existingLeadId,
        duplicateReason: 'SOURCE_REFERENCE',
      });
    }

    this.bySourceReference.set(sourceKey, transaction.lead.id);
    this.byIdempotencyKey.set(transaction.idempotencyKey, {
      requestFingerprint: transaction.requestFingerprint,
      leadId: transaction.lead.id,
    });
    this.leads.set(transaction.lead.id, cloneLead(transaction.lead));
    this.rawPayloads.set(transaction.lead.id, transaction.rawPayload);
    this.events.push(transaction.event);

    return Promise.resolve({
      disposition: 'CREATED',
      leadId: transaction.lead.id,
    });
  }

  findById(id: string): Promise<LeadSnapshot | null> {
    const lead = this.leads.get(id);
    return Promise.resolve(lead ? cloneLead(lead) : null);
  }

  save(lead: LeadSnapshot): Promise<void> {
    const current = this.leads.get(lead.id);
    if (!current || lead.version !== current.version + 1) {
      return Promise.reject(new LeadVersionConflictError());
    }

    this.leads.set(lead.id, cloneLead(lead));
    return Promise.resolve();
  }

  findSummary(id: string): Promise<LeadSummary | null> {
    const lead = this.leads.get(id);
    return Promise.resolve(lead ? summary(lead) : null);
  }

  listByStatus(status: LeadSnapshot['status']): Promise<LeadSummary[]> {
    return Promise.resolve(
      [...this.leads.values()].filter((lead) => lead.status === status).map(summary),
    );
  }

  countByStatus(): Promise<Array<{ status: string; count: number }>> {
    const counts = new Map<string, number>();
    for (const lead of this.leads.values()) {
      counts.set(lead.status, (counts.get(lead.status) ?? 0) + 1);
    }
    return Promise.resolve([...counts].map(([status, count]) => ({ status, count })));
  }
}

function summary(lead: LeadSnapshot): LeadSummary {
  return {
    id: lead.id,
    status: lead.status,
    version: lead.version,
    phone: lead.phone,
    source: lead.source,
  };
}
