export interface OutboxMessage {
  eventId: string;
  eventType: string;
  eventVersion: number;
  aggregateType: string;
  aggregateId: string;
  occurredAt: Date;
  correlationId: string;
  payload: Record<string, unknown>;
  attempts: number;
  availableAt: Date;
  publishedAt?: Date;
  lastError?: string;
}

export interface OutboxStore {
  claim(now: Date, limit: number, maxAttempts: number): Promise<OutboxMessage[]>;
  markPublished(eventId: string, publishedAt: Date): Promise<void>;
  markRetry(eventId: string, availableAt: Date, error: string): Promise<void>;
  markDead(eventId: string, error: string): Promise<void>;
}

export interface DrainOptions {
  batchSize: number;
  maxAttempts: number;
  automationPaused: boolean;
}

export interface DrainResult {
  disposition: 'DRAINED' | 'PAUSED';
  published: number;
  retried: number;
  dead: number;
}

export interface Clock {
  now(): Date;
}

const KNOWN_PAYLOAD_KEYS: Readonly<Record<string, readonly string[]>> = {
  'LeadCreated:1': ['leadId', 'source', 'sourceReference', 'status'],
  'ContactReviewOpened:1': ['reviewId', 'leadId', 'templateVersion', 'expiresAt'],
  'LeadContacted:1': ['reviewId', 'leadId', 'channel', 'templateVersion'],
  'InboundMessageRecorded:1': [
    'messageId',
    'conversationId',
    'customerId',
    'channel',
    'controlMode',
  ],
  'ConversationControlChanged:1': ['conversationId', 'controlMode', 'version'],
  'WorkflowTransitioned:1': ['leadId', 'fromStatus', 'toStatus', 'policyVersion', 'reasonCode'],
  'RequirementVersionRecorded:1': [
    'leadId',
    'requirementVersion',
    'schemaVersion',
    'ready',
    'missingCount',
  ],
  'RiskSignalRecorded:1': ['leadId', 'code', 'severity', 'disposition'],
};

const UNSAFE_KEY = /phone|name|body|raw|listing|email|address/i;
const E164 = /\+[1-9]\d{7,14}/;
const DEAD_AT = new Date('9999-12-31T00:00:00.000Z');
const RETRY_DELAY_MS = 30_000;

type Decision = 'ACK' | 'RETRY' | 'DEAD';

function payloadIsSafe(payload: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(payload);
  if (keys.length !== allowed.length || keys.some((key) => !allowed.includes(key))) {
    return false;
  }
  if (keys.some((key) => UNSAFE_KEY.test(key))) {
    return false;
  }

  return !JSON.stringify(payload).match(E164);
}

function decide(message: OutboxMessage): { decision: Decision; error?: string } {
  const allowed = KNOWN_PAYLOAD_KEYS[`${message.eventType}:${message.eventVersion}`];
  if (!allowed) {
    return { decision: 'DEAD', error: 'UNKNOWN_EVENT' };
  }
  if (!payloadIsSafe(message.payload, allowed)) {
    return { decision: 'DEAD', error: 'UNSAFE_PAYLOAD' };
  }
  if (
    (message.eventType === 'LeadContacted' || message.eventType === 'InboundMessageRecorded') &&
    message.payload.channel !== 'MOCK'
  ) {
    return { decision: 'DEAD', error: 'UNSAFE_CHANNEL' };
  }

  return { decision: 'ACK' };
}

export async function drainOutbox(
  store: OutboxStore,
  clock: Clock,
  options: DrainOptions,
): Promise<DrainResult> {
  if (options.automationPaused) {
    return { disposition: 'PAUSED', published: 0, retried: 0, dead: 0 };
  }

  const claimed = await store.claim(clock.now(), options.batchSize, options.maxAttempts);
  const result: DrainResult = { disposition: 'DRAINED', published: 0, retried: 0, dead: 0 };

  for (const message of claimed) {
    const outcome = decide(message);
    if (outcome.decision === 'ACK') {
      await store.markPublished(message.eventId, clock.now());
      result.published += 1;
      continue;
    }

    const error = outcome.error ?? 'DISPATCH_FAILED';
    if (outcome.decision === 'DEAD' || message.attempts >= options.maxAttempts) {
      await store.markDead(message.eventId, error);
      result.dead += 1;
      continue;
    }

    await store.markRetry(
      message.eventId,
      new Date(clock.now().getTime() + message.attempts * RETRY_DELAY_MS),
      error,
    );
    result.retried += 1;
  }

  return result;
}

export function deadLetterAt(): Date {
  return new Date(DEAD_AT);
}

export function canRedrive(message: OutboxMessage): boolean {
  return decide(message).decision === 'ACK';
}

export type RedriveResult =
  | { ok: true; disposition: 'REQUEUED' }
  | { ok: false; code: 'NOT_FOUND' | 'NOT_REDRIVABLE' | 'OUTBOX_NOT_DURABLE' };

export interface OutboxRedrive {
  redrive(input: {
    eventId: string;
    auditId: string;
    actorId: string;
    correlationId: string;
    occurredAt: Date;
  }): Promise<RedriveResult>;
}

export class UnavailableOutboxRedrive implements OutboxRedrive {
  redrive(): Promise<RedriveResult> {
    return Promise.resolve({ ok: false, code: 'OUTBOX_NOT_DURABLE' });
  }
}
