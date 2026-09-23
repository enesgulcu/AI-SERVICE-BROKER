export type LeadStatus =
  | 'NEW'
  | 'CONTACT_PENDING'
  | 'CONTACTED'
  | 'INTERESTED'
  | 'QUALIFYING'
  | 'QUALIFIED'
  | 'NO_RESPONSE'
  | 'MANUAL_REVIEW'
  | 'CLOSED_LOST';

export const WORKFLOW_POLICY_VERSION = 'workflow-v1';

export type ClosedLostReason = 'WITHDRAWN' | 'NOT_INTERESTED' | 'DUPLICATE' | 'INVALID_CONTACT';

export type WorkflowGate =
  | 'ANALYSIS_NOT_AVAILABLE'
  | 'REQUIREMENTS_NOT_AVAILABLE'
  | 'PRICING_NOT_AVAILABLE'
  | 'ACCEPTANCE_NOT_AVAILABLE'
  | 'JOB_NOT_AVAILABLE'
  | 'POLICY_NOT_AVAILABLE';

export type WorkflowTarget =
  | LeadStatus
  | 'ANALYZED'
  | 'QUALIFYING'
  | 'QUALIFIED'
  | 'QUOTE_READY'
  | 'QUOTE_SENT'
  | 'NEGOTIATING'
  | 'CUSTOMER_ACCEPTED'
  | 'JOB_READY'
  | 'BLOCKED';

export type WorkflowMove =
  | {
      ok: true;
      status: LeadStatus;
      previousStatus: LeadStatus | null;
      resumeStatus: LeadStatus | null;
      reasonCode: ClosedLostReason | 'NONE';
    }
  | {
      ok: false;
      code: 'INVALID_TRANSITION' | 'USE_CONTACT_FLOW' | 'GATE_CLOSED' | 'INVALID_REASON';
      gate?: WorkflowGate;
    };

const GATES: Readonly<Record<string, WorkflowGate>> = {
  ANALYZED: 'ANALYSIS_NOT_AVAILABLE',
  QUOTE_READY: 'PRICING_NOT_AVAILABLE',
  QUOTE_SENT: 'PRICING_NOT_AVAILABLE',
  NEGOTIATING: 'PRICING_NOT_AVAILABLE',
  CUSTOMER_ACCEPTED: 'ACCEPTANCE_NOT_AVAILABLE',
  JOB_READY: 'JOB_NOT_AVAILABLE',
  BLOCKED: 'POLICY_NOT_AVAILABLE',
};

const CONTACT_FLOW = new Set([
  'NEW>CONTACT_PENDING',
  'CONTACT_PENDING>CONTACTED',
  'CONTACT_PENDING>NEW',
]);

const REASONS = new Set<ClosedLostReason>([
  'WITHDRAWN',
  'NOT_INTERESTED',
  'DUPLICATE',
  'INVALID_CONTACT',
]);

const ACTIVE = new Set<LeadStatus>([
  'NEW',
  'CONTACT_PENDING',
  'CONTACTED',
  'INTERESTED',
  'QUALIFYING',
  'QUALIFIED',
]);

export function decideWorkflowMove(input: {
  from: LeadStatus;
  to: WorkflowTarget;
  previousStatus: LeadStatus | null;
  resumeStatus: LeadStatus | null;
  reasonCode: ClosedLostReason | null;
  requirementsReady?: boolean;
}): WorkflowMove {
  const gate = GATES[input.to];
  if (gate) {
    return { ok: false, code: 'GATE_CLOSED', gate };
  }
  if (input.reasonCode && input.to !== 'CLOSED_LOST') {
    return { ok: false, code: 'INVALID_REASON' };
  }
  if (input.from === 'CLOSED_LOST') {
    return { ok: false, code: 'INVALID_TRANSITION' };
  }
  if (CONTACT_FLOW.has(`${input.from}>${input.to}`)) {
    return { ok: false, code: 'USE_CONTACT_FLOW' };
  }

  if (input.to === 'CLOSED_LOST') {
    if (!input.reasonCode || !REASONS.has(input.reasonCode)) {
      return { ok: false, code: 'INVALID_REASON' };
    }
    return {
      ok: true,
      status: 'CLOSED_LOST',
      previousStatus: input.from,
      resumeStatus: null,
      reasonCode: input.reasonCode,
    };
  }

  if (input.to === 'INTERESTED') {
    if (input.from !== 'CONTACTED') {
      return { ok: false, code: 'INVALID_TRANSITION' };
    }
    return {
      ok: true,
      status: 'INTERESTED',
      previousStatus: null,
      resumeStatus: null,
      reasonCode: 'NONE',
    };
  }

  if (input.to === 'NO_RESPONSE') {
    if (input.from !== 'CONTACTED') {
      return { ok: false, code: 'INVALID_TRANSITION' };
    }
    return {
      ok: true,
      status: 'NO_RESPONSE',
      previousStatus: 'CONTACTED',
      resumeStatus: 'CONTACTED',
      reasonCode: 'NONE',
    };
  }

  if (input.to === 'QUALIFYING') {
    if (input.from !== 'INTERESTED') {
      return { ok: false, code: 'INVALID_TRANSITION' };
    }
    return {
      ok: true,
      status: 'QUALIFYING',
      previousStatus: null,
      resumeStatus: null,
      reasonCode: 'NONE',
    };
  }

  if (input.to === 'QUALIFIED') {
    if (input.from !== 'QUALIFYING' || input.requirementsReady !== true) {
      return { ok: false, code: 'GATE_CLOSED', gate: 'REQUIREMENTS_NOT_AVAILABLE' };
    }
    return {
      ok: true,
      status: 'QUALIFIED',
      previousStatus: null,
      resumeStatus: null,
      reasonCode: 'NONE',
    };
  }

  if (input.to === 'MANUAL_REVIEW') {
    if (input.from === 'MANUAL_REVIEW') {
      return { ok: false, code: 'INVALID_TRANSITION' };
    }
    const resume = input.from === 'NO_RESPONSE' ? input.resumeStatus : input.from;
    if (!resume || !ACTIVE.has(resume)) {
      return { ok: false, code: 'INVALID_TRANSITION' };
    }
    return {
      ok: true,
      status: 'MANUAL_REVIEW',
      previousStatus: input.from,
      resumeStatus: resume,
      reasonCode: 'NONE',
    };
  }

  if (input.from === 'NO_RESPONSE' || input.from === 'MANUAL_REVIEW') {
    if (!input.resumeStatus || input.to !== input.resumeStatus || !ACTIVE.has(input.to)) {
      return { ok: false, code: 'INVALID_TRANSITION' };
    }
    return {
      ok: true,
      status: input.to,
      previousStatus: null,
      resumeStatus: null,
      reasonCode: 'NONE',
    };
  }

  return { ok: false, code: 'INVALID_TRANSITION' };
}
