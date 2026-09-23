import { loadApiEnvironment } from '@ai-service-broker/config';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ApiExceptionFilter } from './platform/http/api-exception.filter';
import { createHttpLoggerOptions } from './platform/logging/http-logger.config';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: createHttpLoggerOptions(loadApiEnvironment()),
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter,
    },
  ],
})
export class AppModule {}
