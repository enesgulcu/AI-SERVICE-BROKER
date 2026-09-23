import {
  setConversationControlRequestV1Schema,
  type SetConversationControlRequestV1,
  type SetConversationControlResponseV1,
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
import {
  ConversationControlService,
  mapConversationControlError,
} from './conversation-control.service';

@Controller()
export class ConversationControlController {
  constructor(
    private readonly conversationControl: ConversationControlService,
  ) {}

  @Post('v1/conversations/:conversationId/control')
  async setControl(
    @Param('conversationId') conversationId: string,
    @Body(new ZodValidationPipe(setConversationControlRequestV1Schema))
    body: SetConversationControlRequestV1,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SetConversationControlResponseV1> {
    try {
      const result = await this.conversationControl.setControl({
        conversationId,
        body,
        idempotencyKey,
        correlationId: readCorrelationId(request.id) ?? randomUUID(),
      });
      response.status(
        result.disposition === 'CHANGED' ? HttpStatus.CREATED : HttpStatus.OK,
      );
      return result;
    } catch (error) {
      mapConversationControlError(error);
    }
  }
}
