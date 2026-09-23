import { loadApiEnvironment } from '@ai-service-broker/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const environment = loadApiEnvironment();
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  await app.listen(environment.API_PORT, '0.0.0.0');
}

void bootstrap();
