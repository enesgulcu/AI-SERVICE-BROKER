import { loadApiEnvironment } from '@ai-service-broker/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

async function bootstrap() {
  const environment = loadApiEnvironment();
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  configureApp(app);
  await app.listen(environment.API_PORT, '0.0.0.0');
}

void bootstrap();
