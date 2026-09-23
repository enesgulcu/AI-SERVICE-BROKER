import { loadWorkerEnvironment } from '@ai-service-broker/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const environment = loadWorkerEnvironment();
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();

  Logger.log(`Worker "${environment.WORKER_NAME}" started`, 'Bootstrap');
}

void bootstrap();
