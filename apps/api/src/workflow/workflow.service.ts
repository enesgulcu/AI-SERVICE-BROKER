import {
  createRequestFingerprint,
  idempotencyKeySchema,
} from '@ai-service-broker/contracts';
import type {
  AdvanceWorkflowRequestV1,
  AdvanceWorkflowResponseV1,
} from '@ai-service-broker/contracts';
import {
  AdvanceWorkflow,
  WorkflowFlowError,
} from '@ai-service-broker/workflow';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ApiError } from '../platform/http/api-error';

@Injectable()
export class WorkflowService {
  constructor(private readonly advanceWorkflow: AdvanceWorkflow) {}

  async advance(input: {
    leadId: string;
    body: AdvanceWorkflowRequestV1;
    idempotencyKey: string | undefined;
    correlationId: string;
  }): Promise<AdvanceWorkflowResponseV1> {
    const parsedKey = idempotencyKeySchema.safeParse(input.idempotencyKey);
    if (!parsedKey.success) {
      throw new ApiError(HttpStatus.BAD_REQUEST, {
        code: 'INVALID_IDEMPOTENCY_KEY',
        message: 'A valid Idempotency-Key header is required.',
      });
    }

    return this.advanceWorkflow.execute({
      leadId: input.leadId,
      actorId: input.body.actorId,
      toStatus: input.body.toStatus,
      reasonCode: input.body.reasonCode ?? null,
      expectedVersion: input.body.expectedVersion,
      idempotencyKey: parsedKey.data,
      requestFingerprint: createRequestFingerprint({
        leadId: input.leadId,
        actorId: input.body.actorId,
        toStatus: input.body.toStatus,
        expectedVersion: input.body.expectedVersion,
        reasonCode: input.body.reasonCode ?? null,
      }),
      correlationId: input.correlationId,
    });
  }
}

export function mapWorkflowError(error: unknown): never {
  if (error instanceof WorkflowFlowError) {
    throw workflowError(error);
  }
  throw error;
}

function workflowError(error: WorkflowFlowError): ApiError {
  switch (error.code) {
    case 'LEAD_NOT_FOUND':
      return new ApiError(HttpStatus.NOT_FOUND, {
        code: error.code,
        message: 'The requested lead was not found.',
      });
    case 'WORKFLOW_NOT_ELIGIBLE':
      return new ApiError(HttpStatus.FORBIDDEN, {
        code: error.code,
        message: 'This lead cannot change workflow state.',
      });
    case 'GATE_CLOSED':
      return new ApiError(HttpStatus.CONFLICT, {
        code: error.gate ?? error.code,
        message: 'This workflow transition is not available yet.',
      });
    case 'USE_CONTACT_FLOW':
      return new ApiError(HttpStatus.CONFLICT, {
        code: error.code,
        message: 'First contact has its own approval flow.',
      });
    case 'INVALID_TRANSITION':
    case 'VERSION_CONFLICT':
    case 'IDEMPOTENCY_KEY_REUSED':
      return new ApiError(HttpStatus.CONFLICT, {
        code: error.code,
        message: 'The workflow transition conflicts with the current lead.',
      });
    default:
      return new ApiError(HttpStatus.BAD_REQUEST, {
        code: error.code,
        message: 'The workflow request could not be accepted.',
      });
  }
}
