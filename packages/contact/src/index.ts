export { InMemoryFirstContactAdapter } from './adapters/in-memory-first-contact.adapter';
export { DecideFirstContact } from './application/decide-first-contact';
export type {
  DecideFirstContactCommand,
  DecideFirstContactResult,
} from './application/decide-first-contact';
export { ContactFlowError } from './application/first-contact.port';
export type {
  AuditRecord,
  CommitResult,
  ContactEvent,
  ContactReviewSnapshot,
  DecisionPlan,
  FirstContactPort,
  PreparationPlan,
} from './application/first-contact.port';
export { PrepareFirstContact } from './application/prepare-first-contact';
export type {
  PrepareFirstContactCommand,
  PrepareFirstContactResult,
} from './application/prepare-first-contact';
export { isApprovedContactSource } from './domain/eligibility';
export {
  FIRST_CONTACT_TEMPLATE_VERSION,
  SANDBOX_FIRST_CONTACT_DRAFT,
} from './domain/first-contact-draft';
