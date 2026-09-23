import type {
  CreateLeadTransaction,
  CreateLeadTransactionResult,
  LeadCreatedV1,
  LeadIngestionPort,
} from '../application/lead-ingestion.port';
import { IdempotencyConflictError } from '../application/lead-ingestion.port';

interface IdempotencyRecord {
  requestFingerprint: string;
  leadId: string;
}

export class InMemoryLeadIngestionAdapter implements LeadIngestionPort {
  private readonly byIdempotencyKey = new Map<string, IdempotencyRecord>();
  private readonly bySourceReference = new Map<string, string>();
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
    this.events.push(transaction.event);

    return Promise.resolve({
      disposition: 'CREATED',
      leadId: transaction.lead.id,
    });
  }
}
