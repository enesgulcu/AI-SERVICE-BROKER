import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

describe('Closed operations (e2e)', () => {
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

  async function createLead(reference: string): Promise<string> {
    const created = await request(app.getHttpServer())
      .post('/v1/leads')
      .set('Idempotency-Key', `lead:${reference}`)
      .send({
        source: 'SYNTHETIC',
        sourceReference: reference,
        phone: '+905551112255',
        listingText: 'private listing text',
      })
      .expect(201);
    return (created.body as { leadId: string }).leadId;
  }

  it('keeps price, WhatsApp, webhooks, and self-qualification closed', async () => {
    const leadId = await createLead('listing-e2e-operations-closed');
    const server = app.getHttpServer();

    const qualified = await request(server)
      .post(`/v1/leads/${leadId}/workflow-transitions`)
      .set('Idempotency-Key', 'workflow:e2e-qualified-1')
      .send({
        actorId: 'operator-1',
        toStatus: 'QUALIFIED',
        expectedVersion: 1,
      })
      .expect(409);
    expect(qualified.body).toMatchObject({
      error: { code: 'REQUIREMENTS_NOT_AVAILABLE' },
    });

    const early = await request(server)
      .post(`/v1/leads/${leadId}/requirements`)
      .set('Idempotency-Key', 'requirement:e2e-early')
      .send({
        actorId: 'operator-1',
        expectedVersion: 1,
        fields: [
          { name: 'days_per_week', value: '5', confidence: 1, source: 'HUMAN' },
        ],
        specialRequirements: [],
      })
      .expect(409);
    expect(early.body).toMatchObject({ error: { code: 'INVALID_TRANSITION' } });

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
      })
      .expect(409);
    expect(whatsapp.body).toMatchObject({ error: { code: 'UNSAFE_CHANNEL' } });

    const webhook = await request(server)
      .post('/v1/webhooks/inbound')
      .send({ ok: true })
      .expect(401);
    expect(webhook.body).toMatchObject({
      error: { code: 'WEBHOOK_SIGNATURE_INVALID' },
    });

    const view = await request(server)
      .get(`/v1/leads/${leadId}/view`)
      .expect(200);
    expect(view.body).toMatchObject({ phoneMask: '***55', status: 'NEW' });
    expect(JSON.stringify(view.body)).not.toContain('+905551112255');
    expect(JSON.stringify(view.body)).not.toContain('private listing text');
  });

  it('qualifies a lead only after confirmed home-helper requirements', async () => {
    const leadId = await createLead('listing-e2e-operations-ready');
    const server = app.getHttpServer();
    const prepared = await request(server)
      .post(`/v1/leads/${leadId}/contact-reviews`)
      .set('Idempotency-Key', 'contact:e2e-ready')
      .send({ actorId: 'operator-1' })
      .expect(201);
    await request(server)
      .post(
        `/v1/contact-reviews/${(prepared.body as { reviewId: string }).reviewId}/decisions`,
      )
      .set('Idempotency-Key', 'decision:e2e-ready')
      .send({ actorId: 'operator-1', decision: 'APPROVE' })
      .expect(200);
    const interested = await request(server)
      .post(`/v1/leads/${leadId}/workflow-transitions`)
      .set('Idempotency-Key', 'workflow:e2e-interested')
      .send({
        actorId: 'operator-1',
        toStatus: 'INTERESTED',
        expectedVersion: 3,
      })
      .expect(201);

    const partial = await request(server)
      .post(`/v1/leads/${leadId}/requirements`)
      .set('Idempotency-Key', 'requirement:e2e-partial')
      .send({
        actorId: 'operator-1',
        expectedVersion: (interested.body as { version: number }).version,
        fields: [
          { name: 'days_per_week', value: '5', confidence: 1, source: 'HUMAN' },
        ],
        specialRequirements: ['COOKING'],
      })
      .expect(201);
    expect(partial.body).toMatchObject({
      ready: false,
      workflowStatus: 'QUALIFYING',
      missingFields: ['working_hours', 'start_date'],
    });

    const blocked = await request(server)
      .post(`/v1/leads/${leadId}/workflow-transitions`)
      .set('Idempotency-Key', 'workflow:e2e-self-qualified')
      .send({
        actorId: 'operator-1',
        toStatus: 'QUALIFIED',
        expectedVersion: (partial.body as { workflowVersion: number })
          .workflowVersion,
      })
      .expect(409);
    expect(blocked.body).toMatchObject({
      error: { code: 'REQUIREMENTS_NOT_AVAILABLE' },
    });

    const ready = await request(server)
      .post(`/v1/leads/${leadId}/requirements`)
      .set('Idempotency-Key', 'requirement:e2e-ready')
      .send({
        actorId: 'operator-1',
        expectedVersion: (partial.body as { workflowVersion: number })
          .workflowVersion,
        fields: [
          { name: 'days_per_week', value: '5', confidence: 1, source: 'HUMAN' },
          {
            name: 'working_hours',
            value: '09:00-17:00',
            confidence: 1,
            source: 'HUMAN',
          },
          {
            name: 'start_date',
            value: '2026-10-01',
            confidence: 1,
            source: 'HUMAN',
          },
        ],
        specialRequirements: ['COOKING'],
      })
      .expect(201);
    expect(ready.body).toMatchObject({
      ready: true,
      workflowStatus: 'QUALIFIED',
    });
    expect(JSON.stringify(ready.body)).not.toContain('09:00-17:00');

    const risk = await request(server)
      .post(`/v1/leads/${leadId}/risk-signals`)
      .set('Idempotency-Key', 'risk:e2e-ready')
      .send({ actorId: 'operator-1', code: 'SENSITIVE_DATA', severity: 'HIGH' })
      .expect(201);
    expect(risk.body).toMatchObject({ disposition: 'REVIEW' });
    expect(JSON.stringify(risk.body)).not.toContain('BLOCKED');
  });
});
