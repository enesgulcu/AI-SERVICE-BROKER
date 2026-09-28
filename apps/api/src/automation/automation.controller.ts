import {
  automationRunRequestV1Schema,
  type AutomationRunRequestV1,
} from '@ai-service-broker/contracts';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { readCorrelationId } from '../platform/http/correlation-id';
import { ZodValidationPipe } from '../platform/http/zod-validation.pipe';
import { AutomationService } from './automation.service';

@Controller()
export class AutomationController {
  constructor(private readonly automation: AutomationService) {}

  @Get('v1/automation/policy')
  @HttpCode(HttpStatus.OK)
  policy() {
    return this.automation.policy();
  }

  @Post('v1/automation/runs')
  async run(
    @Body(new ZodValidationPipe(automationRunRequestV1Schema))
    body: AutomationRunRequestV1,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.automation.run({
      leadId: body.leadId,
      idempotencyKey,
      correlationId: readCorrelationId(request.id) ?? randomUUID(),
    });
    response.status(
      result.body.created && !result.replayed
        ? HttpStatus.CREATED
        : HttpStatus.OK,
    );
    return result.body;
  }
}
