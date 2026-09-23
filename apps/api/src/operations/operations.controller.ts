import { loadApiEnvironment } from '@ai-service-broker/config';
import {
  acceptanceRequestV1Schema,
  closedActionRequestV1Schema,
  confirmRequirementsRequestV1Schema,
  followUpRequestV1Schema,
  negotiationRequestV1Schema,
  providerDeliveryRequestV1Schema,
  sandboxQuoteRequestV1Schema,
  extractRequirementsRequestV1Schema,
  outboundDeliveryRequestV1Schema,
  deliveryCallbackRequestV1Schema,
  recordRiskRequestV1Schema,
  type AcceptanceRequestV1,
  type ClosedActionRequestV1,
  type ConfirmRequirementsRequestV1,
  type FollowUpRequestV1,
  type NegotiationRequestV1,
  type ProviderDeliveryRequestV1,
  type SandboxQuoteRequestV1,
  type DeliveryCallbackRequestV1,
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

  @Post('v1/delivery-callbacks')
  async callback(
    @Body(new ZodValidationPipe(deliveryCallbackRequestV1Schema))
    body: DeliveryCallbackRequestV1,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.operations.callback(body);
    response.status(
      result.disposition === 'CREATED' ? HttpStatus.CREATED : HttpStatus.OK,
    );
    return result;
  }

  @Post('v1/quotes')
  async quote(
    @Body(new ZodValidationPipe(sandboxQuoteRequestV1Schema))
    body: SandboxQuoteRequestV1,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.operations.quote({
      body,
      idempotencyKey,
      correlationId: this.correlation(request),
    });
    if ('disposition' in result && result.disposition === 'CREATED') {
      response.status(HttpStatus.CREATED);
    }
    return result;
  }

  @Post('v1/negotiations')
  async negotiate(
    @Body(new ZodValidationPipe(negotiationRequestV1Schema))
    body: NegotiationRequestV1,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.operations.negotiate({
      body,
      idempotencyKey,
      correlationId: this.correlation(request),
    });
    if ('disposition' in result && result.disposition === 'CREATED') {
      response.status(HttpStatus.CREATED);
    }
    return result;
  }

  @Post('v1/follow-ups')
  async followUp(
    @Body(new ZodValidationPipe(followUpRequestV1Schema))
    body: FollowUpRequestV1,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.operations.followUp({
      body,
      idempotencyKey,
      correlationId: this.correlation(request),
    });
    if ('disposition' in result && result.disposition === 'CREATED') {
      response.status(HttpStatus.CREATED);
    }
    return result;
  }

  @Post('v1/leads/:leadId/acceptance')
  async accept(
    @Param('leadId') leadId: string,
    @Body(new ZodValidationPipe(acceptanceRequestV1Schema))
    body: AcceptanceRequestV1,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.operations.accept({
      leadId,
      body,
      idempotencyKey,
      correlationId: this.correlation(request),
    });
    response.status(
      result.disposition === 'CREATED' ? HttpStatus.CREATED : HttpStatus.OK,
    );
    return result;
  }

  @Post('v1/outbound/provider-deliveries')
  async provider(
    @Body(new ZodValidationPipe(providerDeliveryRequestV1Schema))
    body: ProviderDeliveryRequestV1,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.operations.providerDelivery({
      body,
      idempotencyKey,
    });
    response.status(
      result.disposition === 'CREATED' ? HttpStatus.CREATED : HttpStatus.OK,
    );
    return result;
  }

  @Get('v1/policy/facts')
  facts() {
    return this.operations.facts();
  }

  @Get('v1/leads/:leadId/view')
  masked(@Param('leadId') leadId: string) {
    return this.operations.maskedLead(leadId);
  }

  @Get('v1/leads/:leadId/requirements/view')
  requirements(@Param('leadId') leadId: string) {
    return this.operations.requirementView(leadId);
  }

  @Get('v1/leads/:leadId/conversations/view')
  conversations(@Param('leadId') leadId: string) {
    return this.operations.conversationView(leadId);
  }

  @Get('v1/leads/:leadId/quotes/view')
  quotes(@Param('leadId') leadId: string) {
    return this.operations.quoteView(leadId);
  }

  @Get('v1/leads/:leadId/audit')
  audit(@Param('leadId') leadId: string) {
    return this.operations.auditView(leadId);
  }

  @Get('v1/reviews/queue')
  queue() {
    return this.operations.reviewQueue();
  }

  @Get('v1/funnel')
  funnel() {
    return this.operations.stages();
  }

  @Get('v1/operations/summary')
  summary() {
    return this.operations.summary();
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
