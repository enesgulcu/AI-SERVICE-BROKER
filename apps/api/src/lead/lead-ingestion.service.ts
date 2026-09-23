import {
  createRequestFingerprint,
  idempotencyKeySchema,
  type IngestLeadRequestV1,
  type IngestLeadResponseV1,
} from '@ai-service-broker/contracts';
import {
  isSyntheticLeadSource,
  loadApiEnvironment,
} from '@ai-service-broker/config';
import { assessPersonalDataPilot } from '@ai-service-broker/safety';
import {
  IdempotencyConflictError,
  IngestLead,
  IngestLeadInputError,
  LeadInvariantError,
} from '@ai-service-broker/lead';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ApiError } from '../platform/http/api-error';

export interface IngestLeadHttpCommand {
  body: IngestLeadRequestV1;
  idempotencyKey: string | undefined;
  correlationId: string;
  pilotApprovalId?: string;
}

@Injectable()
export class LeadIngestionService {
  constructor(private readonly ingestLead: IngestLead) {}

  async ingest(command: IngestLeadHttpCommand): Promise<IngestLeadResponseV1> {
    const environment = loadApiEnvironment();
    const idempotencyKey = idempotencyKeySchema.safeParse(
      command.idempotencyKey,
    );
    if (!idempotencyKey.success) {
      throw new ApiError(HttpStatus.BAD_REQUEST, {
        code: 'INVALID_IDEMPOTENCY_KEY',
        message: 'A valid Idempotency-Key header is required.',
      });
    }

    const pilot = assessPersonalDataPilot({
      mode: environment.PERSONAL_DATA_MODE,
      synthetic: isSyntheticLeadSource(command.body.source),
      approvalId: command.pilotApprovalId,
      expectedApprovalId: environment.PILOT_APPROVAL_ID,
    });
    if (!pilot.ok) {
      throw new ApiError(HttpStatus.FORBIDDEN, {
        code: pilot.code,
        message:
          pilot.code === 'PILOT_APPROVAL_REQUIRED'
            ? 'A matching pilot approval is required.'
            : 'Only synthetic or test leads are accepted until personal-data processing is approved.',
      });
    }

    try {
      const result = await this.ingestLead.execute({
        idempotencyKey: idempotencyKey.data,
        requestFingerprint: createRequestFingerprint(command.body),
        correlationId: command.correlationId,
        source: command.body.source,
        sourceReference: command.body.sourceReference,
        phone: command.body.phone,
        customerName: command.body.customerName,
        city: command.body.city,
        district: command.body.district,
        listingTitle: command.body.listingTitle,
        listingText: command.body.listingText,
        publishedAt: command.body.publishedAt
          ? new Date(command.body.publishedAt)
          : undefined,
        rawPayload: command.body.rawData,
      });

      return {
        leadId: result.leadId,
        disposition: result.disposition,
      };
    } catch (error) {
      if (error instanceof IdempotencyConflictError) {
        throw new ApiError(HttpStatus.CONFLICT, {
          code: 'IDEMPOTENCY_KEY_REUSED',
          message:
            'The Idempotency-Key was already used with a different request.',
        });
      }
      if (
        error instanceof IngestLeadInputError ||
        error instanceof LeadInvariantError
      ) {
        throw new ApiError(HttpStatus.BAD_REQUEST, {
          code: error.code,
          message: 'The lead could not be accepted.',
        });
      }
      throw error;
    }
  }
}
