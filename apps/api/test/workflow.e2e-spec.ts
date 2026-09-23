import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

describe('Workflow transitions (e2e)', () => {
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
      })
      .expect(201);
    return (created.body as { leadId: string }).leadId;
  }

  it('closes a new lead with a reason and replays the same request', async () => {
    const leadId = await createLead('listing-e2e-workflow-close');
    const body = {
      actorId: 'operator-1',
      toStatus: 'CLOSED_LOST',
      expectedVersion: 1,
      reasonCode: 'WITHDRAWN',
    };

    const changed = await request(app.getHttpServer())
      .post(`/v1/leads/${leadId}/workflow-transitions`)
      .set('Idempotency-Key', 'workflow:e2e-close-1')
      .send(body)
      .expect(201);
    expect(changed.body).toMatchObject({
      leadId,
      disposition: 'CHANGED',
      fromStatus: 'NEW',
      toStatus: 'CLOSED_LOST',
      version: 2,
      policyVersion: 'workflow-v1',
      reasonCode: 'WITHDRAWN',
    });
    expect(JSON.stringify(changed.body)).not.toContain('+905551112255');

    const replay = await request(app.getHttpServer())
      .post(`/v1/leads/${leadId}/workflow-transitions`)
      .set('Idempotency-Key', 'workflow:e2e-close-1')
      .send(body)
      .expect(200);
    expect(replay.body).toMatchObject({ disposition: 'DUPLICATE', version: 2 });
  });

  it('refuses a price transition and a bypass of first contact', async () => {
    const priced = await createLead('listing-e2e-workflow-price');
    const price = await request(app.getHttpServer())
      .post(`/v1/leads/${priced}/workflow-transitions`)
      .set('Idempotency-Key', 'workflow:e2e-price-1')
      .send({
        actorId: 'operator-1',
        toStatus: 'QUOTE_READY',
        expectedVersion: 1,
      })
      .expect(409);
    expect(price.body).toMatchObject({
      error: { code: 'PRICING_NOT_AVAILABLE', status: 409 },
    });

    const contact = await createLead('listing-e2e-workflow-contact');
    const blocked = await request(app.getHttpServer())
      .post(`/v1/leads/${contact}/workflow-transitions`)
      .set('Idempotency-Key', 'workflow:e2e-contact-1')
      .send({
        actorId: 'operator-1',
        toStatus: 'CONTACT_PENDING',
        expectedVersion: 1,
      })
      .expect(409);
    expect(blocked.body).toMatchObject({
      error: { code: 'USE_CONTACT_FLOW', status: 409 },
    });
  });
});
