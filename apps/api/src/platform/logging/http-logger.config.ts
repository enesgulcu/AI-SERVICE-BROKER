import type { ApiEnvironment } from '@ai-service-broker/config';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Options } from 'pino-http';
import { SAFE_CORRELATION_ID } from '../http/correlation-id';

const CORRELATION_ID_HEADER = 'x-correlation-id';

function getCorrelationId(request: IncomingMessage): string {
  const header = request.headers[CORRELATION_ID_HEADER];
  return typeof header === 'string' && SAFE_CORRELATION_ID.test(header)
    ? header
    : randomUUID();
}

export function createHttpLoggerOptions(environment: ApiEnvironment): Options {
  const isTest = environment.NODE_ENV === 'test';
  const usePrettyLogs =
    environment.NODE_ENV === 'local' || environment.NODE_ENV === 'development';

  return {
    level: isTest ? 'silent' : environment.LOG_LEVEL,
    genReqId(request: IncomingMessage, response: ServerResponse): string {
      const correlationId = getCorrelationId(request);
      response.setHeader(CORRELATION_ID_HEADER, correlationId);
      return correlationId;
    },
    serializers: {
      req(request: unknown) {
        const value = request as {
          id?: unknown;
          method?: unknown;
          url?: unknown;
          remoteAddress?: unknown;
        };
        return {
          id: typeof value.id === 'string' ? value.id : undefined,
          method: typeof value.method === 'string' ? value.method : undefined,
          path:
            typeof value.url === 'string' ? value.url.split('?')[0] : undefined,
          remoteAddress:
            typeof value.remoteAddress === 'string'
              ? value.remoteAddress
              : undefined,
        };
      },
      res(response: unknown) {
        const value = response as { statusCode?: unknown };
        return {
          statusCode:
            typeof value.statusCode === 'number' ? value.statusCode : undefined,
        };
      },
    },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-api-key"]',
        'request.headers.authorization',
        'request.headers.cookie',
      ],
      censor: '[REDACTED]',
    },
    transport: usePrettyLogs
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            singleLine: true,
            translateTime: 'SYS:standard',
          },
        }
      : undefined,
  };
}
