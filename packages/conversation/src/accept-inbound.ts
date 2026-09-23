import { CustomerIdentityError, hashPhone } from '@ai-service-broker/customer';

export type ControlMode = 'AI_ACTIVE' | 'HUMAN_CONTROL' | 'PAUSED';

export interface AcceptInboundCommand {
  leadId: string;
  source: string;
  phone: string;
  providerMessageId: string;
  body: string;
  correlationId: string;
  automationPaused: boolean;
}

export interface AcceptInboundResult {
  disposition: 'RECORDED' | 'DUPLICATE';
  customerId: string;
  conversationId: string;
  messageId: string;
  controlMode: ControlMode;
  identityVerified: false;
}

export interface StoredInbound {
  customerId: string;
  conversationId: string;
  messageId: string;
  leadId: string;
  phone: string;
  phoneHash: string;
  body: string;
  providerMessageId: string;
  controlMode: ControlMode;
  correlationId: string;
  receivedAt: Date;
}

export interface InboundEvent {
  eventId: string;
  eventType: 'InboundMessageRecorded';
  eventVersion: 1;
  aggregateId: string;
  occurredAt: Date;
  correlationId: string;
  payload: {
    messageId: string;
    conversationId: string;
    customerId: string;
    channel: 'MOCK';
    controlMode: ControlMode;
  };
}

export interface InboundAudit {
  id: string;
  action: 'INBOUND_RECORDED';
  entityId: string;
  reasonCode: 'INBOUND_RECORDED';
  correlationId: string;
  occurredAt: Date;
}

export interface InboundWrite {
  customerId: string;
  conversationId: string;
  messageId: string;
  eventId: string;
  auditId: string;
  leadId: string;
  phone: string;
  phoneHash: string;
  body: string;
  providerMessageId: string;
  controlMode: ControlMode;
  correlationId: string;
  receivedAt: Date;
}

export type InboundCommit =
  { disposition: 'RECORDED' | 'DUPLICATE'; stored: StoredInbound } | { disposition: 'CONFLICT' };

export interface InboundStore {
  commit(write: InboundWrite): Promise<InboundCommit>;
}

export class InboundFlowError extends Error {
  constructor(
    readonly code:
      | 'INVALID_REQUEST'
      | 'INVALID_PHONE'
      | 'UNSUPPORTED_PROVIDER'
      | 'CONTACT_NOT_ELIGIBLE'
      | 'INBOX_MESSAGE_CONFLICT',
  ) {
    super(code);
    this.name = InboundFlowError.name;
  }
}

export class InboundMessageConflictError extends InboundFlowError {
  constructor() {
    super('INBOX_MESSAGE_CONFLICT');
    this.name = InboundMessageConflictError.name;
  }
}

const SYNTHETIC = new Set(['SYNTHETIC', 'TEST']);
const SAFE_ID = /^[a-zA-Z0-9._:-]{8,128}$/;
const PROVIDER_MESSAGE_ID = /^[A-Za-z0-9._:-]{1,256}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface Clock {
  now(): Date;
}

interface IdSource {
  next(): string;
}

export class AcceptInboundMessage {
  constructor(
    private readonly store: InboundStore,
    private readonly clock: Clock,
    private readonly ids: IdSource,
  ) {}

  async execute(command: AcceptInboundCommand): Promise<AcceptInboundResult> {
    const body = command.body.trim();
    if (
      !UUID.test(command.leadId) ||
      !SAFE_ID.test(command.correlationId) ||
      !PROVIDER_MESSAGE_ID.test(command.providerMessageId) ||
      body.length < 1 ||
      body.length > 2_000
    ) {
      throw new InboundFlowError('INVALID_REQUEST');
    }
    if (!SYNTHETIC.has(command.source.trim().toUpperCase())) {
      throw new InboundFlowError('CONTACT_NOT_ELIGIBLE');
    }

    let phoneHash: string;
    try {
      phoneHash = hashPhone(command.phone);
    } catch (error) {
      if (error instanceof CustomerIdentityError) {
        throw new InboundFlowError('INVALID_PHONE');
      }
      throw error;
    }

    const receivedAt = this.clock.now();
    const write: InboundWrite = {
      customerId: this.ids.next(),
      conversationId: this.ids.next(),
      messageId: this.ids.next(),
      eventId: this.ids.next(),
      auditId: this.ids.next(),
      leadId: command.leadId,
      phone: command.phone.trim(),
      phoneHash,
      body,
      providerMessageId: command.providerMessageId,
      controlMode: command.automationPaused ? 'PAUSED' : 'AI_ACTIVE',
      correlationId: command.correlationId,
      receivedAt,
    };
    const committed = await this.store.commit(write);
    if (committed.disposition === 'CONFLICT') {
      throw new InboundMessageConflictError();
    }
    return view(committed.stored, committed.disposition);
  }
}

function view(message: StoredInbound, disposition: 'RECORDED' | 'DUPLICATE'): AcceptInboundResult {
  return {
    disposition,
    customerId: message.customerId,
    conversationId: message.conversationId,
    messageId: message.messageId,
    controlMode: message.controlMode,
    identityVerified: false,
  };
}

export function inboundEvent(write: InboundWrite): InboundEvent {
  return {
    eventId: write.eventId,
    eventType: 'InboundMessageRecorded',
    eventVersion: 1,
    aggregateId: write.conversationId,
    occurredAt: write.receivedAt,
    correlationId: write.correlationId,
    payload: {
      messageId: write.messageId,
      conversationId: write.conversationId,
      customerId: write.customerId,
      channel: 'MOCK',
      controlMode: write.controlMode,
    },
  };
}

export function inboundAudit(write: InboundWrite): InboundAudit {
  return {
    id: write.auditId,
    action: 'INBOUND_RECORDED',
    entityId: write.messageId,
    reasonCode: 'INBOUND_RECORDED',
    correlationId: write.correlationId,
    occurredAt: write.receivedAt,
  };
}
