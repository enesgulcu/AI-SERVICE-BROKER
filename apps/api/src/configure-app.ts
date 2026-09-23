import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

export function configureApp(app: INestApplication): void {
  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.enableShutdownHooks();
}
