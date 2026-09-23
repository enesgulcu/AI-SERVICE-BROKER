import { linkLead, type CustomerRecord } from '@ai-service-broker/customer';
import {
  inboundAudit,
  inboundEvent,
  type InboundAudit,
  type InboundCommit,
  type InboundEvent,
  type InboundStore,
  type InboundWrite,
  type ConversationLeadSummary,
  type StoredInbound,
} from './accept-inbound';
import {
  conversationControlAudit,
  conversationControlEvent,
  type ControlAudit,
  type ControlCommit,
  type ControlEvent,
  type ControlWrite,
  type ConversationControlStore,
} from './set-conversation-control';

interface ConversationRecord {
  id: string;
  customerId: string;
  controlMode: StoredInbound['controlMode'];
  version: number;
}

interface StoredControlKey {
  fingerprint: string;
  controlMode: StoredInbound['controlMode'];
  version: number;
}

export class InMemoryInboundStore implements InboundStore, ConversationControlStore {
  readonly events: InboundEvent[] = [];
  readonly audits: InboundAudit[] = [];
  readonly controlEvents: ControlEvent[] = [];
  readonly controlAudits: ControlAudit[] = [];
  private readonly customers = new Map<string, CustomerRecord>();
  private readonly conversations = new Map<string, ConversationRecord>();
  private readonly messages = new Map<string, StoredInbound>();
  private readonly controlKeys = new Map<string, StoredControlKey>();
  private tail: Promise<void> = Promise.resolve();

  commit(write: InboundWrite): Promise<InboundCommit> {
    return this.exclusive<InboundCommit>(() => {
      const existing = this.messages.get(write.providerMessageId);
      if (existing) {
        if (existing.body !== write.body || existing.phoneHash !== write.phoneHash) {
          return Promise.resolve({ disposition: 'CONFLICT' });
        }
        return Promise.resolve({ disposition: 'DUPLICATE', stored: existing });
      }

      const customer = linkLead(this.customers.get(write.phoneHash) ?? null, {
        id: write.customerId,
        phoneHash: write.phoneHash,
        leadId: write.leadId,
      });
      const conversation = this.conversations.get(customer.id) ?? {
        id: write.conversationId,
        customerId: customer.id,
        controlMode: write.controlMode,
        version: 1,
      };
      const stored: StoredInbound = {
        customerId: customer.id,
        conversationId: conversation.id,
        messageId: write.messageId,
        leadId: write.leadId,
        phone: write.phone,
        phoneHash: write.phoneHash,
        body: write.body,
        providerMessageId: write.providerMessageId,
        controlMode: conversation.controlMode,
        correlationId: write.correlationId,
        receivedAt: write.receivedAt,
      };

      this.customers.set(write.phoneHash, customer);
      this.conversations.set(customer.id, conversation);
      this.messages.set(write.providerMessageId, stored);
      this.events.push(
        inboundEvent({ ...write, customerId: customer.id, conversationId: conversation.id }),
      );
      this.audits.push(inboundAudit({ ...write, messageId: stored.messageId }));
      return Promise.resolve({ disposition: 'RECORDED', stored });
    });
  }

  summariesForLead(leadId: string): Promise<ConversationLeadSummary[]> {
    const counts = new Map<string, ConversationLeadSummary>();
    for (const message of this.messages.values()) {
      if (message.leadId !== leadId) {
        continue;
      }
      const current = counts.get(message.conversationId);
      if (current) {
        current.messageCount += 1;
        continue;
      }
      const conversation = [...this.conversations.values()].find(
        (item) => item.id === message.conversationId,
      );
      counts.set(message.conversationId, {
        conversationId: message.conversationId,
        channel: 'MOCK',
        controlMode: conversation?.controlMode ?? message.controlMode,
        messageCount: 1,
      });
    }
    return Promise.resolve([...counts.values()]);
  }

  commitControl(write: ControlWrite): Promise<ControlCommit> {
    return this.exclusive<ControlCommit>(() => {
      const existingKey = this.controlKeys.get(write.idempotencyKey);
      if (existingKey) {
        if (existingKey.fingerprint !== write.requestFingerprint) {
          return Promise.resolve({ disposition: 'IDEMPOTENCY_CONFLICT' });
        }
        return Promise.resolve({
          disposition: 'DUPLICATE',
          controlMode: existingKey.controlMode,
          version: existingKey.version,
        });
      }

      const conversation = [...this.conversations.values()].find(
        (item) => item.id === write.conversationId,
      );
      if (!conversation) {
        return Promise.resolve({ disposition: 'NOT_FOUND' });
      }
      if (conversation.version !== write.expectedVersion) {
        return Promise.resolve({ disposition: 'VERSION_CONFLICT' });
      }
      if (write.blockAiActive) {
        return Promise.resolve({ disposition: 'KILL_SWITCH' });
      }
      if (conversation.controlMode === write.controlMode) {
        return Promise.resolve({
          disposition: 'UNCHANGED',
          controlMode: conversation.controlMode,
          version: conversation.version,
        });
      }

      const version = conversation.version + 1;
      const updated = { ...conversation, controlMode: write.controlMode, version };
      this.conversations.set(conversation.customerId, updated);
      this.controlKeys.set(write.idempotencyKey, {
        fingerprint: write.requestFingerprint,
        controlMode: updated.controlMode,
        version,
      });
      this.controlEvents.push(conversationControlEvent(write, version));
      this.controlAudits.push(conversationControlAudit(write));
      return Promise.resolve({
        disposition: 'CHANGED',
        controlMode: updated.controlMode,
        version,
      });
    });
  }

  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const run = this.tail.then(work, work);
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
