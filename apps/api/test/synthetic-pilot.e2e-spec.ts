import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

describe('Synthetic pilot (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('qualifies one synthetic lead and leaves price, WhatsApp, and real data closed', async () => {
    const server = app.getHttpServer();
    const created = await request(server)
      .post('/v1/leads')
      .set('Idempotency-Key', 'lead:synthetic-pilot')
      .send({
        source: 'SYNTHETIC',
        sourceReference: 'synthetic-pilot',
        phone: '+905551110099',
        listingText: 'pilot listing must stay hidden',
      })
      .expect(201);
    const leadId = (created.body as { leadId: string }).leadId;

    const real = await request(server)
      .post('/v1/leads')
      .set('Idempotency-Key', 'lead:synthetic-pilot-real')
      .send({
        source: 'WHATSAPP',
        sourceReference: 'synthetic-pilot-real',
        phone: '+905551110098',
      })
      .expect(403);
    expect(real.body).toMatchObject({
      error: { code: 'REAL_DATA_INGESTION_BLOCKED' },
    });

    const prepared = await request(server)
      .post(`/v1/leads/${leadId}/contact-reviews`)
      .set('Idempotency-Key', 'contact:synthetic-pilot')
      .send({ actorId: 'operator-1' })
      .expect(201);
    await request(server)
      .post(
        `/v1/contact-reviews/${(prepared.body as { reviewId: string }).reviewId}/decisions`,
      )
      .set('Idempotency-Key', 'decision:synthetic-pilot')
      .send({ actorId: 'operator-1', decision: 'APPROVE' })
      .expect(200);
    const interested = await request(server)
      .post(`/v1/leads/${leadId}/workflow-transitions`)
      .set('Idempotency-Key', 'workflow:synthetic-pilot-interested')
      .send({
        actorId: 'operator-1',
        toStatus: 'INTERESTED',
        expectedVersion: 3,
      })
      .expect(201);
    const ready = await request(server)
      .post(`/v1/leads/${leadId}/requirements`)
      .set('Idempotency-Key', 'requirement:synthetic-pilot')
      .send({
        actorId: 'operator-1',
        expectedVersion: (interested.body as { version: number }).version,
        fields: [
          { name: 'days_per_week', value: '3', confidence: 1, source: 'HUMAN' },
          {
            name: 'working_hours',
            value: '09:00-13:00',
            confidence: 1,
            source: 'HUMAN',
          },
          {
            name: 'start_date',
            value: '2026-11-02',
            confidence: 1,
            source: 'HUMAN',
          },
        ],
        specialRequirements: [],
      })
      .expect(201);
    expect(ready.body).toMatchObject({
      ready: true,
      workflowStatus: 'QUALIFIED',
    });

    const quote = await request(server)
      .post('/v1/quotes')
      .send({ actorId: 'operator-1' })
      .expect(409);
    expect(quote.body).toMatchObject({
      error: { code: 'PRICING_NOT_AVAILABLE' },
    });
    const whatsapp = await request(server)
      .post('/v1/outbound/deliveries')
      .send({
        channel: 'WHATSAPP',
        origin: 'HUMAN',
        controlMode: 'AI_ACTIVE',
        templateApproved: true,
        templateVersion: 'sandbox-first-contact-v1',
      })
      .expect(409);
    expect(whatsapp.body).toMatchObject({ error: { code: 'UNSAFE_CHANNEL' } });

    const summary = await request(server)
      .get('/v1/operations/summary')
      .expect(200);
    expect(summary.body).toMatchObject({
      qualifiedCount: 1,
      cost: { available: false, code: 'COST_NOT_AVAILABLE' },
    });
    const body = JSON.stringify(summary.body);
    expect(body).not.toContain('+905551110099');
    expect(body).not.toContain('pilot listing must stay hidden');
    expect(body).not.toContain('09:00-13:00');
  });
});
