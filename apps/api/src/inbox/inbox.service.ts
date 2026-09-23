import { loadApiEnvironment } from '@ai-service-broker/config';
import type {
  AcceptInboundRequestV1,
  AcceptInboundResponseV1,
} from '@ai-service-broker/contracts';
import {
  AcceptInboundMessage,
  InboundFlowError,
} from '@ai-service-broker/conversation';
import { HttpStatus, Injectable } from '@nestjs/common';
import { LeadPersistence } from '../lead/lead.module';
import { ApiError } from '../platform/http/api-error';

@Injectable()
export class InboxService {
  constructor(
    private readonly persistence: LeadPersistence,
    private readonly acceptInbound: AcceptInboundMessage,
  ) {}

  async accept(input: {
    body: AcceptInboundRequestV1;
    correlationId: string;
  }): Promise<AcceptInboundResponseV1> {
    const lead = await this.persistence.firstContact.findLead(
      input.body.leadId,
    );
    if (!lead) {
      throw new ApiError(HttpStatus.NOT_FOUND, {
        code: 'LEAD_NOT_FOUND',
        message: 'The requested lead was not found.',
      });
    }

    const result = await this.acceptInbound.execute({
      leadId: lead.id,
      source: lead.source,
      phone: lead.phone,
      providerMessageId: input.body.providerMessageId,
      body: input.body.body,
      correlationId: input.correlationId,
      automationPaused: loadApiEnvironment().AUTOMATION_PAUSED,
    });

    return {
      disposition: result.disposition,
      customerId: result.customerId,
      conversationId: result.conversationId,
      messageId: result.messageId,
      controlMode: result.controlMode,
      identityVerified: false,
    };
  }
}

export function mapInboundError(error: unknown): never {
  if (error instanceof InboundFlowError) {
    throw inboundFlowError(error);
  }
  throw error;
}

function inboundFlowError(error: InboundFlowError): ApiError {
  switch (error.code) {
    case 'CONTACT_NOT_ELIGIBLE':
      return new ApiError(HttpStatus.FORBIDDEN, {
        code: error.code,
        message: 'This lead cannot receive an inbound message.',
      });
    case 'INBOX_MESSAGE_CONFLICT':
      return new ApiError(HttpStatus.CONFLICT, {
        code: error.code,
        message:
          'This provider message was already recorded with different content.',
      });
    default:
      return new ApiError(HttpStatus.BAD_REQUEST, {
        code: error.code,
        message: 'The inbound message could not be accepted.',
      });
  }
}
