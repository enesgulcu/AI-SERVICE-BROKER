import type { IngestLeadRequestV1 } from '@ai-service-broker/contracts';
import {
  IdempotencyConflictError,
  IngestLead,
  InMemoryLeadIngestionAdapter,
} from '@ai-service-broker/lead';
import { HttpException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { LeadIngestionService } from './lead-ingestion.service';

const syntheticLead: IngestLeadRequestV1 = {
  source: 'SYNTHETIC',
  sourceReference: 'listing-123',
  phone: '+905551112233',
  city: 'İstanbul',
  rawData: {},
};

function createService(): LeadIngestionService {
  return new LeadIngestionService(
    new IngestLead(
      new InMemoryLeadIngestionAdapter(),
      { now: () => new Date('2026-09-23T08:00:00.000Z') },
      { next: () => randomUUID() },
      { next: () => randomUUID() },
    ),
  );
}

describe('LeadIngestionService', () => {
  it('creates a synthetic lead', async () => {
    const result = await createService().ingest({
      body: syntheticLead,
      idempotencyKey: 'lead:request-123',
      correlationId: 'request:trace-123',
    });

    expect(result.disposition).toBe('CREATED');
    expect(result.leadId).toEqual(expect.any(String));
  });

  it('blocks non-synthetic sources in synthetic mode', async () => {
    try {
      await createService().ingest({
        body: { ...syntheticLead, source: 'SAHIBINDEN' },
        idempotencyKey: 'lead:request-123',
        correlationId: 'request:trace-123',
      });
      throw new Error('Expected real-data ingestion to be blocked');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(403);
      expect((error as HttpException).getResponse()).toMatchObject({
        code: 'REAL_DATA_INGESTION_BLOCKED',
      });
    }
  });

  it('rejects a missing idempotency key', async () => {
    await expect(
      createService().ingest({
        body: syntheticLead,
        idempotencyKey: undefined,
        correlationId: 'request:trace-123',
      }),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('maps fingerprint conflicts to a safe HTTP conflict', async () => {
    const ingestLead = {
      execute: () => Promise.reject(new IdempotencyConflictError()),
    } as unknown as IngestLead;

    try {
      await new LeadIngestionService(ingestLead).ingest({
        body: syntheticLead,
        idempotencyKey: 'lead:request-123',
        correlationId: 'request:trace-123',
      });
      throw new Error('Expected an idempotency conflict');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(409);
      expect((error as HttpException).getResponse()).toMatchObject({
        code: 'IDEMPOTENCY_KEY_REUSED',
      });
    }
  });
});
