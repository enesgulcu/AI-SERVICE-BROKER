import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';

describe('API foundation (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
  });

  it('returns liveness with security and correlation headers', async () => {
    const response = await request(app.getHttpServer())
      .get('/health/live')
      .expect(200)
      .expect('x-content-type-options', 'nosniff');

    const correlationHeader = response.headers['x-correlation-id'] as unknown;
    const body = response.body as unknown;

    expect(typeof correlationHeader).toBe('string');
    expect(body).toMatchObject({
      service: 'api',
      status: 'ok',
    });
  });

  it('returns readiness', async () => {
    const response = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200);

    const body = response.body as unknown;
    expect(body).toMatchObject({
      service: 'api',
      status: 'ok',
      checks: {
        configuration: 'ok',
        database: 'skipped',
      },
    });
    expect(typeof (body as { timestamp?: unknown }).timestamp).toBe('string');
  });

  it('preserves a valid inbound correlation ID', async () => {
    const correlationId = 'test-request:123';
    const response = await request(app.getHttpServer())
      .get('/health/live')
      .set('x-correlation-id', correlationId)
      .expect(200);

    expect(response.headers['x-correlation-id'] as unknown).toBe(correlationId);
  });

  it('replaces a correlation ID that is too short for lead processing', async () => {
    const response = await request(app.getHttpServer())
      .get('/health/live')
      .set('x-correlation-id', 'short')
      .expect(200);

    const correlationHeader = response.headers['x-correlation-id'] as unknown;
    expect(correlationHeader).not.toBe('short');
    expect(correlationHeader).toEqual(
      expect.stringMatching(/^[a-zA-Z0-9._:-]{8,128}$/),
    );
  });

  it('replaces an unsafe inbound correlation ID', async () => {
    const response = await request(app.getHttpServer())
      .get('/health/live')
      .set('x-correlation-id', 'unsafe correlation value')
      .expect(200);

    const correlationHeader = response.headers['x-correlation-id'] as unknown;
    expect(correlationHeader).not.toBe('unsafe correlation value');
    expect(typeof correlationHeader).toBe('string');
  });

  it('returns a safe error contract with correlation', async () => {
    const correlationId = 'missing-route:123';
    const response = await request(app.getHttpServer())
      .get('/does-not-exist?private=value')
      .set('x-correlation-id', correlationId)
      .expect(404);

    const body = response.body as unknown;
    expect(body).toMatchObject({
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'The requested resource was not found.',
        status: 404,
        correlationId,
        path: '/does-not-exist',
      },
    });
    const error = (body as { error: { timestamp?: unknown } }).error;
    expect(typeof error.timestamp).toBe('string');
    expect(JSON.stringify(body)).not.toContain('private=value');
  });

  afterAll(async () => {
    await app.close();
  });
});
