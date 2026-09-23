import { deadLetterAt, type OutboxMessage, type OutboxStore } from './outbox';

function clone(message: OutboxMessage): OutboxMessage {
  return {
    ...message,
    occurredAt: new Date(message.occurredAt),
    availableAt: new Date(message.availableAt),
    publishedAt: message.publishedAt ? new Date(message.publishedAt) : undefined,
    payload: { ...message.payload },
  };
}

export class InMemoryOutboxStore implements OutboxStore {
  private readonly messages: OutboxMessage[] = [];

  add(message: OutboxMessage): void {
    this.messages.push(clone(message));
  }

  snapshot(): OutboxMessage[] {
    return this.messages.map(clone);
  }

  claim(now: Date, limit: number, maxAttempts: number): Promise<OutboxMessage[]> {
    const claimed = this.messages
      .filter(
        (message) =>
          !message.publishedAt &&
          message.availableAt.getTime() <= now.getTime() &&
          message.attempts < maxAttempts,
      )
      .sort(
        (left, right) =>
          left.availableAt.getTime() - right.availableAt.getTime() ||
          left.occurredAt.getTime() - right.occurredAt.getTime(),
      )
      .slice(0, limit);

    for (const message of claimed) {
      message.attempts += 1;
    }

    return Promise.resolve(claimed.map(clone));
  }

  markPublished(eventId: string, publishedAt: Date): Promise<void> {
    const message = this.findOpen(eventId);
    if (message) {
      message.publishedAt = new Date(publishedAt);
      message.lastError = undefined;
    }
    return Promise.resolve();
  }

  markRetry(eventId: string, availableAt: Date, error: string): Promise<void> {
    const message = this.findOpen(eventId);
    if (message) {
      message.availableAt = new Date(availableAt);
      message.lastError = error;
    }
    return Promise.resolve();
  }

  markDead(eventId: string, error: string): Promise<void> {
    const message = this.findOpen(eventId);
    if (message) {
      message.availableAt = deadLetterAt();
      message.lastError = error;
    }
    return Promise.resolve();
  }

  private findOpen(eventId: string): OutboxMessage | undefined {
    return this.messages.find((message) => message.eventId === eventId && !message.publishedAt);
  }
}
