import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

describe('Conversation control (e2e)', () => {
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

  it('lets an operator take a conversation and replays the same request', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/leads')
      .set('Idempotency-Key', 'lead:e2e-control-1')
      .send({
        source: 'SYNTHETIC',
        sourceReference: 'listing-e2e-control',
        phone: '+905551112244',
      })
      .expect(201);
    const leadId = (created.body as { leadId: string }).leadId;
    const inbound = await request(app.getHttpServer())
      .post('/v1/inbox/messages')
      .send({
        leadId,
        providerMessageId: 'mock-control-1',
        body: 'gizli mesaj',
      })
      .expect(201);
    const conversationId = (inbound.body as { conversationId: string })
      .conversationId;
    const body = {
      actorId: 'operator-1',
      controlMode: 'HUMAN_CONTROL',
      expectedVersion: 1,
    };

    const changed = await request(app.getHttpServer())
      .post(`/v1/conversations/${conversationId}/control`)
      .set('Idempotency-Key', 'control:e2e-1')
      .send(body)
      .expect(201);
    expect(changed.body).toEqual({
      conversationId,
      controlMode: 'HUMAN_CONTROL',
      version: 2,
      disposition: 'CHANGED',
      automatedReplyAllowed: false,
    });
    expect(JSON.stringify(changed.body)).not.toContain('+905551112244');
    expect(JSON.stringify(changed.body)).not.toContain('gizli mesaj');

    const replay = await request(app.getHttpServer())
      .post(`/v1/conversations/${conversationId}/control`)
      .set('Idempotency-Key', 'control:e2e-1')
      .send(body)
      .expect(200);
    expect(replay.body).toMatchObject({
      disposition: 'DUPLICATE',
      version: 2,
      automatedReplyAllowed: false,
    });

    const stale = await request(app.getHttpServer())
      .post(`/v1/conversations/${conversationId}/control`)
      .set('Idempotency-Key', 'control:e2e-2')
      .send({ ...body, controlMode: 'PAUSED', expectedVersion: 1 })
      .expect(409);
    expect(stale.body).toMatchObject({
      error: { code: 'VERSION_CONFLICT', status: 409 },
    });
  });
});
