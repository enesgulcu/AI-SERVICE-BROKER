import {
  isSyntheticLeadSource,
  loadApiEnvironment,
} from '@ai-service-broker/config';
import {
  createRequestFingerprint,
  idempotencyKeySchema,
  type AutomationRunResponseV1,
} from '@ai-service-broker/contracts';
import {
  AUTOMATION_ACTOR,
  assessAutomation,
  CommercialConflictError,
  type CommercialStore,
} from '@ai-service-broker/safety';
import { HttpStatus, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  FirstContactService,
  mapFirstContactError,
} from '../contact/first-contact.service';
import { OperationsService } from '../operations/operations.service';
import { ApiError } from '../platform/http/api-error';

const REASONS = [
  'FIRST_CONTACT',
  'CUSTOMER_INTEREST',
  'REQUIREMENTS',
  'QUOTE',
  'FOLLOW_UP_PLANNED',
  'ACCEPTANCE',
  'MANUAL_REVIEW',
  'COMPLETE',
] as const;

@Injectable()
export class AutomationService {
  constructor(
    private readonly contact: FirstContactService,
    private readonly operations: OperationsService,
    private readonly commercial: CommercialStore,
  ) {}

  policy() {
    const environment = loadApiEnvironment();
    return {
      mode: environment.AUTOMATION_MODE,
      paused: environment.AUTOMATION_PAUSED,
      autoFirstContact: environment.AUTO_FIRST_CONTACT,
      actorId: AUTOMATION_ACTOR,
      channel: 'MOCK' as const,
      liveWhatsApp: false as const,
      bindingQuote: false as const,
      personalDataMode: environment.PERSONAL_DATA_MODE,
    };
  }

  async run(input: {
    leadId: string;
    idempotencyKey: string | undefined;
    correlationId: string;
  }): Promise<{ body: AutomationRunResponseV1; replayed: boolean }> {
    const key = this.key(input.idempotencyKey);
    const fingerprint = createRequestFingerprint({
      action: 'automation-run',
      leadId: input.leadId,
    });
    const prior = await this.commercial.findByKey('AUTOMATION', key);
    if (prior) {
      if (prior.fingerprint !== fingerprint || prior.leadId !== input.leadId) {
        throw conflict();
      }
      return { body: stored(prior.payload), replayed: true };
    }

    const environment = loadApiEnvironment();
    const lead = await this.operations.maskedLead(input.leadId);
    const conversations = await this.operations.conversationView(input.leadId);
    const held = conversations.conversations.find(
      (conversation) => conversation.controlMode !== 'AI_ACTIVE',
    );
    const decision = assessAutomation({
      mode: environment.AUTOMATION_MODE,
      paused: environment.AUTOMATION_PAUSED,
      controlMode: held?.controlMode ?? 'AI_ACTIVE',
      synthetic: isSyntheticLeadSource(lead.source),
      channel: 'MOCK',
    });
    if (!decision.ok) {
      throw stopped(decision.code);
    }

    const outcome = await this.step({
      leadId: lead.leadId,
      status: lead.status,
      version: lead.version,
      autoFirstContact: environment.AUTO_FIRST_CONTACT,
      idempotencyKey: key,
      correlationId: input.correlationId,
    });
    try {
      const saved = await this.commercial.save({
        id: randomUUID(),
        leadId: input.leadId,
        kind: 'AUTOMATION',
        idempotencyKey: key,
        fingerprint,
        payload: { ...outcome },
      });
      if (saved === 'DUPLICATE') {
        const again = await this.commercial.findByKey('AUTOMATION', key);
        if (!again || again.fingerprint !== fingerprint) {
          throw conflict();
        }
        return { body: stored(again.payload), replayed: true };
      }
    } catch (error) {
      if (error instanceof CommercialConflictError) {
        throw conflict();
      }
      throw error;
    }
    return { body: outcome, replayed: false };
  }

  private async step(input: {
    leadId: string;
    status: string;
    version: number;
    autoFirstContact: boolean;
    idempotencyKey: string;
    correlationId: string;
  }): Promise<AutomationRunResponseV1> {
    if (input.status === 'NEW' || input.status === 'CONTACT_PENDING') {
      if (!input.autoFirstContact) {
        throw stopped('AUTOMATION_STOPPED');
      }
      const prepared = await this.contactCall(() =>
        this.contact.prepare({
          leadId: input.leadId,
          body: { actorId: AUTOMATION_ACTOR },
          idempotencyKey: childKey(input.idempotencyKey, 'prepare'),
          correlationId: input.correlationId,
        }),
      );
      const decided = await this.contactCall(() =>
        this.contact.decide({
          reviewId: prepared.reviewId,
          body: { actorId: AUTOMATION_ACTOR, decision: 'APPROVE' },
          idempotencyKey: childKey(input.idempotencyKey, 'decide'),
          correlationId: input.correlationId,
        }),
      );
      const current = await this.operations.maskedLead(input.leadId);
      return outcome(current, {
        disposition: 'ADVANCED',
        reason: 'FIRST_CONTACT',
        stopped: false,
        created: decided.disposition === 'APPROVED',
      });
    }
    if (input.status === 'CONTACTED') {
      return outcome(input, {
        disposition: 'WAITING',
        reason: 'CUSTOMER_INTEREST',
        stopped: true,
        created: false,
      });
    }
    if (input.status === 'INTERESTED' || input.status === 'QUALIFYING') {
      return outcome(input, {
        disposition: 'WAITING',
        reason: 'REQUIREMENTS',
        stopped: true,
        created: false,
      });
    }
    if (input.status === 'QUOTE_READY') {
      return outcome(input, {
        disposition: 'WAITING',
        reason: 'QUOTE',
        stopped: true,
        created: false,
      });
    }
    if (input.status === 'QUALIFIED') {
      const quote = await this.operations.quote({
        body: {
          actorId: AUTOMATION_ACTOR,
          leadId: input.leadId,
          expectedVersion: input.version,
        },
        idempotencyKey: childKey(input.idempotencyKey, 'quote'),
        correlationId: input.correlationId,
      });
      return {
        disposition: 'ADVANCED',
        leadId: input.leadId,
        status: quote.status,
        version: quote.version,
        actorId: AUTOMATION_ACTOR,
        reason: 'QUOTE',
        stopped: false,
        created: quote.disposition === 'CREATED',
      };
    }
    if (input.status === 'QUOTE_SENT' || input.status === 'NEGOTIATING') {
      const followUp = await this.operations.followUp({
        body: { actorId: AUTOMATION_ACTOR, leadId: input.leadId },
        idempotencyKey: childKey(input.idempotencyKey, 'follow-up'),
        correlationId: input.correlationId,
      });
      return outcome(input, {
        disposition: 'WAITING',
        reason: 'FOLLOW_UP_PLANNED',
        stopped: true,
        created: followUp.disposition === 'CREATED',
      });
    }
    if (input.status === 'CUSTOMER_ACCEPTED') {
      const followUp = await this.operations.followUp({
        body: { actorId: AUTOMATION_ACTOR, leadId: input.leadId },
        idempotencyKey: childKey(input.idempotencyKey, 'follow-up'),
        correlationId: input.correlationId,
      });
      return outcome(input, {
        disposition: 'WAITING',
        reason: 'ACCEPTANCE',
        stopped: true,
        created: followUp.disposition === 'CREATED',
      });
    }
    if (input.status === 'JOB_READY') {
      return outcome(input, {
        disposition: 'COMPLETE',
        reason: 'COMPLETE',
        stopped: true,
        created: false,
      });
    }
    return outcome(input, {
      disposition: 'WAITING',
      reason: 'MANUAL_REVIEW',
      stopped: true,
      created: false,
    });
  }

  private async contactCall<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      mapFirstContactError(error);
    }
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

function outcome(
  lead: { leadId: string; status: string; version: number },
  step: {
    disposition: AutomationRunResponseV1['disposition'];
    reason: AutomationRunResponseV1['reason'];
    stopped: boolean;
    created: boolean;
  },
): AutomationRunResponseV1 {
  return {
    disposition: step.disposition,
    leadId: lead.leadId,
    status: lead.status,
    version: lead.version,
    actorId: AUTOMATION_ACTOR,
    reason: step.reason,
    stopped: step.stopped,
    created: step.created,
  };
}

function stored(
  payload: Record<string, string | number | boolean>,
): AutomationRunResponseV1 {
  const reason = payload.reason;
  if (
    (payload.disposition !== 'ADVANCED' &&
      payload.disposition !== 'WAITING' &&
      payload.disposition !== 'COMPLETE') ||
    typeof payload.leadId !== 'string' ||
    typeof payload.status !== 'string' ||
    typeof payload.version !== 'number' ||
    payload.actorId !== AUTOMATION_ACTOR ||
    typeof reason !== 'string' ||
    !REASONS.includes(reason as (typeof REASONS)[number]) ||
    typeof payload.stopped !== 'boolean' ||
    typeof payload.created !== 'boolean'
  ) {
    throw new ApiError(HttpStatus.CONFLICT, {
      code: 'IDEMPOTENCY_KEY_REUSED',
      message: 'The Idempotency-Key was already used with a different request.',
    });
  }
  return {
    disposition: payload.disposition,
    leadId: payload.leadId,
    status: payload.status,
    version: payload.version,
    actorId: AUTOMATION_ACTOR,
    reason: reason as AutomationRunResponseV1['reason'],
    stopped: payload.stopped,
    created: payload.created,
  };
}

function childKey(idempotencyKey: string, step: string): string {
  return createHash('sha256')
    .update(`${idempotencyKey}:${step}`)
    .digest('hex')
    .slice(0, 32);
}

function stopped(
  code: 'AUTOMATION_STOPPED' | 'REAL_DATA_INGESTION_BLOCKED' | 'UNSAFE_CHANNEL',
) {
  if (code === 'REAL_DATA_INGESTION_BLOCKED') {
    return new ApiError(HttpStatus.FORBIDDEN, {
      code,
      message: 'Only synthetic leads can be changed.',
    });
  }
  if (code === 'UNSAFE_CHANNEL') {
    return new ApiError(HttpStatus.CONFLICT, {
      code,
      message: 'Automation can use only the mock channel.',
    });
  }
  return new ApiError(HttpStatus.CONFLICT, {
    code: 'AUTOMATION_STOPPED',
    message: 'Automation is supervised, paused, or a human has control.',
  });
}

function conflict(): ApiError {
  return new ApiError(HttpStatus.CONFLICT, {
    code: 'IDEMPOTENCY_KEY_REUSED',
    message: 'The Idempotency-Key was already used with a different request.',
  });
}
