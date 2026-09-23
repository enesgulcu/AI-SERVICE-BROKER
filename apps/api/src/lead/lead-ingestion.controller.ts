import {
  ingestLeadRequestV1Schema,
  type IngestLeadRequestV1,
  type IngestLeadResponseV1,
} from '@ai-service-broker/contracts';
import {
  Body,
  Controller,
  Headers,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { readCorrelationId } from '../platform/http/correlation-id';
import { ZodValidationPipe } from '../platform/http/zod-validation.pipe';
import { LeadIngestionService } from './lead-ingestion.service';

@Controller('v1/leads')
export class LeadIngestionController {
  constructor(private readonly leadIngestionService: LeadIngestionService) {}

  @Post()
  async ingest(
    @Body(new ZodValidationPipe(ingestLeadRequestV1Schema))
    body: IngestLeadRequestV1,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<IngestLeadResponseV1> {
    const correlationId = readCorrelationId(request.id) ?? randomUUID();
    const result = await this.leadIngestionService.ingest({
      body,
      idempotencyKey,
      correlationId,
    });

    response.status(
      result.disposition === 'CREATED' ? HttpStatus.CREATED : HttpStatus.OK,
    );
    return result;
  }
}
