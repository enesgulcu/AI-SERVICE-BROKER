import {
  acceptInboundRequestV1Schema,
  type AcceptInboundRequestV1,
  type AcceptInboundResponseV1,
} from '@ai-service-broker/contracts';
import { Body, Controller, HttpStatus, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { readCorrelationId } from '../platform/http/correlation-id';
import { ZodValidationPipe } from '../platform/http/zod-validation.pipe';
import { InboxService, mapInboundError } from './inbox.service';

@Controller()
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Post('v1/inbox/messages')
  async accept(
    @Body(new ZodValidationPipe(acceptInboundRequestV1Schema))
    body: AcceptInboundRequestV1,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AcceptInboundResponseV1> {
    try {
      const result = await this.inbox.accept({
        body,
        correlationId: readCorrelationId(request.id) ?? randomUUID(),
      });
      response.status(
        result.disposition === 'RECORDED' ? HttpStatus.CREATED : HttpStatus.OK,
      );
      return result;
    } catch (error) {
      mapInboundError(error);
    }
  }
}
