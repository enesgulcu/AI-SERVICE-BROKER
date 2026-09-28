import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

describe('Controllable automation (e2e)', () => {
  let app: INestApplication<App>;
  const previous = {
    mode: process.env.AUTOMATION_MODE,
    autoFirstContact: process.env.AUTO_FIRST_CONTACT,
    paused: process.env.AUTOMATION_PAUSED,
  };

  beforeAll(async () => {
    process.env.AUTOMATION_MODE = 'autonomous';
    process.env.AUTO_FIRST_CONTACT = 'true';
    process.env.AUTOMATION_PAUSED = 'false';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    restore('AUTOMATION_MODE', previous.mode);
    restore('AUTO_FIRST_CONTACT', previous.autoFirstContact);
    restore('AUTOMATION_PAUSED', previous.paused);
    await app.close();
  });

  it('runs the synthetic mock steps and replays the same key', async () => {
    const server = app.getHttpServer();
    const policy = await request(server)
      .get('/v1/automation/policy')
      .expect(200);
    expect(policy.body).toMatchObject({
      mode: 'autonomous',
      paused: false,
      autoFirstContact: true,
      actorId: 'automation',
      channel: 'MOCK',
      liveWhatsApp: false,
      bindingQuote: false,
      personalDataMode: 'synthetic',
    });

    const created = await request(server)
      .post('/v1/leads')
      .set('Idempotency-Key', 'lead:automation-run')
      .send({
        source: 'SYNTHETIC',
        sourceReference: 'automation-run',
        phone: '+905551110088',
      })
      .expect(201);
    const leadId = (created.body as { leadId: string }).leadId;

    const contacted = await request(server)
      .post('/v1/automation/runs')
      .set('Idempotency-Key', 'auto:contact-1')
      .send({ leadId })
      .expect(201);
    expect(contacted.body).toMatchObject({
      disposition: 'ADVANCED',
      leadId,
      status: 'CONTACTED',
      actorId: 'automation',
      reason: 'FIRST_CONTACT',
      stopped: false,
      created: true,
    });

    const replay = await request(server)
      .post('/v1/automation/runs')
      .set('Idempotency-Key', 'auto:contact-1')
      .send({ leadId })
      .expect(200);
    expect(replay.body).toEqual(contacted.body);

    const waiting = await request(server)
      .post('/v1/automation/runs')
      .set('Idempotency-Key', 'auto:interest-1')
      .send({ leadId })
      .expect(200);
    expect(waiting.body).toMatchObject({
      disposition: 'WAITING',
      status: 'CONTACTED',
      reason: 'CUSTOMER_INTEREST',
      stopped: true,
    });

    const interested = await request(server)
      .post(`/v1/leads/${leadId}/workflow-transitions`)
      .set('Idempotency-Key', 'workflow:automation-interested')
      .send({
        actorId: 'operator-1',
        toStatus: 'INTERESTED',
        expectedVersion: (contacted.body as { version: number }).version,
      })
      .expect(201);
    const needsRequirements = await request(server)
      .post('/v1/automation/runs')
      .set('Idempotency-Key', 'auto:requirements-1')
      .send({ leadId })
      .expect(200);
    expect(needsRequirements.body).toMatchObject({
      reason: 'REQUIREMENTS',
      stopped: true,
    });

    const ready = await request(server)
      .post(`/v1/leads/${leadId}/requirements`)
      .set('Idempotency-Key', 'requirement:automation-run')
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
    expect(
      (ready.body as { workflowVersion: number }).workflowVersion,
    ).toBeGreaterThan(0);

    const quoted = await request(server)
      .post('/v1/automation/runs')
      .set('Idempotency-Key', 'auto:quote-1')
      .send({ leadId })
      .expect(201);
    expect(quoted.body).toMatchObject({
      disposition: 'ADVANCED',
      status: 'QUOTE_SENT',
      reason: 'QUOTE',
      actorId: 'automation',
      stopped: false,
    });
    const quotes = await request(server)
      .get(`/v1/leads/${leadId}/quotes/view`)
      .expect(200);
    expect(quotes.body).toMatchObject({
      quotes: [
        {
          totalMinor: 4,
          binding: false,
          tariff: false,
          contract: false,
        },
      ],
    });

    const followUp = await request(server)
      .post('/v1/automation/runs')
      .set('Idempotency-Key', 'auto:follow-1')
      .send({ leadId })
      .expect(201);
    expect(followUp.body).toMatchObject({
      disposition: 'WAITING',
      status: 'QUOTE_SENT',
      reason: 'FOLLOW_UP_PLANNED',
      stopped: true,
      created: true,
    });

    const other = await request(server)
      .post('/v1/leads')
      .set('Idempotency-Key', 'lead:automation-other')
      .send({
        source: 'SYNTHETIC',
        sourceReference: 'automation-other',
        phone: '+905551110091',
      })
      .expect(201);
    const reused = await request(server)
      .post('/v1/automation/runs')
      .set('Idempotency-Key', 'auto:contact-1')
      .send({ leadId: (other.body as { leadId: string }).leadId })
      .expect(409);
    expect(reused.body).toMatchObject({
      error: { code: 'IDEMPOTENCY_KEY_REUSED' },
    });

    const missingKey = await request(server)
      .post('/v1/automation/runs')
      .send({ leadId })
      .expect(400);
    expect(missingKey.body).toMatchObject({
      error: { code: 'INVALID_IDEMPOTENCY_KEY' },
    });
  });

  it('stops when automation is paused or a human has control', async () => {
    const server = app.getHttpServer();
    process.env.AUTOMATION_PAUSED = 'true';
    try {
      const created = await request(server)
        .post('/v1/leads')
        .set('Idempotency-Key', 'lead:automation-paused')
        .send({
          source: 'SYNTHETIC',
          sourceReference: 'automation-paused',
          phone: '+905551110089',
        })
        .expect(201);
      const paused = await request(server)
        .post('/v1/automation/runs')
        .set('Idempotency-Key', 'auto:paused-1')
        .send({ leadId: (created.body as { leadId: string }).leadId })
        .expect(409);
      expect(paused.body).toMatchObject({
        error: { code: 'AUTOMATION_STOPPED' },
      });
    } finally {
      process.env.AUTOMATION_PAUSED = 'false';
    }

    const created = await request(server)
      .post('/v1/leads')
      .set('Idempotency-Key', 'lead:automation-human')
      .send({
        source: 'SYNTHETIC',
        sourceReference: 'automation-human',
        phone: '+905551110090',
      })
      .expect(201);
    const leadId = (created.body as { leadId: string }).leadId;
    const inbound = await request(server)
      .post('/v1/inbox/messages')
      .send({
        leadId,
        providerMessageId: 'mock-automation-human',
        body: 'operator owns this thread',
      })
      .expect(201);
    await request(server)
      .post(
        `/v1/conversations/${(inbound.body as { conversationId: string }).conversationId}/control`,
      )
      .set('Idempotency-Key', 'control:automation-human')
      .send({
        actorId: 'operator-1',
        controlMode: 'HUMAN_CONTROL',
        expectedVersion: 1,
      })
      .expect(201);
    const held = await request(server)
      .post('/v1/automation/runs')
      .set('Idempotency-Key', 'auto:human-1')
      .send({ leadId })
      .expect(409);
    expect(held.body).toMatchObject({ error: { code: 'AUTOMATION_STOPPED' } });

    process.env.AUTOMATION_MODE = 'supervised';
    try {
      const supervised = await request(server)
        .post('/v1/automation/runs')
        .set('Idempotency-Key', 'auto:supervised-1')
        .send({ leadId })
        .expect(409);
      expect(supervised.body).toMatchObject({
        error: { code: 'AUTOMATION_STOPPED' },
      });
    } finally {
      process.env.AUTOMATION_MODE = 'autonomous';
    }

    process.env.AUTO_FIRST_CONTACT = 'false';
    try {
      const heldBack = await request(server)
        .post('/v1/leads')
        .set('Idempotency-Key', 'lead:automation-manual-contact')
        .send({
          source: 'SYNTHETIC',
          sourceReference: 'automation-manual-contact',
          phone: '+905551110092',
        })
        .expect(201);
      const manual = await request(server)
        .post('/v1/automation/runs')
        .set('Idempotency-Key', 'auto:manual-contact-1')
        .send({ leadId: (heldBack.body as { leadId: string }).leadId })
        .expect(409);
      expect(manual.body).toMatchObject({
        error: { code: 'AUTOMATION_STOPPED' },
      });
    } finally {
      process.env.AUTO_FIRST_CONTACT = 'true';
    }
  });
});

function restore(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
