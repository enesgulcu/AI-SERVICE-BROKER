import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

describe('Inbound inbox (e2e)', () => {
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

  it('records a synthetic inbound message once and rejects a changed body', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/leads')
      .set('Idempotency-Key', 'lead:e2e-inbox-1')
      .send({
        source: 'SYNTHETIC',
        sourceReference: 'listing-e2e-inbox',
        phone: '+905551112233',
      })
      .expect(201);
    const leadId = (created.body as { leadId: string }).leadId;
    const message = {
      leadId,
      providerMessageId: 'mock-inbox-1',
      body: 'gizli mesaj',
    };

    const recorded = await request(app.getHttpServer())
      .post('/v1/inbox/messages')
      .send(message)
      .expect(201);
    expect(recorded.body).toMatchObject({
      disposition: 'RECORDED',
      controlMode: 'AI_ACTIVE',
      identityVerified: false,
    });
    expect(JSON.stringify(recorded.body)).not.toContain('+905551112233');
    expect(JSON.stringify(recorded.body)).not.toContain('gizli mesaj');

    const duplicate = await request(app.getHttpServer())
      .post('/v1/inbox/messages')
      .send(message)
      .expect(200);
    expect(duplicate.body).toMatchObject({
      disposition: 'DUPLICATE',
      messageId: (recorded.body as { messageId: string }).messageId,
      customerId: (recorded.body as { customerId: string }).customerId,
    });

    const conflict = await request(app.getHttpServer())
      .post('/v1/inbox/messages')
      .send({ ...message, body: 'baska metin' })
      .expect(409);
    expect(conflict.body).toMatchObject({
      error: { code: 'INBOX_MESSAGE_CONFLICT', status: 409 },
    });
    expect(JSON.stringify(conflict.body)).not.toContain('baska metin');
    expect(JSON.stringify(conflict.body)).not.toContain('+905551112233');
  });

  it('does not record an inbound message for an unknown lead', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/inbox/messages')
      .send({
        leadId: '92d60e65-14f0-4d4f-b9ae-062c8f685213',
        providerMessageId: 'mock-inbox-missing',
        body: 'merhaba',
      })
      .expect(404);

    expect(response.body).toMatchObject({
      error: { code: 'LEAD_NOT_FOUND', status: 404 },
    });
  });
});
