export type LeadStatus =
  | 'NEW'
  | 'CONTACT_PENDING'
  | 'CONTACTED'
  | 'INTERESTED'
  | 'QUALIFYING'
  | 'QUALIFIED'
  | 'QUOTE_READY'
  | 'QUOTE_SENT'
  | 'NEGOTIATING'
  | 'CUSTOMER_ACCEPTED'
  | 'JOB_READY'
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

export interface WorkflowEvidence {
  requirementsReady?: boolean;
  quoteReady?: boolean;
  quoteSent?: boolean;
  negotiating?: boolean;
  acceptanceReady?: boolean;
  jobReady?: boolean;
}

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
  'QUOTE_READY',
  'QUOTE_SENT',
  'NEGOTIATING',
  'CUSTOMER_ACCEPTED',
  'JOB_READY',
]);

export function decideWorkflowMove(input: {
  from: LeadStatus;
  to: WorkflowTarget;
  previousStatus: LeadStatus | null;
  resumeStatus: LeadStatus | null;
  reasonCode: ClosedLostReason | null;
  requirementsReady?: boolean;
  quoteReady?: boolean;
  quoteSent?: boolean;
  negotiating?: boolean;
  acceptanceReady?: boolean;
  jobReady?: boolean;
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
    return accepted('QUALIFIED');
  }

  if (input.to === 'QUOTE_READY') {
    if (input.from === 'QUALIFIED' && input.quoteReady === true) {
      return accepted('QUOTE_READY');
    }
    return { ok: false, code: 'GATE_CLOSED', gate: 'PRICING_NOT_AVAILABLE' };
  }

  if (input.to === 'QUOTE_SENT') {
    if (input.from === 'QUOTE_READY' && input.quoteSent === true) {
      return accepted('QUOTE_SENT');
    }
    return { ok: false, code: 'GATE_CLOSED', gate: 'PRICING_NOT_AVAILABLE' };
  }

  if (input.to === 'NEGOTIATING') {
    if (input.from === 'QUOTE_SENT' && input.negotiating === true) {
      return accepted('NEGOTIATING');
    }
    return { ok: false, code: 'GATE_CLOSED', gate: 'PRICING_NOT_AVAILABLE' };
  }

  if (input.to === 'CUSTOMER_ACCEPTED') {
    if (
      (input.from === 'QUOTE_SENT' || input.from === 'NEGOTIATING') &&
      input.acceptanceReady === true
    ) {
      return accepted('CUSTOMER_ACCEPTED');
    }
    return { ok: false, code: 'GATE_CLOSED', gate: 'ACCEPTANCE_NOT_AVAILABLE' };
  }

  if (input.to === 'JOB_READY') {
    if (input.from === 'CUSTOMER_ACCEPTED' && input.jobReady === true) {
      return accepted('JOB_READY');
    }
    return { ok: false, code: 'GATE_CLOSED', gate: 'JOB_NOT_AVAILABLE' };
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

function accepted(status: LeadStatus): WorkflowMove {
  return {
    ok: true,
    status,
    previousStatus: null,
    resumeStatus: null,
    reasonCode: 'NONE',
  };
}
