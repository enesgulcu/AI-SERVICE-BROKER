import type { ControlMode } from './accept-inbound';

export interface SetConversationControlCommand {
  conversationId: string;
  actorId: string;
  controlMode: ControlMode;
  expectedVersion: number;
  idempotencyKey: string;
  requestFingerprint: string;
  correlationId: string;
  automationPaused: boolean;
}

export interface SetConversationControlResult {
  disposition: 'CHANGED' | 'DUPLICATE' | 'UNCHANGED';
  conversationId: string;
  controlMode: ControlMode;
  version: number;
  automatedReplyAllowed: boolean;
}

export interface ControlWrite {
  changeId: string;
  eventId: string;
  auditId: string;
  conversationId: string;
  actorId: string;
  controlMode: ControlMode;
  expectedVersion: number;
  idempotencyKey: string;
  requestFingerprint: string;
  correlationId: string;
  blockAiActive: boolean;
  occurredAt: Date;
}

export interface ControlEvent {
  eventId: string;
  eventType: 'ConversationControlChanged';
  eventVersion: 1;
  aggregateId: string;
  occurredAt: Date;
  correlationId: string;
  payload: {
    conversationId: string;
    controlMode: ControlMode;
    version: number;
  };
}

export interface ControlAudit {
  id: string;
  actorId: string;
  action: 'CONVERSATION_CONTROL_CHANGED';
  entityId: string;
  reasonCode: ControlMode;
  correlationId: string;
  occurredAt: Date;
}

export type ControlCommit =
  | {
      disposition: 'CHANGED' | 'DUPLICATE' | 'UNCHANGED';
      controlMode: ControlMode;
      version: number;
    }
  | { disposition: 'NOT_FOUND' }
  | { disposition: 'VERSION_CONFLICT' }
  | { disposition: 'KILL_SWITCH' }
  | { disposition: 'IDEMPOTENCY_CONFLICT' };

export interface ConversationControlStore {
  commitControl(write: ControlWrite): Promise<ControlCommit>;
}

export class ConversationControlError extends Error {
  constructor(
    readonly code:
      | 'INVALID_REQUEST'
      | 'CONVERSATION_NOT_FOUND'
      | 'VERSION_CONFLICT'
      | 'KILL_SWITCH_ACTIVE'
      | 'IDEMPOTENCY_KEY_REUSED',
  ) {
    super(code);
    this.name = ConversationControlError.name;
  }
}

const SAFE_ID = /^[a-zA-Z0-9._:-]{8,128}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MODES = new Set<ControlMode>(['AI_ACTIVE', 'HUMAN_CONTROL', 'PAUSED']);

interface Clock {
  now(): Date;
}

interface IdSource {
  next(): string;
}

export function allowsAutomatedReply(controlMode: ControlMode, automationPaused: boolean): boolean {
  return controlMode === 'AI_ACTIVE' && !automationPaused;
}

export class SetConversationControl {
  constructor(
    private readonly store: ConversationControlStore,
    private readonly clock: Clock,
    private readonly ids: IdSource,
  ) {}

  async execute(command: SetConversationControlCommand): Promise<SetConversationControlResult> {
    if (
      !UUID.test(command.conversationId) ||
      !SAFE_ID.test(command.actorId) ||
      !SAFE_ID.test(command.idempotencyKey) ||
      !SAFE_ID.test(command.correlationId) ||
      !SHA256.test(command.requestFingerprint) ||
      !MODES.has(command.controlMode) ||
      !Number.isInteger(command.expectedVersion) ||
      command.expectedVersion < 1
    ) {
      throw new ConversationControlError('INVALID_REQUEST');
    }

    const committed = await this.store.commitControl({
      changeId: this.ids.next(),
      eventId: this.ids.next(),
      auditId: this.ids.next(),
      conversationId: command.conversationId,
      actorId: command.actorId,
      controlMode: command.controlMode,
      expectedVersion: command.expectedVersion,
      idempotencyKey: command.idempotencyKey,
      requestFingerprint: command.requestFingerprint,
      correlationId: command.correlationId,
      blockAiActive: command.automationPaused && command.controlMode === 'AI_ACTIVE',
      occurredAt: this.clock.now(),
    });

    if (committed.disposition === 'NOT_FOUND') {
      throw new ConversationControlError('CONVERSATION_NOT_FOUND');
    }
    if (committed.disposition === 'VERSION_CONFLICT') {
      throw new ConversationControlError('VERSION_CONFLICT');
    }
    if (committed.disposition === 'KILL_SWITCH') {
      throw new ConversationControlError('KILL_SWITCH_ACTIVE');
    }
    if (committed.disposition === 'IDEMPOTENCY_CONFLICT') {
      throw new ConversationControlError('IDEMPOTENCY_KEY_REUSED');
    }

    return {
      disposition: committed.disposition,
      conversationId: command.conversationId,
      controlMode: committed.controlMode,
      version: committed.version,
      automatedReplyAllowed: allowsAutomatedReply(committed.controlMode, command.automationPaused),
    };
  }
}

export function conversationControlEvent(write: ControlWrite, version: number): ControlEvent {
  return {
    eventId: write.eventId,
    eventType: 'ConversationControlChanged',
    eventVersion: 1,
    aggregateId: write.conversationId,
    occurredAt: write.occurredAt,
    correlationId: write.correlationId,
    payload: {
      conversationId: write.conversationId,
      controlMode: write.controlMode,
      version,
    },
  };
}

export function conversationControlAudit(write: ControlWrite): ControlAudit {
  return {
    id: write.auditId,
    actorId: write.actorId,
    action: 'CONVERSATION_CONTROL_CHANGED',
    entityId: write.conversationId,
    reasonCode: write.controlMode,
    correlationId: write.correlationId,
    occurredAt: write.occurredAt,
  };
}
