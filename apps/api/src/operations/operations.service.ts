import {
  loadApiEnvironment,
  isSyntheticLeadSource,
} from '@ai-service-broker/config';
import {
  createRequestFingerprint,
  idempotencyKeySchema,
} from '@ai-service-broker/contracts';
import type {
  ClosedActionRequestV1,
  ConfirmRequirementsRequestV1,
  ExtractRequirementsRequestV1,
  OutboundDeliveryRequestV1,
  RecordRiskRequestV1,
} from '@ai-service-broker/contracts';
import type { LeadDirectory, LeadSummary } from '@ai-service-broker/lead';
import { assessOutbound } from '@ai-service-broker/messaging';
import type { OutboxRedrive } from '@ai-service-broker/outbox';
import {
  RequirementConflictError,
  assessRequirements,
  fakeExtract,
  type RequirementStore,
  type RequirementSnapshot,
} from '@ai-service-broker/requirement';
import {
  calculatePrice,
  companyFact,
  concede,
  funnel,
  issueQuote,
  maskPhone,
  planFollowUp,
  recordRisk,
  type RiskStore,
} from '@ai-service-broker/safety';
import {
  AdvanceWorkflow,
  WorkflowFlowError,
} from '@ai-service-broker/workflow';
import { HttpStatus, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { ApiError } from '../platform/http/api-error';
import { mapWorkflowError } from '../workflow/workflow.service';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class OperationsService {
  constructor(
    private readonly directory: LeadDirectory,
    private readonly requirements: RequirementStore,
    private readonly risks: RiskStore,
    private readonly workflow: AdvanceWorkflow,
    private readonly redrivePort: OutboxRedrive,
  ) {}

  async confirm(input: {
    leadId: string;
    body: ConfirmRequirementsRequestV1;
    idempotencyKey: string | undefined;
    correlationId: string;
  }) {
    const key = this.key(input.idempotencyKey);
    const lead = await this.lead(input.leadId);
    const fingerprint = createRequestFingerprint({
      leadId: lead.id,
      actorId: input.body.actorId,
      expectedVersion: input.body.expectedVersion,
      fields: input.body.fields,
      specialRequirements: input.body.specialRequirements,
    });
    const existing = await this.requirements.findByKey(key);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw conflict('IDEMPOTENCY_KEY_REUSED');
      }
      const current = (await this.directory.findSummary(lead.id)) ?? lead;
      const moved = await this.finish(current, existing, key, input);
      return view(lead.id, existing.snapshot, moved, 'DUPLICATE');
    }
    if (lead.status !== 'INTERESTED' && lead.status !== 'QUALIFYING') {
      throw conflict('INVALID_TRANSITION');
    }
    if (lead.version !== input.body.expectedVersion) {
      throw conflict('VERSION_CONFLICT');
    }
    const assessed = assessRequirements({
      fields: input.body.fields,
      specialRequirements: input.body.specialRequirements,
    });
    if (!assessed.ok) {
      throw new ApiError(HttpStatus.BAD_REQUEST, {
        code: assessed.code,
        message: 'The requirement could not be recorded.',
      });
    }
    const stored = await this.requirements
      .save({
        id: randomUUID(),
        leadId: lead.id,
        idempotencyKey: key,
        fingerprint,
        actorId: input.body.actorId,
        correlationId: input.correlationId,
        occurredAt: new Date(),
        snapshot: assessed.snapshot,
      })
      .catch((error: unknown) => {
        if (error instanceof RequirementConflictError) {
          throw conflict(error.code);
        }
        throw error;
      });
    const moved = await this.finish(lead, stored, key, input);
    return view(lead.id, stored.snapshot, moved, 'RECORDED');
  }

  extract(body: ExtractRequirementsRequestV1) {
    return fakeExtract({ text: body.text, fields: body.fields });
  }

  async recordSignal(input: {
    leadId: string;
    body: RecordRiskRequestV1;
    idempotencyKey: string | undefined;
    correlationId: string;
  }) {
    const key = this.key(input.idempotencyKey);
    const lead = await this.lead(input.leadId);
    const recorded = recordRisk([], {
      code: input.body.code,
      severity: input.body.severity,
    });
    if (!recorded.ok || recorded.disposition !== 'REVIEW') {
      throw new ApiError(HttpStatus.BAD_REQUEST, {
        code: 'UNKNOWN_SIGNAL',
        message: 'The risk signal is not in the approved catalogue.',
      });
    }
    const fingerprint = createRequestFingerprint({
      leadId: lead.id,
      code: input.body.code,
      severity: input.body.severity,
    });
    const existing = await this.risks.findByKey(key);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw conflict('IDEMPOTENCY_KEY_REUSED');
      }
      return {
        leadId: lead.id,
        disposition: existing.disposition,
        recorded: 'DUPLICATE' as const,
        code: existing.signal.code,
        severity: existing.signal.severity,
      };
    }
    const saved = await this.risks.save({
      id: randomUUID(),
      leadId: lead.id,
      idempotencyKey: key,
      fingerprint,
      actorId: input.body.actorId,
      correlationId: input.correlationId,
      occurredAt: new Date(),
      signal: { code: input.body.code, severity: input.body.severity },
    });
    return {
      leadId: lead.id,
      disposition: saved.disposition,
      recorded: 'CREATED' as const,
      code: saved.signal.code,
      severity: saved.signal.severity,
    };
  }

  deliver(body: OutboundDeliveryRequestV1) {
    const decision = assessOutbound({
      channel: body.channel,
      origin: body.origin,
      controlMode: body.controlMode,
      automationPaused: loadApiEnvironment().AUTOMATION_PAUSED,
      templateApproved: body.templateApproved,
    });
    if (!decision.ok) {
      throw conflict(decision.code);
    }
    return { channel: decision.channel, disposition: decision.disposition };
  }

  quote(actorId: string): never {
    return this.closed(actorId, issueQuote(calculatePrice(null, 1)).code);
  }

  negotiate(actorId: string): never {
    return this.closed(actorId, concede().code);
  }

  followUp(actorId: string): never {
    return this.closed(actorId, planFollowUp().code);
  }

  facts() {
    throw conflict(companyFact().code);
  }

  async maskedLead(leadId: string) {
    const lead = await this.lead(leadId);
    return {
      leadId: lead.id,
      status: lead.status,
      version: lead.version,
      source: lead.source,
      phoneMask: maskPhone(lead.phone),
    };
  }

  async reviewQueue() {
    const reviews = await this.directory.listByStatus('MANUAL_REVIEW');
    return {
      reviews: reviews.map((review) => ({
        leadId: review.id,
        status: review.status,
        version: review.version,
        phoneMask: maskPhone(review.phone),
      })),
    };
  }

  async stages() {
    const counts = await this.directory.countByStatus();
    return {
      stages: funnel(
        Object.fromEntries(counts.map((item) => [item.status, item.count])),
      ),
    };
  }

  async redrive(input: {
    eventId: string;
    body: ClosedActionRequestV1;
    correlationId: string;
  }) {
    if (!UUID.test(input.eventId)) {
      throw new ApiError(HttpStatus.BAD_REQUEST, {
        code: 'INVALID_EVENT_ID',
        message: 'The outbox event id is not valid.',
      });
    }
    const result = await this.redrivePort.redrive({
      eventId: input.eventId,
      auditId: randomUUID(),
      actorId: input.body.actorId,
      correlationId: input.correlationId,
      occurredAt: new Date(),
    });
    if (!result.ok) {
      throw result.code === 'NOT_FOUND'
        ? new ApiError(HttpStatus.NOT_FOUND, {
            code: result.code,
            message: 'The outbox event was not found.',
          })
        : conflict(result.code);
    }
    return { eventId: input.eventId, disposition: result.disposition };
  }

  private closed(actorId: string, code: string): never {
    if (!/^[a-zA-Z0-9._:-]{8,128}$/.test(actorId)) {
      throw new ApiError(HttpStatus.BAD_REQUEST, {
        code: 'INVALID_REQUEST',
        message: 'The actor is not valid.',
      });
    }
    throw conflict(code);
  }

  private async finish(
    lead: LeadSummary,
    requirement: { id: string; snapshot: RequirementSnapshot },
    idempotencyKey: string,
    input: { body: ConfirmRequirementsRequestV1; correlationId: string },
  ) {
    let status = lead.status;
    let version = lead.version;
    if (status === 'INTERESTED') {
      const moved = await this.transition({
        leadId: lead.id,
        actorId: input.body.actorId,
        correlationId: input.correlationId,
        toStatus: 'QUALIFYING',
        expectedVersion: version,
        idempotencyKey: stepKey(idempotencyKey, 'qualify'),
        requirementId: requirement.id,
        requirementsReady: false,
      });
      status = moved.toStatus;
      version = moved.version;
    }
    if (requirement.snapshot.ready && status === 'QUALIFYING') {
      const moved = await this.transition({
        leadId: lead.id,
        actorId: input.body.actorId,
        correlationId: input.correlationId,
        toStatus: 'QUALIFIED',
        expectedVersion: version,
        idempotencyKey: stepKey(idempotencyKey, 'ready'),
        requirementId: requirement.id,
        requirementsReady: true,
      });
      status = moved.toStatus;
      version = moved.version;
    }
    return { status, version };
  }

  private async transition(input: {
    leadId: string;
    actorId: string;
    correlationId: string;
    toStatus: 'QUALIFYING' | 'QUALIFIED';
    expectedVersion: number;
    idempotencyKey: string;
    requirementId: string;
    requirementsReady: boolean;
  }) {
    try {
      return await this.workflow.execute(
        {
          leadId: input.leadId,
          actorId: input.actorId,
          toStatus: input.toStatus,
          reasonCode: null,
          expectedVersion: input.expectedVersion,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint: createRequestFingerprint({
            leadId: input.leadId,
            requirementId: input.requirementId,
            toStatus: input.toStatus,
          }),
          correlationId: input.correlationId,
        },
        { requirementsReady: input.requirementsReady },
      );
    } catch (error) {
      if (error instanceof WorkflowFlowError) {
        mapWorkflowError(error);
      }
      throw error;
    }
  }

  private async lead(leadId: string): Promise<LeadSummary> {
    if (!UUID.test(leadId)) {
      throw new ApiError(HttpStatus.BAD_REQUEST, {
        code: 'INVALID_LEAD_ID',
        message: 'The lead id is not valid.',
      });
    }
    const lead = await this.directory.findSummary(leadId);
    if (!lead) {
      throw new ApiError(HttpStatus.NOT_FOUND, {
        code: 'LEAD_NOT_FOUND',
        message: 'The requested lead was not found.',
      });
    }
    if (!isSyntheticLeadSource(lead.source)) {
      throw new ApiError(HttpStatus.FORBIDDEN, {
        code: 'REAL_DATA_INGESTION_BLOCKED',
        message: 'Only synthetic leads can be changed.',
      });
    }
    return lead;
  }

  private key(value: string | undefined): string {
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

function view(
  leadId: string,
  snapshot: RequirementSnapshot,
  moved: { status: string; version: number },
  disposition: 'RECORDED' | 'DUPLICATE',
) {
  return {
    leadId,
    disposition,
    requirementVersion: snapshot.version,
    schemaVersion: snapshot.schemaVersion,
    ready: snapshot.ready,
    missingFields: snapshot.missingFields,
    contradictions: snapshot.contradictions,
    workflowStatus: moved.status,
    workflowVersion: moved.version,
  };
}

function conflict(code: string): ApiError {
  return new ApiError(HttpStatus.CONFLICT, {
    code,
    message: 'The operation is not available.',
  });
}

function stepKey(idempotencyKey: string, step: string): string {
  return createHash('sha256')
    .update(`${idempotencyKey}:${step}`)
    .digest('hex')
    .slice(0, 32);
}
