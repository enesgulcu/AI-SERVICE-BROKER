import {
  Lead,
  decideWorkflowMove,
  WORKFLOW_POLICY_VERSION,
  type ClosedLostReason,
  type LeadSnapshot,
  type LeadStatus,
  type WorkflowTarget,
} from '@ai-service-broker/lead';

export interface AdvanceWorkflowCommand {
  leadId: string;
  actorId: string;
  toStatus: WorkflowTarget;
  reasonCode: ClosedLostReason | null;
  expectedVersion: number;
  idempotencyKey: string;
  requestFingerprint: string;
  correlationId: string;
}

export interface AdvanceWorkflowResult {
  disposition: 'CHANGED' | 'DUPLICATE';
  leadId: string;
  fromStatus: LeadStatus;
  toStatus: LeadStatus;
  version: number;
  policyVersion: typeof WORKFLOW_POLICY_VERSION;
  reasonCode: ClosedLostReason | 'NONE';
}

export interface WorkflowWrite {
  eventId: string;
  auditId: string;
  leadId: string;
  actorId: string;
  toStatus: WorkflowTarget;
  reasonCode: ClosedLostReason | null;
  expectedVersion: number;
  idempotencyKey: string;
  requestFingerprint: string;
  correlationId: string;
  occurredAt: Date;
  requirementsReady: boolean;
}

export interface WorkflowEvent {
  eventId: string;
  eventType: 'WorkflowTransitioned';
  eventVersion: 1;
  aggregateId: string;
  occurredAt: Date;
  correlationId: string;
  payload: {
    leadId: string;
    fromStatus: LeadStatus;
    toStatus: LeadStatus;
    policyVersion: typeof WORKFLOW_POLICY_VERSION;
    reasonCode: ClosedLostReason | 'NONE';
  };
}

export interface WorkflowAudit {
  id: string;
  actorId: string;
  action: 'WORKFLOW_TRANSITIONED';
  entityId: string;
  reasonCode: string;
  correlationId: string;
  occurredAt: Date;
}

export type WorkflowCommit =
  | {
      disposition: 'CHANGED' | 'DUPLICATE';
      fromStatus: LeadStatus;
      toStatus: LeadStatus;
      version: number;
      reasonCode: ClosedLostReason | 'NONE';
    }
  | { disposition: 'NOT_FOUND' }
  | { disposition: 'NOT_ELIGIBLE' }
  | { disposition: 'VERSION_CONFLICT' }
  | { disposition: 'IDEMPOTENCY_CONFLICT' }
  | {
      disposition: 'REJECTED';
      code: 'INVALID_TRANSITION' | 'USE_CONTACT_FLOW' | 'GATE_CLOSED' | 'INVALID_REASON';
      gate?: string;
    };

export interface WorkflowStore {
  findLead(id: string): Promise<LeadSnapshot | null>;
  commit(write: WorkflowWrite): Promise<WorkflowCommit>;
}

export class WorkflowFlowError extends Error {
  constructor(
    readonly code:
      | 'INVALID_REQUEST'
      | 'LEAD_NOT_FOUND'
      | 'WORKFLOW_NOT_ELIGIBLE'
      | 'INVALID_TRANSITION'
      | 'USE_CONTACT_FLOW'
      | 'GATE_CLOSED'
      | 'INVALID_REASON'
      | 'VERSION_CONFLICT'
      | 'IDEMPOTENCY_KEY_REUSED',
    readonly gate?: string,
  ) {
    super(code);
    this.name = WorkflowFlowError.name;
  }
}

const SAFE_ID = /^[a-zA-Z0-9._:-]{8,128}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SYNTHETIC = new Set(['SYNTHETIC', 'TEST']);

interface Clock {
  now(): Date;
}

interface IdSource {
  next(): string;
}

export class AdvanceWorkflow {
  constructor(
    private readonly store: WorkflowStore,
    private readonly clock: Clock,
    private readonly ids: IdSource,
  ) {}

  async execute(
    command: AdvanceWorkflowCommand,
    options?: { requirementsReady?: boolean },
  ): Promise<AdvanceWorkflowResult> {
    if (
      !UUID.test(command.leadId) ||
      !SAFE_ID.test(command.actorId) ||
      !SAFE_ID.test(command.idempotencyKey) ||
      !SAFE_ID.test(command.correlationId) ||
      !SHA256.test(command.requestFingerprint) ||
      !Number.isInteger(command.expectedVersion) ||
      command.expectedVersion < 1
    ) {
      throw new WorkflowFlowError('INVALID_REQUEST');
    }

    const committed = await this.store.commit({
      eventId: this.ids.next(),
      auditId: this.ids.next(),
      leadId: command.leadId,
      actorId: command.actorId,
      toStatus: command.toStatus,
      reasonCode: command.reasonCode,
      expectedVersion: command.expectedVersion,
      idempotencyKey: command.idempotencyKey,
      requestFingerprint: command.requestFingerprint,
      correlationId: command.correlationId,
      occurredAt: this.clock.now(),
      requirementsReady: options?.requirementsReady === true,
    });

    if (committed.disposition === 'NOT_FOUND') {
      throw new WorkflowFlowError('LEAD_NOT_FOUND');
    }
    if (committed.disposition === 'NOT_ELIGIBLE') {
      throw new WorkflowFlowError('WORKFLOW_NOT_ELIGIBLE');
    }
    if (committed.disposition === 'VERSION_CONFLICT') {
      throw new WorkflowFlowError('VERSION_CONFLICT');
    }
    if (committed.disposition === 'IDEMPOTENCY_CONFLICT') {
      throw new WorkflowFlowError('IDEMPOTENCY_KEY_REUSED');
    }
    if (committed.disposition === 'REJECTED') {
      throw new WorkflowFlowError(committed.code, committed.gate);
    }

    return {
      disposition: committed.disposition,
      leadId: command.leadId,
      fromStatus: committed.fromStatus,
      toStatus: committed.toStatus,
      version: committed.version,
      policyVersion: WORKFLOW_POLICY_VERSION,
      reasonCode: committed.reasonCode,
    };
  }
}

export function workflowEvent(lead: LeadSnapshot, write: WorkflowWrite): WorkflowEvent {
  const moved = Lead.rehydrate(lead)
    .applyWorkflowMove(write.toStatus, write.reasonCode, write.requirementsReady)
    .snapshot();
  return {
    eventId: write.eventId,
    eventType: 'WorkflowTransitioned',
    eventVersion: 1,
    aggregateId: lead.id,
    occurredAt: write.occurredAt,
    correlationId: write.correlationId,
    payload: {
      leadId: lead.id,
      fromStatus: lead.status,
      toStatus: moved.status,
      policyVersion: WORKFLOW_POLICY_VERSION,
      reasonCode: decideReason(lead, write),
    },
  };
}

export function workflowAudit(lead: LeadSnapshot, write: WorkflowWrite): WorkflowAudit {
  return {
    id: write.auditId,
    actorId: write.actorId,
    action: 'WORKFLOW_TRANSITIONED',
    entityId: lead.id,
    reasonCode: decideReason(lead, write),
    correlationId: write.correlationId,
    occurredAt: write.occurredAt,
  };
}

export function decideReason(lead: LeadSnapshot, write: WorkflowWrite): ClosedLostReason | 'NONE' {
  const decision = decideWorkflowMove({
    from: lead.status,
    to: write.toStatus,
    previousStatus: lead.previousStatus ?? null,
    resumeStatus: lead.resumeStatus ?? null,
    reasonCode: write.reasonCode,
    requirementsReady: write.requirementsReady,
  });
  return decision.ok ? decision.reasonCode : 'NONE';
}

export function isWorkflowSource(source: string): boolean {
  return SYNTHETIC.has(source.trim().toUpperCase());
}
