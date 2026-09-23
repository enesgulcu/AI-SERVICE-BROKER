# Project Status

Last updated: 2026-09-24  
Current phase: Synthetic sandbox path complete  
Overall status: Checklist complete — 59 of 59 roadmap items

## Snapshot

A synthetic lead can move from intake to an operational `JOB_READY` snapshot.
The snapshot is not a contract. The sandbox quote is a one-minor-unit fixture,
not a company tariff. Live WhatsApp is not called.

| Area       | Now                                                                                                                                                |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phases 0–8 | Checklist complete. Production switches for a real tariff, live WhatsApp, a legal contract, an identity provider, and real personal data stay off. |

Checklist: 59 of 59. Verification on 2026-09-24: `pnpm check` (114 unit tests, including the Postgres integration test, and 23 API end-to-end tests) plus `pnpm audit --prod --audit-level high`. Migrations `0001`–`0008` are on hosted Postgres. CI runs the integration test against a Postgres 16 service container.

## Current objective

Keep the synthetic path auditable. Do not treat the sandbox quote, the job
snapshot, or the WhatsApp sandbox adapter as a production commercial or legal
commitment.

## Completed

- Baseline product specification reviewed.
- Living source-of-truth and precedence rules established.
- Modular-monolith architecture and initial technology decision recorded.
- Initial domain boundaries, workflow and AI safety rules documented.
- Open business/legal/security decisions registered with safe defaults.
- Persistent development rule and phased roadmap added.
- Initial threat model, data-classification rules and quality gates added.
- pnpm workspace created with NestJS API and background worker applications.
- Shared schema-validated environment configuration added.
- API liveness endpoint and application tests added.
- CI workflow and explicit dependency build allow-list added.
- High-severity transitively vulnerable `multer` version overridden to a patched
  release.
- Independent architecture and compliance reviews incorporated into explicit
  go-live gates, open decisions and the legal approval checklist.
- Structured Pino HTTP logging with safe request serialization and log
  redaction added.
- Correlation IDs are validated/generated, propagated to responses and included
  in the stable HTTP error contract.
- Helmet security headers plus separate liveness/readiness endpoints added.
- Versioned Zod contracts added for lead ingestion, idempotency keys and
  ingestion responses.
- Framework-independent Lead aggregate and ingestion use case added with
  validated invariants and an atomic persistence/outbox port.
- `LeadCreated` V1 deliberately excludes direct customer PII.
- SQL-first PostgreSQL package added: checksummed migrations, advisory lock,
  inbox/outbox/lead schema, and atomic lead ingestion adapter.
- Idempotency keys now bind a SHA-256 request fingerprint; reuse with a
  different body is a conflict.
- Compose file defines local PostgreSQL and Redis. Runtime is not yet verified
  because Docker is not installed on this machine.
- `POST /v1/leads` accepts synthetic leads with idempotency, fingerprint
  conflicts, and real-source blocking.
- Raw payloads are stored separately from the lead and are excluded from events.
- Synthetic first contact moves `NEW → CONTACT_PENDING → CONTACTED` only after
  a guarded sandbox draft and human approval. Delivery is mock-only. Rejection
  and expiry do not send.
- Short correlation IDs are replaced before they reach lead ingestion.
- Migration files execute as one simple-query script inside their transaction.
- The API closes its PostgreSQL pool on shutdown and handles idle client errors.
- The worker claims outbox events, publishes known safe facts, and dead-letters
  unknown versions, unsafe payloads and non-mock channels. Pausing automation
  leaves the events unpublished.
- `POST /v1/inbox/messages` records a synthetic inbound message, reuses one
  unverified customer and one mock conversation for the same phone, and rejects
  a changed provider message. The event and audit omit the phone and body. No
  reply is sent. `AUTOMATION_PAUSED` stores the conversation as `PAUSED`.
- Schema migrations `0001`–`0008` applied to the hosted Neon Postgres database.
  The connection string stays in the gitignored `.env`. API, worker, and
  migration commands load that file when it exists.
- `POST /v1/conversations/{id}/control` sets `HUMAN_CONTROL` or `PAUSED`.
  `AUTOMATION_PAUSED` blocks a return to `AI_ACTIVE`. No message is sent.
- Workflow policy `workflow-v1` records interest, silence, manual review, and
  closed outcomes. Pricing, acceptance, job creation, and first contact stay
  on their own gates. No message is sent.
- Home-helper requirements use schema `regular-home-helper-v1`. Human
  confirmation is a fact; fake-model output below confidence 1 is evidence.
  `QUALIFIED` is reached only by requirement confirmation. The public workflow
  command cannot set it. Events omit the field values.
- The requirement catalogue is configuration. Only `REGULAR_HOME_HELPER` is
  active. Any other schema version is rejected.
- Requirement IDs `REQ-001` through `REQ-031` are traced to an authority and,
  when implemented, to code and a test. See `docs/TRACEABILITY.md`.
- Policy `policy-empty-v1` exposes no company fact. Risk signals stay in
  review and do not block a lead. The price function is deterministic. A
  request without a lead issues no quote. The synthetic sandbox card is a
  fixture, not an approved tariff. A positive discount has no authority.
- Customer-visible drafts pass `guardCustomerDraft` before a mock first
  contact is prepared or approved. Promise, legal-commitment, unapproved
  company-fact, and sensitive or abusive language reject the draft. The lead
  is not blocked.
- Delivery callbacks accept only the approved mock template
  `sandbox-first-contact-v1`. A repeated provider event is a duplicate. A
  changed status conflicts. WhatsApp callbacks are refused and nothing is sent.
- Operator reads for requirement, conversation, quote, and audit omit phone,
  message body, listing text, and requirement field values.
- A synthetic qualified lead can take the sandbox path: fixture quote,
  zero-discount negotiation, unsent mock follow-up, WhatsApp sandbox record
  with `network: false`, and an operational `JOB_READY` snapshot. See ADR-0016.
- Token RBAC exists and defaults to off. A non-synthetic source is accepted
  only when personal-data mode is `approved` and the pilot approval matches.
- Adversarial draft cases, an in-process guard repeat, and risk idempotency
  are covered. `GET /v1/operations/summary` returns funnel, qualified count,
  review counts, and `COST_NOT_AVAILABLE`.
- Outbound delivery accepts a human-approved mock template and refuses
  live WhatsApp. Unsigned webhooks are rejected. POST requests are rate limited.
  Safe dead letters can be redriven and audited. Published events hand off to
  the mock provider.
- Operator lead and review-queue reads mask the phone and omit listing text.

## In progress

- None. The roadmap checklist is complete.

## Next

Production use of a real tariff, live WhatsApp, a legal contract, an identity
provider, or real personal data waits on the open decisions in
`OPEN_DECISIONS.md`. Local Docker Compose and Redis are still unverified on
this machine.

## Current blockers

Docker is not installed on the current machine, so Compose and live Redis were
not started here. The Postgres integration test passed on hosted Postgres and
is wired to a Postgres 16 service in CI. Real tariff, live messaging, legal
acceptance, and real personal data remain open decisions. The highest-priority
approvals are source/contact legality, KVKK and cross-border processing, and
WhatsApp opt-in/template operation.

## Verification

Verified on 2026-09-24:

- `pnpm check`: passed (format, lint, type-check, 114 unit tests including
  the Postgres integration test, 23 API end-to-end tests, production builds,
  and the tracked-file secret scan)
- Postgres commercial integration test: passed against hosted Postgres on
  2026-09-23
- Node.js on this machine is v24.14.0. Project engines require Node.js 22 or
  newer. pnpm `11.5.3`
- Migrations `0001` through `0008` are applied on hosted Postgres
- Docker Compose and live Redis were not verified on this machine
- Production go-live gates in `QUALITY_GATES.md` and
  `docs/legal/COMPLIANCE_CHECKLIST.md` remain unchecked
