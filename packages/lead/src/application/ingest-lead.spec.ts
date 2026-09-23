import { IngestLead, IngestLeadInputError } from './ingest-lead';
import type {
  Clock,
  CreateLeadTransaction,
  CreateLeadTransactionResult,
  IdGenerator,
  LeadIngestionPort,
} from './lead-ingestion.port';

class FixedClock implements Clock {
  now(): Date {
    return new Date('2026-09-23T08:00:00.000Z');
  }
}

class FixedIdGenerator implements IdGenerator {
  constructor(private readonly value: string) {}

  next(): string {
    return this.value;
  }
}

class CapturingPersistence implements LeadIngestionPort {
  transaction?: CreateLeadTransaction;

  constructor(private readonly result: CreateLeadTransactionResult) {}

  createLeadWithOutbox(transaction: CreateLeadTransaction): Promise<CreateLeadTransactionResult> {
    this.transaction = transaction;
    return Promise.resolve(this.result);
  }
}

describe('IngestLead', () => {
  const leadId = '92d60e65-14f0-4d4f-b9ae-062c8f685213';
  const eventId = '30ed6e26-dfaf-47f5-ac24-6db09622820a';
  const command = {
    idempotencyKey: 'lead:request-123',
    requestFingerprint: 'a'.repeat(64),
    correlationId: 'request:trace-123',
    source: 'sahibinden',
    sourceReference: 'listing-123',
    phone: '+905551112233',
    city: 'İstanbul',
  };

  function createUseCase(persistence: LeadIngestionPort): IngestLead {
    return new IngestLead(
      persistence,
      new FixedClock(),
      new FixedIdGenerator(leadId),
      new FixedIdGenerator(eventId),
    );
  }

  it('asks the port to atomically create the lead and outbox event', async () => {
    const persistence = new CapturingPersistence({
      disposition: 'CREATED',
      leadId,
    });

    await expect(createUseCase(persistence).execute(command)).resolves.toEqual({
      disposition: 'CREATED',
      leadId,
    });
    expect(persistence.transaction).toMatchObject({
      idempotencyKey: command.idempotencyKey,
      requestFingerprint: command.requestFingerprint,
      lead: {
        id: leadId,
        status: 'NEW',
        source: 'SAHIBINDEN',
        sourceReference: command.sourceReference,
      },
      event: {
        eventId,
        eventType: 'LeadCreated',
        eventVersion: 1,
        aggregateType: 'Lead',
        aggregateId: leadId,
        correlationId: command.correlationId,
        payload: {
          leadId,
          source: 'SAHIBINDEN',
          sourceReference: command.sourceReference,
          status: 'NEW',
        },
      },
    });
  });

  it('keeps PII out of the outbox event payload', async () => {
    const persistence = new CapturingPersistence({
      disposition: 'CREATED',
      leadId,
    });
    await createUseCase(persistence).execute(command);

    expect(JSON.stringify(persistence.transaction?.event)).not.toContain(command.phone);
  });

  it('returns the existing lead when persistence detects a duplicate', async () => {
    const existingLeadId = '8cbad6fe-aeb8-4530-9ca7-96fd228212c7';
    const persistence = new CapturingPersistence({
      disposition: 'DUPLICATE',
      leadId: existingLeadId,
      duplicateReason: 'SOURCE_REFERENCE',
    });

    await expect(createUseCase(persistence).execute(command)).resolves.toEqual({
      disposition: 'DUPLICATE',
      leadId: existingLeadId,
      duplicateReason: 'SOURCE_REFERENCE',
    });
  });

  it.each([
    ['INVALID_IDEMPOTENCY_KEY', { ...command, idempotencyKey: 'bad key' }],
    ['INVALID_REQUEST_FINGERPRINT', { ...command, requestFingerprint: 'not-a-sha256' }],
    ['INVALID_CORRELATION_ID', { ...command, correlationId: 'bad id' }],
  ] as const)('rejects %s before persistence', async (code, invalidCommand) => {
    const persistence = new CapturingPersistence({
      disposition: 'CREATED',
      leadId,
    });

    await expect(createUseCase(persistence).execute(invalidCommand)).rejects.toEqual(
      new IngestLeadInputError(code),
    );
    expect(persistence.transaction).toBeUndefined();
  });
});
