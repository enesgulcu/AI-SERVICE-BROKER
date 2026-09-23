import { HttpStatus, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { ApiError } from './api-error';

interface SchemaIssue {
  path: ReadonlyArray<PropertyKey>;
}

interface ParseResult<T> {
  success: boolean;
  data?: T;
  error?: {
    issues: SchemaIssue[];
  };
}

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const parsed = this.schema.safeParse(value) as ParseResult<T>;
    if (parsed.success && parsed.data !== undefined) {
      return parsed.data;
    }

    const fields = [
      ...new Set(
        (parsed.error?.issues ?? [])
          .map((issue) => issue.path[0])
          .filter((field): field is string => typeof field === 'string'),
      ),
    ];

    throw new ApiError(HttpStatus.BAD_REQUEST, {
      code: 'VALIDATION_FAILED',
      message: 'The request body is invalid.',
      fields,
    });
  }
}
