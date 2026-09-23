import { loadApiEnvironment } from '@ai-service-broker/config';
import {
  createRequestFingerprint,
  idempotencyKeySchema,
  type SetConversationControlRequestV1,
  type SetConversationControlResponseV1,
} from '@ai-service-broker/contracts';
import {
  ConversationControlError,
  SetConversationControl,
} from '@ai-service-broker/conversation';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ApiError } from '../platform/http/api-error';

@Injectable()
export class ConversationControlService {
  constructor(
    private readonly setConversationControl: SetConversationControl,
  ) {}

  async setControl(input: {
    conversationId: string;
    body: SetConversationControlRequestV1;
    idempotencyKey: string | undefined;
    correlationId: string;
  }): Promise<SetConversationControlResponseV1> {
    const parsedKey = idempotencyKeySchema.safeParse(input.idempotencyKey);
    if (!parsedKey.success) {
      throw new ApiError(HttpStatus.BAD_REQUEST, {
        code: 'INVALID_IDEMPOTENCY_KEY',
        message: 'A valid Idempotency-Key header is required.',
      });
    }

    return this.setConversationControl.execute({
      conversationId: input.conversationId,
      actorId: input.body.actorId,
      controlMode: input.body.controlMode,
      expectedVersion: input.body.expectedVersion,
      idempotencyKey: parsedKey.data,
      requestFingerprint: createRequestFingerprint({
        conversationId: input.conversationId,
        actorId: input.body.actorId,
        controlMode: input.body.controlMode,
        expectedVersion: input.body.expectedVersion,
      }),
      correlationId: input.correlationId,
      automationPaused: loadApiEnvironment().AUTOMATION_PAUSED,
    });
  }
}

export function mapConversationControlError(error: unknown): never {
  if (error instanceof ConversationControlError) {
    throw conversationControlError(error);
  }
  throw error;
}

function conversationControlError(error: ConversationControlError): ApiError {
  switch (error.code) {
    case 'CONVERSATION_NOT_FOUND':
      return new ApiError(HttpStatus.NOT_FOUND, {
        code: error.code,
        message: 'The requested conversation was not found.',
      });
    case 'KILL_SWITCH_ACTIVE':
      return new ApiError(HttpStatus.CONFLICT, {
        code: error.code,
        message:
          'Automation is paused, so the conversation cannot return to AI control.',
      });
    case 'VERSION_CONFLICT':
      return new ApiError(HttpStatus.CONFLICT, {
        code: error.code,
        message:
          'The conversation changed before this control action could commit.',
      });
    case 'IDEMPOTENCY_KEY_REUSED':
      return new ApiError(HttpStatus.CONFLICT, {
        code: error.code,
        message:
          'The Idempotency-Key was already used with a different request.',
      });
    default:
      return new ApiError(HttpStatus.BAD_REQUEST, {
        code: error.code,
        message: 'The conversation control request could not be accepted.',
      });
  }
}
