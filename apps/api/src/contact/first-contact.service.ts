import { loadApiEnvironment } from '@ai-service-broker/config';
import {
  createRequestFingerprint,
  idempotencyKeySchema,
  type DecideFirstContactRequestV1,
  type DecideFirstContactResponseV1,
  type PrepareFirstContactRequestV1,
  type PrepareFirstContactResponseV1,
} from '@ai-service-broker/contracts';
import {
  ContactFlowError,
  DecideFirstContact,
  PrepareFirstContact,
} from '@ai-service-broker/contact';
import {
  IdempotencyConflictError,
  LeadVersionConflictError,
} from '@ai-service-broker/lead';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ApiError } from '../platform/http/api-error';

@Injectable()
export class FirstContactService {
  constructor(
    private readonly prepareFirstContact: PrepareFirstContact,
    private readonly decideFirstContact: DecideFirstContact,
  ) {}

  async prepare(input: {
    leadId: string;
    body: PrepareFirstContactRequestV1;
    idempotencyKey: string | undefined;
    correlationId: string;
  }): Promise<PrepareFirstContactResponseV1> {
    const pending = await this.prepareFirstContact.execute({
      leadId: input.leadId,
      actorId: input.body.actorId,
      idempotencyKey: this.idempotencyKey(input.idempotencyKey),
      requestFingerprint: createRequestFingerprint({
        leadId: input.leadId,
        actorId: input.body.actorId,
      }),
      correlationId: input.correlationId,
    });

    return {
      reviewId: pending.reviewId,
      leadId: pending.leadId,
      disposition: pending.disposition,
      draft: pending.draft,
      templateVersion: pending.templateVersion,
      expiresAt: pending.expiresAt.toISOString(),
    };
  }

  async decide(input: {
    reviewId: string;
    body: DecideFirstContactRequestV1;
    idempotencyKey: string | undefined;
    correlationId: string;
  }): Promise<DecideFirstContactResponseV1> {
    return this.decideFirstContact.execute({
      reviewId: input.reviewId,
      actorId: input.body.actorId,
      decision: input.body.decision,
      idempotencyKey: this.idempotencyKey(input.idempotencyKey),
      requestFingerprint: createRequestFingerprint({
        reviewId: input.reviewId,
        actorId: input.body.actorId,
        decision: input.body.decision,
      }),
      correlationId: input.correlationId,
      automationPaused: loadApiEnvironment().AUTOMATION_PAUSED,
    });
  }

  private idempotencyKey(value: string | undefined): string {
    const parsed = idempotencyKeySchema.safeParse(value);
    if (!parsed.success) {
      throw new ApiError(HttpStatus.BAD_REQUEST, {
        code: 'INVALID_IDEMPOTENCY_KEY',
        message: 'A valid Idempotency-Key header is required.',
      });
    }
    return parsed.data;
  }
}

export function mapFirstContactError(error: unknown): never {
  if (error instanceof IdempotencyConflictError) {
    throw new ApiError(HttpStatus.CONFLICT, {
      code: 'IDEMPOTENCY_KEY_REUSED',
      message: 'The Idempotency-Key was already used with a different request.',
    });
  }
  if (error instanceof LeadVersionConflictError) {
    throw new ApiError(HttpStatus.CONFLICT, {
      code: 'LEAD_VERSION_CONFLICT',
      message: 'The lead changed before the contact action could commit.',
    });
  }
  if (error instanceof ContactFlowError) {
    throw contactFlowError(error);
  }
  throw error;
}

function contactFlowError(error: ContactFlowError): ApiError {
  switch (error.code) {
    case 'LEAD_NOT_FOUND':
    case 'REVIEW_NOT_FOUND':
      return new ApiError(HttpStatus.NOT_FOUND, {
        code: error.code,
        message: 'The requested contact record was not found.',
      });
    case 'CONTACT_NOT_ELIGIBLE':
      return new ApiError(HttpStatus.FORBIDDEN, {
        code: error.code,
        message: 'This lead cannot be contacted.',
        fields: [...error.reasons],
      });
    case 'MESSAGE_GUARD_REJECTED':
      return new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, {
        code: error.code,
        message: 'The draft failed the contact guards.',
        fields: [...error.reasons],
      });
    case 'REVIEW_EXPIRED':
    case 'ALREADY_CONTACTED':
    case 'REVIEW_CLOSED':
      return new ApiError(HttpStatus.CONFLICT, {
        code: error.code,
        message: 'The contact review can no longer be changed.',
      });
    default:
      return new ApiError(HttpStatus.BAD_REQUEST, {
        code: error.code,
        message: 'The contact request could not be accepted.',
      });
  }
}
