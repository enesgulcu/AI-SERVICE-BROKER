import {
  decideWorkflowMove,
  type ClosedLostReason,
  type LeadStatus,
  type WorkflowTarget,
} from './workflow-move';

export type { LeadStatus };

export interface CreateLeadInput {
  id: string;
  source: string;
  sourceReference: string;
  phone: string;
  receivedAt: Date;
  customerName?: string;
  city?: string;
  district?: string;
  listingTitle?: string;
  listingText?: string;
  publishedAt?: Date;
  rawPayloadReference?: string;
}

export interface LeadSnapshot {
  id: string;
  status: LeadStatus;
  version: number;
  previousStatus?: LeadStatus;
  resumeStatus?: LeadStatus;
  source: string;
  sourceReference: string;
  phone: string;
  receivedAt: Date;
  customerName?: string;
  city?: string;
  district?: string;
  listingTitle?: string;
  listingText?: string;
  publishedAt?: Date;
  rawPayloadReference?: string;
}

export class LeadInvariantError extends Error {
  constructor(
    readonly code:
      | 'INVALID_ID'
      | 'INVALID_SOURCE'
      | 'INVALID_SOURCE_REFERENCE'
      | 'INVALID_PHONE'
      | 'INVALID_RECEIVED_AT'
      | 'INVALID_PUBLISHED_AT'
      | 'INVALID_VERSION'
      | 'INVALID_LEAD_TRANSITION',
  ) {
    super(code);
    this.name = LeadInvariantError.name;
  }
}

const E164_PHONE = /^\+[1-9]\d{7,14}$/;
const SOURCE = /^[A-Z0-9_-]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function optionalTrimmed(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export class Lead {
  private constructor(private readonly state: LeadSnapshot) {}

  static create(input: CreateLeadInput): Lead {
    const id = input.id.trim();
    const source = input.source.trim().toUpperCase();
    const sourceReference = input.sourceReference.trim();
    const phone = input.phone.trim();

    if (!UUID.test(id)) {
      throw new LeadInvariantError('INVALID_ID');
    }
    if (!SOURCE.test(source)) {
      throw new LeadInvariantError('INVALID_SOURCE');
    }
    if (!sourceReference || sourceReference.length > 256) {
      throw new LeadInvariantError('INVALID_SOURCE_REFERENCE');
    }
    if (!E164_PHONE.test(phone)) {
      throw new LeadInvariantError('INVALID_PHONE');
    }
    if (Number.isNaN(input.receivedAt.getTime())) {
      throw new LeadInvariantError('INVALID_RECEIVED_AT');
    }
    if (input.publishedAt && Number.isNaN(input.publishedAt.getTime())) {
      throw new LeadInvariantError('INVALID_PUBLISHED_AT');
    }

    return new Lead({
      id,
      status: 'NEW',
      version: 1,
      source,
      sourceReference,
      phone,
      receivedAt: new Date(input.receivedAt),
      customerName: optionalTrimmed(input.customerName),
      city: optionalTrimmed(input.city),
      district: optionalTrimmed(input.district),
      listingTitle: optionalTrimmed(input.listingTitle),
      listingText: optionalTrimmed(input.listingText),
      publishedAt: input.publishedAt ? new Date(input.publishedAt) : undefined,
      rawPayloadReference: optionalTrimmed(input.rawPayloadReference),
    });
  }

  static rehydrate(snapshot: LeadSnapshot): Lead {
    if (!Number.isInteger(snapshot.version) || snapshot.version < 1) {
      throw new LeadInvariantError('INVALID_VERSION');
    }

    const created = Lead.create(snapshot);
    return new Lead({
      ...created.snapshot(),
      status: snapshot.status,
      version: snapshot.version,
      previousStatus: snapshot.previousStatus,
      resumeStatus: snapshot.resumeStatus,
    });
  }

  applyWorkflowMove(
    target: WorkflowTarget,
    reasonCode: ClosedLostReason | null,
    requirementsReady = false,
  ): Lead {
    const decision = decideWorkflowMove({
      from: this.state.status,
      to: target,
      previousStatus: this.state.previousStatus ?? null,
      resumeStatus: this.state.resumeStatus ?? null,
      reasonCode,
      requirementsReady,
    });
    if (!decision.ok) {
      throw new LeadInvariantError('INVALID_LEAD_TRANSITION');
    }

    return new Lead({
      ...this.snapshot(),
      status: decision.status,
      version: this.state.version + 1,
      previousStatus: decision.previousStatus ?? undefined,
      resumeStatus: decision.resumeStatus ?? undefined,
    });
  }

  markContactPending(): Lead {
    return this.transition('NEW', 'CONTACT_PENDING');
  }

  markContacted(): Lead {
    return this.transition('CONTACT_PENDING', 'CONTACTED');
  }

  releaseToNew(): Lead {
    return this.transition('CONTACT_PENDING', 'NEW');
  }

  private transition(expected: LeadStatus, status: LeadStatus): Lead {
    if (this.state.status !== expected) {
      throw new LeadInvariantError('INVALID_LEAD_TRANSITION');
    }

    return new Lead({
      ...this.snapshot(),
      status,
      version: this.state.version + 1,
    });
  }

  snapshot(): LeadSnapshot {
    return {
      ...this.state,
      receivedAt: new Date(this.state.receivedAt),
      publishedAt: this.state.publishedAt ? new Date(this.state.publishedAt) : undefined,
    };
  }
}
