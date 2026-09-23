import type { INestApplication } from '@nestjs/common';
import { json } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

export function configureApp(app: INestApplication): void {
  app.useLogger(app.get(Logger));
  app.use(json({ limit: '32kb' }));
  app.use(helmet());
  app.enableShutdownHooks();
}
