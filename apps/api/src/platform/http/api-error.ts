import { HttpException, HttpStatus } from '@nestjs/common';

export interface ApiErrorBody {
  code: string;
  message: string;
  fields?: string[];
}

export class ApiError extends HttpException {
  constructor(status: HttpStatus, body: ApiErrorBody) {
    super(body, status);
  }
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as {
    code?: unknown;
    message?: unknown;
    fields?: unknown;
  };
  return (
    typeof candidate.code === 'string' && typeof candidate.message === 'string'
  );
}
