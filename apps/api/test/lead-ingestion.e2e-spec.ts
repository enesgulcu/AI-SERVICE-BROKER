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
