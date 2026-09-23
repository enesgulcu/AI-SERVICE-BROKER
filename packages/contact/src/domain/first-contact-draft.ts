export const FIRST_CONTACT_TEMPLATE_VERSION = 'sandbox-first-contact-v1';

export const SANDBOX_FIRST_CONTACT_DRAFT = [
  'Merhaba, bu mesaj otomatik bir taslaktır ve bir insan onayından sonra iletilir.',
  'Hizmet veya personel konusunda taahhüt içermez.',
  'İsterseniz bir insan temsilciden destek isteyebilirsiniz.',
].join(' ');

const PROMISE_LANGUAGE = /garanti|iade|tazminat|ücret|fiyat|maaş|işe al|₺|\btl\b|\btry\b/i;

export type DraftGuardReason =
  | 'TEMPLATE_MISMATCH'
  | 'MISSING_AUTOMATION_DISCLOSURE'
  | 'MISSING_HUMAN_PATH'
  | 'MISSING_NO_PROMISE_STATEMENT'
  | 'PROMISE_LANGUAGE';

export function guardFirstContactDraft(draft: string): DraftGuardReason[] {
  const reasons: DraftGuardReason[] = [];
  if (draft !== SANDBOX_FIRST_CONTACT_DRAFT) {
    reasons.push('TEMPLATE_MISMATCH');
  }
  if (!draft.includes('otomatik')) {
    reasons.push('MISSING_AUTOMATION_DISCLOSURE');
  }
  if (!draft.includes('insan')) {
    reasons.push('MISSING_HUMAN_PATH');
  }
  if (!draft.includes('taahhüt içermez')) {
    reasons.push('MISSING_NO_PROMISE_STATEMENT');
  }
  if (PROMISE_LANGUAGE.test(draft)) {
    reasons.push('PROMISE_LANGUAGE');
  }
  return reasons;
}
