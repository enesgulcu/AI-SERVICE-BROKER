import { loadApiEnvironment } from '@ai-service-broker/config';
import {
  closedActionRequestV1Schema,
  confirmRequirementsRequestV1Schema,
  extractRequirementsRequestV1Schema,
  outboundDeliveryRequestV1Schema,
  recordRiskRequestV1Schema,
  type ClosedActionRequestV1,
  type ConfirmRequirementsRequestV1,
  type ExtractRequirementsRequestV1,
  type OutboundDeliveryRequestV1,
  type RecordRiskRequestV1,
} from '@ai-service-broker/contracts';
import { verifyWebhookSignature } from '@ai-service-broker/messaging';
import {
  Body,
  Controller,
  Get,
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
import { ApiError } from '../platform/http/api-error';
import { readCorrelationId } from '../platform/http/correlation-id';
import { ZodValidationPipe } from '../platform/http/zod-validation.pipe';
import { OperationsService } from './operations.service';

type RawRequest = Request & { rawBody?: Buffer };

@Controller()
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Post('v1/leads/:leadId/requirements')
  async confirm(
    @Param('leadId') leadId: string,
    @Body(new ZodValidationPipe(confirmRequirementsRequestV1Schema))
    body: ConfirmRequirementsRequestV1,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.operations.confirm({
      leadId,
      body,
      idempotencyKey,
      correlationId: this.correlation(request),
    });
    response.status(
      result.disposition === 'RECORDED' ? HttpStatus.CREATED : HttpStatus.OK,
    );
    return result;
  }

  @Post('v1/requirements/extractions')
  @HttpCode(HttpStatus.OK)
  extract(
    @Body(new ZodValidationPipe(extractRequirementsRequestV1Schema))
    body: ExtractRequirementsRequestV1,
  ) {
    return this.operations.extract(body);
  }

  @Post('v1/leads/:leadId/risk-signals')
  async recordRisk(
    @Param('leadId') leadId: string,
    @Body(new ZodValidationPipe(recordRiskRequestV1Schema))
    body: RecordRiskRequestV1,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.operations.recordSignal({
      leadId,
      body,
      idempotencyKey,
      correlationId: this.correlation(request),
    });
    response.status(
      result.recorded === 'CREATED' ? HttpStatus.CREATED : HttpStatus.OK,
    );
    return result;
  }

  @Post('v1/outbound/deliveries')
  @HttpCode(HttpStatus.OK)
  deliver(
    @Body(new ZodValidationPipe(outboundDeliveryRequestV1Schema))
    body: OutboundDeliveryRequestV1,
  ) {
    return this.operations.deliver(body);
  }

  @Post('v1/quotes')
  quote(
    @Body(new ZodValidationPipe(closedActionRequestV1Schema))
    body: ClosedActionRequestV1,
  ) {
    return this.operations.quote(body.actorId);
  }

  @Post('v1/negotiations')
  negotiate(
    @Body(new ZodValidationPipe(closedActionRequestV1Schema))
    body: ClosedActionRequestV1,
  ) {
    return this.operations.negotiate(body.actorId);
  }

  @Post('v1/follow-ups')
  followUp(
    @Body(new ZodValidationPipe(closedActionRequestV1Schema))
    body: ClosedActionRequestV1,
  ) {
    return this.operations.followUp(body.actorId);
  }

  @Get('v1/policy/facts')
  facts() {
    return this.operations.facts();
  }

  @Get('v1/leads/:leadId/view')
  masked(@Param('leadId') leadId: string) {
    return this.operations.maskedLead(leadId);
  }

  @Get('v1/reviews/queue')
  queue() {
    return this.operations.reviewQueue();
  }

  @Get('v1/funnel')
  funnel() {
    return this.operations.stages();
  }

  @Post('v1/webhooks/inbound')
  @HttpCode(HttpStatus.ACCEPTED)
  webhook(
    @Req() request: RawRequest,
    @Headers('x-webhook-timestamp') timestamp: string | undefined,
    @Headers('x-webhook-signature') signature: string | undefined,
  ) {
    const accepted = verifyWebhookSignature({
      secret: loadApiEnvironment().WEBHOOK_SECRET,
      timestamp: timestamp ?? '',
      body: request.rawBody?.toString('utf8') ?? '',
      signature: signature ?? '',
      now: new Date(),
    });
    if (!accepted) {
      throw new ApiError(HttpStatus.UNAUTHORIZED, {
        code: 'WEBHOOK_SIGNATURE_INVALID',
        message: 'The webhook signature was rejected.',
      });
    }
    return { disposition: 'ACCEPTED_NO_AUTOMATION' };
  }

  @Post('v1/outbox/dead-letters/:eventId/redrive')
  @HttpCode(HttpStatus.OK)
  redrive(
    @Param('eventId') eventId: string,
    @Body(new ZodValidationPipe(closedActionRequestV1Schema))
    body: ClosedActionRequestV1,
    @Req() request: Request,
  ) {
    return this.operations.redrive({
      eventId,
      body,
      correlationId: this.correlation(request),
    });
  }

  private correlation(request: Request): string {
    return readCorrelationId(request.id) ?? randomUUID();
  }
}
