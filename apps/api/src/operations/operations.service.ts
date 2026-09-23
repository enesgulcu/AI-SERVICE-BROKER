import {
  loadApiEnvironment,
  isSyntheticLeadSource,
} from '@ai-service-broker/config';
import {
  createRequestFingerprint,
  idempotencyKeySchema,
} from '@ai-service-broker/contracts';
import type {
  AcceptanceRequestV1,
  ClosedActionRequestV1,
  ConfirmRequirementsRequestV1,
  DeliveryCallbackRequestV1,
  ExtractRequirementsRequestV1,
  FollowUpRequestV1,
  NegotiationRequestV1,
  OutboundDeliveryRequestV1,
  ProviderDeliveryRequestV1,
  RecordRiskRequestV1,
  SandboxQuoteRequestV1,
} from '@ai-service-broker/contracts';
import type { InboundStore } from '@ai-service-broker/conversation';
import type { LeadDirectory, LeadSummary } from '@ai-service-broker/lead';
import {
  assessDeliveryCallback,
  assessOutbound,
  assessWhatsAppProvider,
  handoffPublishedEvent,
  type DeliveryCallbackStore,
} from '@ai-service-broker/messaging';
import type { OutboxRedrive } from '@ai-service-broker/outbox';
import {
  RequirementConflictError,
  assessRequirements,
  fakeExtract,
  type RequirementStore,
  type RequirementSnapshot,
} from '@ai-service-broker/requirement';
import {
  attestAcceptance,
  buildJobSnapshot,
  calculatePrice,
  CommercialConflictError,
  companyFact,
  concede,
  funnel,
  issueQuote,
  issueSandboxQuote,
  maskPhone,
  negotiateDiscount,
  operationalDashboard,
  planFollowUp,
  planSandboxFollowUp,
  recordRisk,
  SANDBOX_RATE_CARD,
  scheduledHours,
  type CommercialRecord,
  type CommercialStore,
  type RiskStore,
} from '@ai-service-broker/safety';
import {
  AdvanceWorkflow,
  WorkflowFlowError,
  type WorkflowStore,
} from '@ai-service-broker/workflow';
import type { WorkflowEvidence } from '@ai-service-broker/lead';
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
    private readonly callbacks: DeliveryCallbackStore,
    private readonly workflowStore: WorkflowStore,
    private readonly conversations: InboundStore,
    private readonly commercial: CommercialStore,
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
      templateVersion: body.templateVersion,
    });
    if (!decision.ok) {
      throw conflict(decision.code);
    }
    return { channel: decision.channel, disposition: decision.disposition };
  }

  async callback(body: DeliveryCallbackRequestV1) {
    const decision = assessDeliveryCallback(body);
    if (!decision.ok) {
      throw conflict(decision.code);
    }
    const saved = await this.callbacks.save({
      id: randomUUID(),
      providerEventId: body.providerEventId,
      templateVersion: body.templateVersion,
      status: decision.status,
    });
    if (!saved.ok) {
      throw conflict(saved.code);
    }
    return { disposition: saved.disposition, status: decision.status };
  }

  async quote(input: {
    body: SandboxQuoteRequestV1;
    idempotencyKey: string | undefined;
    correlationId: string;
  }) {
    if (!input.body.leadId) {
      return this.closed(
        input.body.actorId,
        issueQuote(calculatePrice(null, 1)).code,
      );
    }
    if (!input.body.expectedVersion) {
      throw new ApiError(HttpStatus.BAD_REQUEST, {
        code: 'INVALID_REQUEST',
        message: 'The quote request is incomplete.',
      });
    }
    const key = this.key(input.idempotencyKey);
    const lead = await this.lead(input.body.leadId);
    const fingerprint = createRequestFingerprint({
      action: 'sandbox-quote',
      actorId: input.body.actorId,
      expectedVersion: input.body.expectedVersion,
      leadId: lead.id,
    });
    const priorQuote = await this.commercial.findByKey('QUOTE', key);
    if (!priorQuote) {
      if (lead.status !== 'QUALIFIED') {
        throw conflict('INVALID_TRANSITION');
      }
      if (lead.version !== input.body.expectedVersion) {
        throw conflict('VERSION_CONFLICT');
      }
    }
    const existing = await this.remember('QUOTE', key, fingerprint, () =>
      this.buildQuote(lead.id, key, fingerprint),
    );
    const current = await this.advanceCommercial(lead, {
      actorId: input.body.actorId,
      correlationId: input.correlationId,
      idempotencyKey: key,
      steps: [
        {
          from: 'QUALIFIED',
          to: 'QUOTE_READY',
          evidence: { quoteReady: true },
        },
        {
          from: 'QUOTE_READY',
          to: 'QUOTE_SENT',
          evidence: { quoteSent: true },
        },
      ],
    });
    return {
      disposition: existing.disposition,
      leadId: lead.id,
      quoteId: existing.record.id,
      status: current.status,
      version: current.version,
      totalMinor: existing.record.payload.totalMinor,
      currency: 'TRY' as const,
      binding: false as const,
      authority: 'SANDBOX' as const,
      tariff: false as const,
      cardVersion: SANDBOX_RATE_CARD.version,
      contract: false as const,
    };
  }

  async negotiate(input: {
    body: NegotiationRequestV1;
    idempotencyKey: string | undefined;
    correlationId: string;
  }) {
    if (!input.body.leadId) {
      return this.closed(input.body.actorId, concede().code);
    }
    const decision = negotiateDiscount(input.body.discountBps ?? -1);
    if (!decision.ok) {
      throw conflict(decision.code);
    }
    if (!input.body.expectedVersion) {
      throw new ApiError(HttpStatus.BAD_REQUEST, {
        code: 'INVALID_REQUEST',
        message: 'The negotiation request is incomplete.',
      });
    }
    const key = this.key(input.idempotencyKey);
    const lead = await this.lead(input.body.leadId);
    const fingerprint = createRequestFingerprint({
      action: 'sandbox-negotiation',
      actorId: input.body.actorId,
      discountBps: 0,
      expectedVersion: input.body.expectedVersion,
      leadId: lead.id,
    });
    const priorNegotiation = await this.commercial.findByKey(
      'NEGOTIATION',
      key,
    );
    if (!priorNegotiation) {
      if (lead.status !== 'QUOTE_SENT') {
        throw conflict('INVALID_TRANSITION');
      }
      if (lead.version !== input.body.expectedVersion) {
        throw conflict('VERSION_CONFLICT');
      }
    }
    const existing = await this.remember(
      'NEGOTIATION',
      key,
      fingerprint,
      () => ({
        id: randomUUID(),
        leadId: lead.id,
        kind: 'NEGOTIATION' as const,
        idempotencyKey: key,
        fingerprint,
        payload: { discountBps: 0, authority: 'SANDBOX', maxDiscountBps: 0 },
      }),
    );
    const current = await this.advanceCommercial(lead, {
      actorId: input.body.actorId,
      correlationId: input.correlationId,
      idempotencyKey: key,
      steps: [
        {
          from: 'QUOTE_SENT',
          to: 'NEGOTIATING',
          evidence: { negotiating: true },
        },
      ],
    });
    return {
      disposition: existing.disposition,
      leadId: lead.id,
      status: current.status,
      version: current.version,
      discountBps: 0,
      maxDiscountBps: 0,
      authority: 'SANDBOX' as const,
    };
  }

  async followUp(input: {
    body: FollowUpRequestV1;
    idempotencyKey: string | undefined;
    correlationId: string;
  }) {
    if (!input.body.leadId) {
      return this.closed(input.body.actorId, planFollowUp().code);
    }
    const planned = planSandboxFollowUp({ channel: 'MOCK', automatic: false });
    if (!planned.ok) {
      throw conflict(planned.code);
    }
    const key = this.key(input.idempotencyKey);
    const lead = await this.lead(input.body.leadId);
    const allowed = new Set([
      'QUOTE_SENT',
      'NEGOTIATING',
      'CUSTOMER_ACCEPTED',
      'JOB_READY',
    ]);
    if (!allowed.has(lead.status)) {
      throw conflict('FOLLOW_UP_NOT_APPROVED');
    }
    const fingerprint = createRequestFingerprint({
      action: 'sandbox-follow-up',
      actorId: input.body.actorId,
      leadId: lead.id,
    });
    const existing = await this.remember('FOLLOW_UP', key, fingerprint, () => ({
      id: randomUUID(),
      leadId: lead.id,
      kind: 'FOLLOW_UP' as const,
      idempotencyKey: key,
      fingerprint,
      payload: {
        policyVersion: planned.policyVersion,
        channel: 'MOCK',
        automatic: false,
        sent: false,
        correlationId: input.correlationId,
      },
    }));
    return {
      disposition: existing.disposition,
      leadId: lead.id,
      policyVersion: planned.policyVersion,
      channel: 'MOCK' as const,
      automatic: false as const,
      sent: false as const,
    };
  }

  async accept(input: {
    leadId: string;
    body: AcceptanceRequestV1;
    idempotencyKey: string | undefined;
    correlationId: string;
  }) {
    const attested = attestAcceptance();
    const key = this.key(input.idempotencyKey);
    const lead = await this.lead(input.leadId);
    const quotes = await this.commercial.listForLead(lead.id, 'QUOTE');
    const quote = quotes[0];
    const requirement = await this.requirements.latestForLead(lead.id);
    const snapshot = buildJobSnapshot({
      requirementVersion: requirement?.snapshot.version ?? 0,
      quoteVersion: Number(quote?.payload.version ?? 0),
      totalMinor: Number(quote?.payload.totalMinor ?? 0),
    });
    if (!snapshot.ok) {
      throw conflict(snapshot.code);
    }
    const fingerprint = createRequestFingerprint({
      action: 'sandbox-acceptance',
      actorId: input.body.actorId,
      expectedVersion: input.body.expectedVersion,
      leadId: lead.id,
    });
    const priorJob = await this.commercial.findByKey('JOB', key);
    if (!priorJob) {
      const open =
        lead.status === 'QUOTE_SENT' || lead.status === 'NEGOTIATING';
      if (!open) {
        throw conflict('ACCEPTANCE_NOT_AVAILABLE');
      }
      if (lead.version !== input.body.expectedVersion) {
        throw conflict('VERSION_CONFLICT');
      }
    }
    const existing = await this.remember('JOB', key, fingerprint, () => ({
      id: randomUUID(),
      leadId: lead.id,
      kind: 'JOB' as const,
      idempotencyKey: key,
      fingerprint,
      payload: {
        contract: false,
        authority: 'SANDBOX',
        requirementVersion: snapshot.requirementVersion,
        quoteVersion: snapshot.quoteVersion,
        totalMinor: snapshot.totalMinor,
        currency: 'TRY',
        binding: false,
      },
    }));
    const current = await this.advanceCommercial(lead, {
      actorId: input.body.actorId,
      correlationId: input.correlationId,
      idempotencyKey: key,
      steps: [
        {
          from: lead.status === 'NEGOTIATING' ? 'NEGOTIATING' : 'QUOTE_SENT',
          to: 'CUSTOMER_ACCEPTED',
          evidence: { acceptanceReady: true },
        },
        {
          from: 'CUSTOMER_ACCEPTED',
          to: 'JOB_READY',
          evidence: { jobReady: true },
        },
      ],
    });
    return {
      disposition: existing.disposition,
      leadId: lead.id,
      jobId: existing.record.id,
      status: current.status,
      version: current.version,
      contract: attested.contract,
      authority: 'SANDBOX' as const,
      requirementVersion: snapshot.requirementVersion,
      quoteVersion: snapshot.quoteVersion,
    };
  }

  async providerDelivery(input: {
    body: ProviderDeliveryRequestV1;
    idempotencyKey: string | undefined;
  }) {
    const key = this.key(input.idempotencyKey);
    if (input.body.channel === 'WHATSAPP') {
      const decision = assessWhatsAppProvider({
        mode: input.body.mode,
        templateVersion: input.body.templateVersion,
      });
      if (!decision.ok) {
        throw conflict(decision.code);
      }
      const fingerprint = createRequestFingerprint({
        channel: 'WHATSAPP',
        mode: input.body.mode,
        templateVersion: decision.templateVersion,
      });
      const saved = await this.remember(
        'PROVIDER_DELIVERY',
        key,
        fingerprint,
        () => ({
          id: randomUUID(),
          leadId: null,
          kind: 'PROVIDER_DELIVERY' as const,
          idempotencyKey: key,
          fingerprint,
          payload: {
            provider: decision.provider,
            network: false,
            templateVersion: decision.templateVersion,
          },
        }),
      );
      return {
        disposition: saved.disposition,
        provider: 'WHATSAPP_SANDBOX' as const,
        network: false as const,
        templateVersion: decision.templateVersion,
      };
    }
    const handed = handoffPublishedEvent('ProviderDeliveryRequested', 'MOCK');
    if (!('provider' in handed)) {
      throw conflict(handed.code);
    }
    return {
      disposition: 'CREATED' as const,
      provider: handed.provider,
      network: false as const,
    };
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

  async requirementView(leadId: string) {
    const lead = await this.lead(leadId);
    const latest = await this.requirements.latestForLead(lead.id);
    if (!latest) {
      return { leadId: lead.id, requirement: null };
    }
    return {
      leadId: lead.id,
      requirement: {
        version: latest.snapshot.version,
        schemaVersion: latest.snapshot.schemaVersion,
        ready: latest.snapshot.ready,
        missingCount: latest.snapshot.missingFields.length,
        contradictionCount: latest.snapshot.contradictions.length,
        evidenceCount: latest.snapshot.evidenceCount,
        specialRequirements: latest.snapshot.specialRequirements,
      },
    };
  }

  async conversationView(leadId: string) {
    const lead = await this.lead(leadId);
    return {
      leadId: lead.id,
      conversations: await this.conversations.summariesForLead(lead.id),
    };
  }

  async quoteView(leadId: string) {
    const lead = await this.lead(leadId);
    const quotes = await this.commercial.listForLead(lead.id, 'QUOTE');
    return {
      leadId: lead.id,
      quotes: quotes.map((quote) => ({
        quoteId: quote.id,
        totalMinor: quote.payload.totalMinor,
        currency: 'TRY' as const,
        binding: false as const,
        authority: 'SANDBOX' as const,
        tariff: false as const,
        cardVersion: SANDBOX_RATE_CARD.version,
        contract: false as const,
      })),
    };
  }

  async auditView(leadId: string) {
    const lead = await this.lead(leadId);
    const entries = await this.workflowStore.auditsForLead(lead.id);
    return {
      leadId: lead.id,
      entries: entries.map((entry) => ({
        action: entry.action,
        reasonCode: entry.reasonCode,
        occurredAt: entry.occurredAt.toISOString(),
      })),
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

  async summary() {
    const counts = await this.directory.countByStatus();
    const reviews = await this.directory.listByStatus('MANUAL_REVIEW');
    return operationalDashboard({
      statusCounts: Object.fromEntries(
        counts.map((item) => [item.status, item.count]),
      ),
      manualReviewCount: reviews.length,
      riskReviewCount: await this.risks.count(),
    });
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

  private async buildQuote(
    leadId: string,
    idempotencyKey: string,
    fingerprint: string,
  ) {
    const latest = await this.requirements.latestForLead(leadId);
    const hours = scheduledHours(
      latest?.snapshot.confirmed.working_hours ?? '',
    );
    const issued = issueSandboxQuote(
      calculatePrice(hours === null ? null : SANDBOX_RATE_CARD, hours ?? 0),
    );
    if (!issued.ok) {
      throw conflict(issued.code);
    }
    return {
      id: randomUUID(),
      leadId,
      kind: 'QUOTE' as const,
      idempotencyKey,
      fingerprint,
      payload: {
        version: 1,
        totalMinor: issued.totalMinor,
        currency: issued.currency,
        binding: false as const,
        authority: 'SANDBOX',
        tariff: false as const,
        cardVersion: issued.cardVersion,
        contract: false as const,
      },
    };
  }

  private async remember(
    kind: 'QUOTE' | 'NEGOTIATION' | 'FOLLOW_UP' | 'JOB' | 'PROVIDER_DELIVERY',
    idempotencyKey: string,
    fingerprint: string,
    create: () => Promise<CommercialRecord> | CommercialRecord,
  ) {
    const existing = await this.commercial.findByKey(kind, idempotencyKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw conflict('IDEMPOTENCY_KEY_REUSED');
      }
      return { disposition: 'DUPLICATE' as const, record: existing };
    }
    const record = await create();
    try {
      const disposition = await this.commercial.save(record);
      return { disposition, record };
    } catch (error) {
      if (error instanceof CommercialConflictError) {
        throw conflict(error.code);
      }
      throw error;
    }
  }

  private async advanceCommercial(
    lead: LeadSummary,
    input: {
      actorId: string;
      correlationId: string;
      idempotencyKey: string;
      steps: Array<{
        from: LeadSummary['status'];
        to:
          | 'QUOTE_READY'
          | 'QUOTE_SENT'
          | 'NEGOTIATING'
          | 'CUSTOMER_ACCEPTED'
          | 'JOB_READY';
        evidence: WorkflowEvidence;
      }>;
    },
  ) {
    let current = (await this.directory.findSummary(lead.id)) ?? lead;
    for (const [index, step] of input.steps.entries()) {
      if (current.status !== step.from) {
        continue;
      }
      const moved = await this.workflow
        .execute(
          {
            leadId: current.id,
            actorId: input.actorId,
            toStatus: step.to,
            reasonCode: null,
            expectedVersion: current.version,
            idempotencyKey: stepKey(
              input.idempotencyKey,
              `${step.to}:${index}`,
            ),
            requestFingerprint: createRequestFingerprint({
              leadId: current.id,
              toStatus: step.to,
              version: current.version,
            }),
            correlationId: input.correlationId,
          },
          step.evidence,
        )
        .catch((error: unknown) => {
          if (error instanceof WorkflowFlowError) {
            mapWorkflowError(error);
          }
          throw error;
        });
      current = {
        ...current,
        status: moved.toStatus,
        version: moved.version,
      };
    }
    return current;
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
