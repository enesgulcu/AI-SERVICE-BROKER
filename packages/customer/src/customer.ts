import { createHash } from 'node:crypto';

const E164 = /^\+[1-9]\d{7,14}$/;

export interface CustomerRecord {
  id: string;
  phoneHash: string;
  leadIds: readonly string[];
  identityVerified: false;
}

export class CustomerIdentityError extends Error {
  constructor(readonly code: 'INVALID_PHONE') {
    super(code);
    this.name = CustomerIdentityError.name;
  }
}

export function hashPhone(phone: string): string {
  const normalized = phone.trim();
  if (!E164.test(normalized)) {
    throw new CustomerIdentityError('INVALID_PHONE');
  }

  return createHash('sha256').update(normalized).digest('hex');
}

export function linkLead(
  existing: CustomerRecord | null,
  input: { id: string; phoneHash: string; leadId: string },
): CustomerRecord {
  if (!existing) {
    return {
      id: input.id,
      phoneHash: input.phoneHash,
      leadIds: [input.leadId],
      identityVerified: false,
    };
  }

  if (existing.phoneHash !== input.phoneHash) {
    throw new CustomerIdentityError('INVALID_PHONE');
  }

  return {
    id: existing.id,
    phoneHash: existing.phoneHash,
    leadIds: existing.leadIds.includes(input.leadId)
      ? existing.leadIds
      : [...existing.leadIds, input.leadId],
    identityVerified: false,
  };
}
