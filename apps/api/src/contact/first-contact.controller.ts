import {
  decideFirstContactRequestV1Schema,
  prepareFirstContactRequestV1Schema,
  type DecideFirstContactRequestV1,
  type DecideFirstContactResponseV1,
  type PrepareFirstContactRequestV1,
  type PrepareFirstContactResponseV1,
} from '@ai-service-broker/contracts';
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { readCorrelationId } from '../platform/http/correlation-id';
import { ZodValidationPipe } from '../platform/http/zod-validation.pipe';
import {
  FirstContactService,
  mapFirstContactError,
} from './first-contact.service';

@Controller()
export class FirstContactController {
  constructor(private readonly firstContact: FirstContactService) {}

  @Post('v1/leads/:leadId/contact-reviews')
  async prepare(
    @Param('leadId') leadId: string,
    @Body(new ZodValidationPipe(prepareFirstContactRequestV1Schema))
    body: PrepareFirstContactRequestV1,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PrepareFirstContactResponseV1> {
    try {
      const result = await this.firstContact.prepare({
        leadId,
        body,
        idempotencyKey,
        correlationId: readCorrelationId(request.id) ?? randomUUID(),
      });
      response.status(
        result.disposition === 'PENDING' ? HttpStatus.CREATED : HttpStatus.OK,
      );
      return result;
    } catch (error) {
      mapFirstContactError(error);
    }
  }

  @Post('v1/contact-reviews/:reviewId/decisions')
  @HttpCode(HttpStatus.OK)
  async decide(
    @Param('reviewId') reviewId: string,
    @Body(new ZodValidationPipe(decideFirstContactRequestV1Schema))
    body: DecideFirstContactRequestV1,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
  ): Promise<DecideFirstContactResponseV1> {
    try {
      return await this.firstContact.decide({
        reviewId,
        body,
        idempotencyKey,
        correlationId: readCorrelationId(request.id) ?? randomUUID(),
      });
    } catch (error) {
      mapFirstContactError(error);
    }
  }
}
