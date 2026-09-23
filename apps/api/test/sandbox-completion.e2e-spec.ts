import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

describe('Sandbox completion (e2e)', () => {
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

  it('takes one synthetic lead to an operational job snapshot', async () => {
    const server = app.getHttpServer();
    const created = await request(server)
      .post('/v1/leads')
      .set('Idempotency-Key', 'lead:sandbox-completion')
      .send({
        source: 'SYNTHETIC',
        sourceReference: 'sandbox-completion',
        phone: '+905551110077',
        listingText: 'completion listing must stay hidden',
      })
      .expect(201);
    const leadId = (created.body as { leadId: string }).leadId;

    await request(server)
      .post(`/v1/leads/${leadId}/contact-reviews`)
      .set('Idempotency-Key', 'contact:sandbox-completion')
      .send({ actorId: 'operator-1' })
      .expect(201)
      .then(async (prepared) => {
        await request(server)
          .post(
            `/v1/contact-reviews/${(prepared.body as { reviewId: string }).reviewId}/decisions`,
          )
          .set('Idempotency-Key', 'decision:sandbox-completion')
          .send({ actorId: 'operator-1', decision: 'APPROVE' })
          .expect(200);
      });

    const interested = await request(server)
      .post(`/v1/leads/${leadId}/workflow-transitions`)
      .set('Idempotency-Key', 'workflow:sandbox-interested')
      .send({
        actorId: 'operator-1',
        toStatus: 'INTERESTED',
        expectedVersion: 3,
      })
      .expect(201);
    const ready = await request(server)
      .post(`/v1/leads/${leadId}/requirements`)
      .set('Idempotency-Key', 'requirement:sandbox-completion')
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

    const quote = await request(server)
      .post('/v1/quotes')
      .set('Idempotency-Key', 'quote:sandbox-completion')
      .send({
        actorId: 'operator-1',
        leadId,
        expectedVersion: (ready.body as { workflowVersion: number })
          .workflowVersion,
      })
      .expect(201);
    expect(quote.body).toMatchObject({
      binding: false,
      authority: 'SANDBOX',
      tariff: false,
      totalMinor: 4,
      currency: 'TRY',
      status: 'QUOTE_SENT',
      contract: false,
    });

    const refused = await request(server)
      .post('/v1/negotiations')
      .send({
        actorId: 'operator-1',
        leadId,
        expectedVersion: (quote.body as { version: number }).version,
        discountBps: 100,
      })
      .expect(409);
    expect(refused.body).toMatchObject({
      error: { code: 'NO_CONCESSION_AUTHORITY' },
    });

    const negotiated = await request(server)
      .post('/v1/negotiations')
      .set('Idempotency-Key', 'negotiation:sandbox-completion')
      .send({
        actorId: 'operator-1',
        leadId,
        expectedVersion: (quote.body as { version: number }).version,
        discountBps: 0,
      })
      .expect(201);
    expect(negotiated.body).toMatchObject({
      status: 'NEGOTIATING',
      discountBps: 0,
    });

    const followUp = await request(server)
      .post('/v1/follow-ups')
      .set('Idempotency-Key', 'follow:sandbox-completion')
      .send({ actorId: 'operator-1', leadId })
      .expect(201);
    expect(followUp.body).toMatchObject({
      channel: 'MOCK',
      sent: false,
      automatic: false,
    });

    const live = await request(server)
      .post('/v1/outbound/deliveries')
      .send({
        channel: 'WHATSAPP',
        origin: 'HUMAN',
        controlMode: 'AI_ACTIVE',
        templateApproved: true,
        templateVersion: 'sandbox-first-contact-v1',
      })
      .expect(409);
    expect(live.body).toMatchObject({ error: { code: 'UNSAFE_CHANNEL' } });

    const disabled = await request(server)
      .post('/v1/outbound/provider-deliveries')
      .set('Idempotency-Key', 'provider:sandbox-disabled')
      .send({
        channel: 'WHATSAPP',
        templateVersion: 'sandbox-first-contact-v1',
        mode: 'disabled',
      })
      .expect(409);
    expect(disabled.body).toMatchObject({ error: { code: 'UNSAFE_CHANNEL' } });

    const provider = await request(server)
      .post('/v1/outbound/provider-deliveries')
      .set('Idempotency-Key', 'provider:sandbox-completion')
      .send({
        channel: 'WHATSAPP',
        templateVersion: 'sandbox-first-contact-v1',
        mode: 'sandbox',
      })
      .expect(201);
    expect(provider.body).toMatchObject({
      provider: 'WHATSAPP_SANDBOX',
      network: false,
    });

    const accepted = await request(server)
      .post(`/v1/leads/${leadId}/acceptance`)
      .set('Idempotency-Key', 'acceptance:sandbox-completion')
      .send({
        actorId: 'operator-1',
        expectedVersion: (negotiated.body as { version: number }).version,
      })
      .expect(201);
    expect(accepted.body).toMatchObject({
      status: 'JOB_READY',
      contract: false,
    });

    const quotes = await request(server)
      .get(`/v1/leads/${leadId}/quotes/view`)
      .expect(200);
    const body = JSON.stringify(quotes.body);
    expect(quotes.body).toMatchObject({
      quotes: [
        expect.objectContaining({
          totalMinor: 4,
          binding: false,
          contract: false,
        }),
      ],
    });
    expect(body).not.toContain('+905551110077');
    expect(body).not.toContain('09:00-13:00');
    expect(body).not.toContain('completion listing must stay hidden');
  });
});
