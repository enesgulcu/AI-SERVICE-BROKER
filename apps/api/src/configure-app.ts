import { loadApiEnvironment } from '@ai-service-broker/config';
import { authorizeOperator, consumeRate } from '@ai-service-broker/safety';
import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { json } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

const postWindows = new Map<string, { windowStart: number; count: number }>();

export function configureApp(app: INestApplication): void {
  app.useLogger(app.get(Logger));
  app.use(
    json({
      limit: '32kb',
      verify(request, _response, buffer) {
        (request as Request & { rawBody?: Buffer }).rawBody = buffer;
      },
    }),
  );
  app.use(limitPosts);
  app.use(authorize);
  app.use(helmet());
  app.enableShutdownHooks();
}

function authorize(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const environment = loadApiEnvironment();
  const decision = authorizeOperator({
    method: request.method,
    path: request.path,
    authorization: request.header('authorization'),
    mode: environment.OPERATOR_AUTH,
    token: environment.OPERATOR_TOKEN,
    role: environment.OPERATOR_ROLE,
  });
  if (!decision.ok) {
    response.status(decision.status).json({
      code: decision.code,
      message: 'Operator authentication failed.',
    });
    return;
  }
  next();
}

function limitPosts(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (request.method !== 'POST') {
    next();
    return;
  }
  const allowed = consumeRate(
    postWindows,
    request.ip ?? 'local',
    Date.now(),
    100,
    60_000,
  );
  if (!allowed) {
    response.status(429).json({
      code: 'RATE_LIMITED',
      message: 'Too many requests.',
    });
    return;
  }
  next();
}
