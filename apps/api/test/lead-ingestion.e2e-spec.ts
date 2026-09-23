import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

const validLead = {
  source: 'SYNTHETIC',
  sourceReference: 'listing-e2e-1',
  phone: '+905551112233',
  city: 'İstanbul',
};

describe('Lead ingestion (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
  });

  it('creates a synthetic lead once and replays the same request', async () => {
    const first = await request(app.getHttpServer())
      .post('/v1/leads')
      .set('Idempotency-Key', 'lead:e2e-create-1')
      .send(validLead)
      .expect(201);

    const firstBody = first.body as { leadId: string; disposition: string };
    expect(firstBody.disposition).toBe('CREATED');
    expect(firstBody.leadId).toEqual(expect.any(String));

    const replay = await request(app.getHttpServer())
      .post('/v1/leads')
      .set('Idempotency-Key', 'lead:e2e-create-1')
      .send(validLead)
      .expect(200);

    expect(replay.body).toEqual({
      leadId: firstBody.leadId,
      disposition: 'DUPLICATE',
    });
  });

  it('rejects a reused idempotency key with a different body', async () => {
    await request(app.getHttpServer())
      .post('/v1/leads')
      .set('Idempotency-Key', 'lead:e2e-conflict-1')
      .send({ ...validLead, sourceReference: 'listing-e2e-conflict' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/v1/leads')
      .set('Idempotency-Key', 'lead:e2e-conflict-1')
      .send({
        ...validLead,
        sourceReference: 'listing-e2e-conflict',
        city: 'Ankara',
      })
      .expect(409);

    expect(response.body).toMatchObject({
      error: {
        code: 'IDEMPOTENCY_KEY_REUSED',
        status: 409,
      },
    });
  });

  it('replaces a short correlation ID and still accepts the lead', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/leads')
      .set('Idempotency-Key', 'lead:e2e-short-correlation')
      .set('x-correlation-id', 'short')
      .send({ ...validLead, sourceReference: 'listing-e2e-short-correlation' })
      .expect(201);

    const correlationHeader = response.headers['x-correlation-id'] as unknown;
    expect(correlationHeader).not.toBe('short');
    expect(correlationHeader).toEqual(
      expect.stringMatching(/^[a-zA-Z0-9._:-]{8,128}$/),
    );
    expect(response.body).toMatchObject({ disposition: 'CREATED' });
  });

  it('returns the original lead when the same source reference arrives again', async () => {
    const first = await request(app.getHttpServer())
      .post('/v1/leads')
      .set('Idempotency-Key', 'lead:e2e-source-1')
      .send({ ...validLead, sourceReference: 'listing-e2e-source' })
      .expect(201);

    const second = await request(app.getHttpServer())
      .post('/v1/leads')
      .set('Idempotency-Key', 'lead:e2e-source-2')
      .send({
        ...validLead,
        sourceReference: 'listing-e2e-source',
        city: 'Ankara',
      })
      .expect(200);

    expect(second.body).toEqual({
      leadId: (first.body as { leadId: string }).leadId,
      disposition: 'DUPLICATE',
    });
  });

  it('sends the sandbox draft only after a human approves it', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/leads')
      .set('Idempotency-Key', 'lead:e2e-contact-1')
      .send({ ...validLead, sourceReference: 'listing-e2e-contact' })
      .expect(201);
    const leadId = (created.body as { leadId: string }).leadId;

    const review = await request(app.getHttpServer())
      .post(`/v1/leads/${leadId}/contact-reviews`)
      .set('Idempotency-Key', 'contact:e2e-prepare-1')
      .send({ actorId: 'operator-1' })
      .expect(201);

    const reviewBody = review.body as {
      reviewId: string;
      draft: string;
      disposition: string;
    };
    expect(reviewBody.disposition).toBe('PENDING');
    expect(reviewBody.draft).toContain('otomatik');
    expect(reviewBody.draft).not.toContain(validLead.phone);

    const decision = await request(app.getHttpServer())
      .post(`/v1/contact-reviews/${reviewBody.reviewId}/decisions`)
      .set('Idempotency-Key', 'contact:e2e-approve-1')
      .send({ actorId: 'operator-1', decision: 'APPROVE' })
      .expect(200);

    expect(decision.body).toEqual({
      reviewId: reviewBody.reviewId,
      leadId,
      disposition: 'APPROVED',
      delivery: 'MOCK_ACCEPTED',
    });
  });

  it('blocks real-source intake while personal-data mode is synthetic', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/leads')
      .set('Idempotency-Key', 'lead:e2e-real-1')
      .send({ ...validLead, source: 'SAHIBINDEN' })
      .expect(403);

    expect(response.body).toMatchObject({
      error: {
        code: 'REAL_DATA_INGESTION_BLOCKED',
        status: 403,
      },
    });
  });

  it('rejects invalid bodies without echoing the phone number', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/leads')
      .set('Idempotency-Key', 'lead:e2e-invalid-1')
      .send({ ...validLead, phone: '05551112233' })
      .expect(400);

    expect(response.body).toMatchObject({
      error: {
        code: 'VALIDATION_FAILED',
        fields: ['phone'],
        status: 400,
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('05551112233');
  });

  afterAll(async () => {
    await app.close();
  });
});
