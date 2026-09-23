import {
  Lead,
  LeadVersionConflictError,
  decideWorkflowMove,
  type ClosedLostReason,
  type LeadStatus,
  type LeadStatusStore,
} from '@ai-service-broker/lead';
import {
  isWorkflowSource,
  workflowAudit,
  workflowEvent,
  type WorkflowAudit,
  type WorkflowEvent,
  type WorkflowCommit,
  type WorkflowStore,
  type WorkflowWrite,
} from './advance-workflow';

interface StoredKey {
  fingerprint: string;
  fromStatus: LeadStatus;
  toStatus: LeadStatus;
  version: number;
  reasonCode: ClosedLostReason | 'NONE';
}

export class InMemoryWorkflowStore implements WorkflowStore {
  readonly events: WorkflowEvent[] = [];
  readonly audits: WorkflowAudit[] = [];
  private readonly keys = new Map<string, StoredKey>();
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly leads: LeadStatusStore) {}

  findLead(id: string) {
    return this.leads.findById(id);
  }

  commit(write: WorkflowWrite): Promise<WorkflowCommit> {
    return this.exclusive(() => this.commitLocked(write));
  }

  private async commitLocked(write: WorkflowWrite): Promise<WorkflowCommit> {
    const existing = this.keys.get(write.idempotencyKey);
    if (existing) {
      if (existing.fingerprint !== write.requestFingerprint) {
        return { disposition: 'IDEMPOTENCY_CONFLICT' };
      }
      return {
        disposition: 'DUPLICATE',
        fromStatus: existing.fromStatus,
        toStatus: existing.toStatus,
        version: existing.version,
        reasonCode: existing.reasonCode,
      };
    }

    const lead = await this.leads.findById(write.leadId);
    if (!lead) {
      return { disposition: 'NOT_FOUND' };
    }
    if (!isWorkflowSource(lead.source)) {
      return { disposition: 'NOT_ELIGIBLE' };
    }
    if (lead.version !== write.expectedVersion) {
      return { disposition: 'VERSION_CONFLICT' };
    }

    const decision = decideWorkflowMove({
      from: lead.status,
      to: write.toStatus,
      previousStatus: lead.previousStatus ?? null,
      resumeStatus: lead.resumeStatus ?? null,
      reasonCode: write.reasonCode,
      requirementsReady: write.requirementsReady,
    });
    if (!decision.ok) {
      return { disposition: 'REJECTED', code: decision.code, gate: decision.gate };
    }

    const moved = Lead.rehydrate(lead).applyWorkflowMove(
      write.toStatus,
      write.reasonCode,
      write.requirementsReady,
    );
    try {
      await this.leads.save(moved.snapshot());
    } catch (error) {
      if (error instanceof LeadVersionConflictError) {
        return { disposition: 'VERSION_CONFLICT' };
      }
      throw error;
    }

    const snapshot = moved.snapshot();
    this.keys.set(write.idempotencyKey, {
      fingerprint: write.requestFingerprint,
      fromStatus: lead.status,
      toStatus: snapshot.status,
      version: snapshot.version,
      reasonCode: decision.reasonCode,
    });
    this.events.push(workflowEvent(lead, write));
    this.audits.push(workflowAudit(lead, write));
    return {
      disposition: 'CHANGED',
      fromStatus: lead.status,
      toStatus: snapshot.status,
      version: snapshot.version,
      reasonCode: decision.reasonCode,
    };
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
