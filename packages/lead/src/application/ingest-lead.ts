import { Lead } from '../domain/lead';
import type {
  Clock,
  CreateLeadTransactionResult,
  IdGenerator,
  LeadCreatedV1,
  LeadIngestionPort,
} from './lead-ingestion.port';

export interface IngestLeadCommand {
  idempotencyKey: string;
  requestFingerprint: string;
  correlationId: string;
  source: string;
  sourceReference: string;
  phone: string;
  customerName?: string;
  city?: string;
  district?: string;
  listingTitle?: string;
  listingText?: string;
  publishedAt?: Date;
  rawPayload?: Record<string, unknown>;
}

export class IngestLeadInputError extends Error {
  constructor(
    readonly code:
      'INVALID_IDEMPOTENCY_KEY' | 'INVALID_REQUEST_FINGERPRINT' | 'INVALID_CORRELATION_ID',
  ) {
    super(code);
    this.name = IngestLeadInputError.name;
  }
}

const SAFE_REQUEST_ID = /^[a-zA-Z0-9._:-]{8,128}$/;
const SHA256_FINGERPRINT = /^[a-f0-9]{64}$/;

export class IngestLead {
  constructor(
    private readonly persistence: LeadIngestionPort,
    private readonly clock: Clock,
    private readonly leadIdGenerator: IdGenerator,
    private readonly eventIdGenerator: IdGenerator,
  ) {}

  async execute(command: IngestLeadCommand): Promise<CreateLeadTransactionResult> {
    if (!SAFE_REQUEST_ID.test(command.idempotencyKey)) {
      throw new IngestLeadInputError('INVALID_IDEMPOTENCY_KEY');
    }
    if (!SHA256_FINGERPRINT.test(command.requestFingerprint)) {
      throw new IngestLeadInputError('INVALID_REQUEST_FINGERPRINT');
    }
    if (!SAFE_REQUEST_ID.test(command.correlationId)) {
      throw new IngestLeadInputError('INVALID_CORRELATION_ID');
    }

    const occurredAt = this.clock.now();
    const leadId = this.leadIdGenerator.next();
    const lead = Lead.create({
      id: leadId,
      source: command.source,
      sourceReference: command.sourceReference,
      phone: command.phone,
      receivedAt: occurredAt,
      customerName: command.customerName,
      city: command.city,
      district: command.district,
      listingTitle: command.listingTitle,
      listingText: command.listingText,
      publishedAt: command.publishedAt,
      rawPayloadReference: leadId,
    });
    const storedLead = lead.snapshot();
    const event: LeadCreatedV1 = {
      eventId: this.eventIdGenerator.next(),
      eventType: 'LeadCreated',
      eventVersion: 1,
      aggregateType: 'Lead',
      aggregateId: storedLead.id,
      occurredAt,
      correlationId: command.correlationId,
      payload: {
        leadId: storedLead.id,
        source: storedLead.source,
        sourceReference: storedLead.sourceReference,
        status: 'NEW',
      },
    };

    return this.persistence.createLeadWithOutbox({
      idempotencyKey: command.idempotencyKey,
      requestFingerprint: command.requestFingerprint,
      lead: storedLead,
      rawPayload: command.rawPayload ?? {},
      event,
    });
  }
}
