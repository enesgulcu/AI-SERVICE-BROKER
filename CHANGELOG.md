# Changelog

All notable product, architecture and implementation changes are recorded here.
Dates use ISO 8601. This project has not released a production version.

## [Unreleased]

### Added — 2026-09-24

- Publication check. `pnpm check` now includes a tracked-file secret scan.
  README and status text match the sandbox path: an unscoped quote stays
  closed, and the fixture quote is not a production tariff.

### Added — 2026-09-23

- Synthetic sandbox completion. A qualified synthetic lead can receive a
  non-binding fixture quote, refuse a positive discount, plan an unsent mock
  follow-up, and store an operational `JOB_READY` snapshot that is not a
  contract. WhatsApp sandbox delivery sets `network: false`. Real personal
  data still requires a matching pilot approval, and token RBAC stays off
  unless `OPERATOR_AUTH=token`. See ADR-0016 and migration
  `0008_sandbox_commercial.sql`.

- Adversarial draft regression set, in-process guard repeat, and risk
  idempotency failure test. `GET /v1/operations/summary` reports funnel and
  review counts with cost unavailable. A synthetic pilot qualifies one lead.
  Real-data pilot, WhatsApp, quotes, follow-up, acceptance, and admin login
  remain closed.

- Operator reads for the latest requirement, mock conversations, an empty quote
  list, and workflow audit rows. Phone, message body, listing text, and
  requirement field values stay out of those responses. See ADR-0015.

- Approved template catalogue with only `sandbox-first-contact-v1` on `MOCK`.
  `POST /v1/delivery-callbacks` records a mock delivery or failure, replays the
  same provider event, and refuses WhatsApp. See ADR-0014 and migration
  `0007_delivery_callbacks.sql`.

- Requirement IDs `REQ-001` through `REQ-020` in `docs/TRACEABILITY.md`. Built
  and closed rows point at code and a test. Blocked rows cite the open
  decision or the roadmap.

- Fail-closed customer-draft guard under policy `policy-empty-v1`. Promise,
  legal-commitment, unapproved company-fact, and sensitive or abusive language
  reject the draft and do not block the lead. First contact calls it before
  mock delivery. See ADR-0013.

- Requirement schema catalogue. Only `REGULAR_HOME_HELPER`
  (`regular-home-helper-v1`) is active; any other schema version is rejected.
  See ADR-0012.

- Living master specification and source-of-truth hierarchy
- Modular-monolith architecture and TypeScript stack decision
- Initial domain model, workflow state machine and AI safety rules
- Open-decision register with safe defaults and blocking points
- Phased delivery roadmap and project status record
- ADR process and ADR-0001
- Persistent repository governance rule
- Threat model, data-classification policy and quality gates
- pnpm workspace with NestJS API and background worker foundations
- Schema-validated shared environment configuration
- API liveness endpoint with unit and end-to-end tests
- GitHub Actions quality and production dependency-audit workflow
- Explicit dependency build allow-list and patched `multer` security override
- Expanded legal/privacy/fairness/AI-transparency decision register
- Mandatory real-data, outbound, commercial and safety go-live gates
- Legal compliance approval checklist
- Controlled, human-approved mock-contact first vertical slice
- Structured Pino HTTP logging with redacted, query-free request metadata
- Validated/generated correlation IDs and stable safe error responses
- Helmet security headers and separate liveness/readiness endpoints
- Expanded API end-to-end coverage for headers, correlation and error safety
- Versioned Zod contracts for lead ingestion and idempotency
- Framework-independent Lead aggregate with explicit invariants
- Atomic lead persistence/outbox application port and `LeadCreated` V1 event
- Contract rule keeping direct customer PII out of domain events
- SQL-first PostgreSQL migrations with checksum and advisory-lock runner
- Atomic lead + outbox adapter with idempotency fingerprint conflicts
- Canonical request fingerprint helper
- Local PostgreSQL/Redis Compose definition and `pnpm db:migrate`
- In-memory lead adapter implementing the same atomic ingestion port
- `POST /v1/leads` with idempotency, fingerprint conflict, and synthetic-only
  personal-data mode
- Synthetic inbound recording: one unverified customer per phone, one mock
  conversation, inbox idempotency, and `InboundMessageRecorded` without phone
  or message body. No reply is sent.
- API, worker, and migration commands load a gitignored `.env` when it exists.
  Hosted Postgres is selected with `DATABASE_SSL=require` and
  `LEAD_PERSISTENCE=postgres`.
- Operators can set a conversation to human control or paused. The global
  automation pause blocks a return to AI control. The change is versioned and
  audited, and no message is sent.
- Workflow policy `workflow-v1` records interest, no response, manual review,
  and a closed outcome. Quote, acceptance, job, analysis, and policy-block
  transitions stay closed. First contact is not bypassed.
- Requirement schema `regular-home-helper-v1` records versions, evidence,
  contradictions, and special requirements. Only the confirmation flow can
  mark a lead `QUALIFIED`. Field values stay out of events.
- Empty policy `policy-empty-v1`, review-only risk signals, a deterministic
  price function with no approved card, and closed quote, negotiation, and
  follow-up commands.
- Mock outbound assessment, fail-closed webhook signatures, POST rate limiting,
  and audited redrive of already-safe dead letters.
- Masked lead view and manual-review queue. No admin login.
- Implementation snapshot recorded in `MASTER_SPEC.md`, `PROJECT_STATUS.md`,
  `ROADMAP.md`, `ARCHITECTURE.md`, and `README.md`: 42 of 58 roadmap items, safe
  path through qualification, commercial and real-data gates still closed.

### Fixed — 2026-09-23

- Correlation IDs shorter than 8 safe characters are replaced before lead
  ingestion, instead of being accepted by HTTP and then rejected.
- Multi-statement SQL migrations run as one simple-query script per file, so
  the whole file commits or rolls back together.
- API PostgreSQL pools handle idle connection errors and close on shutdown.
- Synthetic first contact requires a guarded draft and human approval before a
  mock delivery. Raw payloads are stored separately from events and audit.
- The worker drains the transactional outbox. It records known events and
  refuses unknown, unsafe or non-mock deliveries. Automation pause stops the
  drain.
