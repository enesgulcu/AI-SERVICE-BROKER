import {
  advanceWorkflowRequestV1Schema,
  type AdvanceWorkflowRequestV1,
  type AdvanceWorkflowResponseV1,
} from '@ai-service-broker/contracts';
import {
  Body,
  Controller,
  Headers,
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
import { mapWorkflowError, WorkflowService } from './workflow.service';

@Controller()
export class WorkflowController {
  constructor(private readonly workflow: WorkflowService) {}

  @Post('v1/leads/:leadId/workflow-transitions')
  async advance(
    @Param('leadId') leadId: string,
    @Body(new ZodValidationPipe(advanceWorkflowRequestV1Schema))
    body: AdvanceWorkflowRequestV1,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AdvanceWorkflowResponseV1> {
    try {
      const result = await this.workflow.advance({
        leadId,
        body,
        idempotencyKey,
        correlationId: readCorrelationId(request.id) ?? randomUUID(),
      });
      response.status(
        result.disposition === 'CHANGED' ? HttpStatus.CREATED : HttpStatus.OK,
      );
      return result;
    } catch (error) {
      mapWorkflowError(error);
    }
  }
}
