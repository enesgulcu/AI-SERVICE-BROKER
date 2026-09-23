import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { isApiErrorBody } from './api-error';

interface ErrorDescriptor {
  code: string;
  message: string;
}

const ERROR_DESCRIPTORS: Readonly<Record<number, ErrorDescriptor>> = {
  [HttpStatus.BAD_REQUEST]: {
    code: 'BAD_REQUEST',
    message: 'The request could not be processed.',
  },
  [HttpStatus.UNAUTHORIZED]: {
    code: 'UNAUTHORIZED',
    message: 'Authentication is required.',
  },
  [HttpStatus.FORBIDDEN]: {
    code: 'FORBIDDEN',
    message: 'The requested action is not allowed.',
  },
  [HttpStatus.NOT_FOUND]: {
    code: 'RESOURCE_NOT_FOUND',
    message: 'The requested resource was not found.',
  },
  [HttpStatus.CONFLICT]: {
    code: 'CONFLICT',
    message: 'The request conflicts with the current resource state.',
  },
  [HttpStatus.TOO_MANY_REQUESTS]: {
    code: 'RATE_LIMITED',
    message: 'Too many requests.',
  },
};

@Catch()
@Injectable()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(ApiExceptionFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const responseBody =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const customBody = isApiErrorBody(responseBody) ? responseBody : undefined;
    const descriptor =
      customBody ??
      ERROR_DESCRIPTORS[status] ??
      (status >= 400 && status < 500
        ? {
            code: 'REQUEST_REJECTED',
            message: 'The request was rejected.',
          }
        : {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'An unexpected error occurred.',
          });
    const path = request.originalUrl.split('?')[0];
    const correlationId =
      typeof request.id === 'string' || typeof request.id === 'number'
        ? String(request.id)
        : 'unknown';

    const logContext = {
      correlationId,
      method: request.method,
      path,
      status,
    };
    if (status >= 500) {
      this.logger.error(
        { ...logContext, err: exception },
        'HTTP request failed',
      );
    } else {
      this.logger.warn(logContext, 'HTTP request rejected');
    }

    response.status(status).json({
      error: {
        code: descriptor.code,
        message: descriptor.message,
        ...(customBody?.fields ? { fields: customBody.fields } : {}),
        status,
        correlationId,
        timestamp: new Date().toISOString(),
        path,
      },
    });
  }
}
