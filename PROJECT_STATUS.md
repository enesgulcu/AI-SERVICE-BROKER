# Project Status

Last updated: 2026-09-23  
Current phase: Safe path complete through qualification  
Overall status: In progress — 42 of 58 roadmap items

## Snapshot

A synthetic lead can move from intake to a qualified home-helper requirement.
The customer-facing product is earlier than the checklist: there is no approved
price, no WhatsApp delivery, no admin login, and no real personal data.

| Area       | Now                                                                                                                                             |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Phases 0–2 | Done, except the requirement-ID traceability matrix and container-backed database tests                                                         |
| Phase 3    | Done, except a real outbound provider                                                                                                           |
| Phase 4    | Home-helper schema, evidence, versions, and the fake extractor are in place. A dynamic schema catalogue is not                                  |
| Phases 5–8 | Only the closed doors: empty policy, review-only risk, price function with no card, mock delivery, rate limit, masked reads, and rollback flags |

Checklist: 42 of 58. Verification on 2026-09-23: `pnpm check` (100 unit tests, 20 API end-to-end tests) and migrations `0001`–`0006` on hosted Postgres.

## Current objective

A synthetic lead can be qualified against the home-helper requirement schema.
Price, WhatsApp, real personal data, acceptance, and job creation stay closed.

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
- Schema migrations `0001`–`0006` applied to the hosted Neon Postgres database.
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
- Policy `policy-empty-v1` exposes no company fact. Risk signals stay in
  review and do not block a lead. The price function is deterministic, and the
  API loads no rate card, so quotes are not issued. Negotiation and follow-up
  have no authority.
- Outbound delivery accepts a human-approved mock template and refuses
  WhatsApp. Unsigned webhooks are rejected. POST requests are rate limited.
  Safe dead letters can be redriven and audited.
- Operator lead and review-queue reads mask the phone and omit listing text.
  There is no admin login.

## In progress

- Container-backed Redis verification

## Next

1. Verify Compose and Redis after Docker is available.
2. Add a separate inbox consumer only if inbound receipt and processing must
   split across processes.
3. Add a real outbound provider only after the messaging decision is approved.
4. Issue a quote only after an approved rate card exists.

## Current blockers

Docker is not installed on the current machine, so local Redis and
container-backed integration tests cannot yet be verified. The hosted Postgres
schema is applied. Real-data ingestion, production messaging, pricing and
autonomous outreach remain blocked by decisions in `OPEN_DECISIONS.md`.
The highest-priority approvals are source/contact legality, KVKK and
cross-border processing, and WhatsApp opt-in/template operation.

## Verification

Verified on 2026-09-23:

- `pnpm check`: passed (format, lint, type-check, 100 unit tests, 20 API
  end-to-end tests and production builds)
- `pnpm audit --prod --audit-level high`: passed with no known vulnerabilities
- Node.js `v22.15.0`, pnpm `11.5.3`
- `pnpm db:migrate` applied `0001` through `0006` to Neon
- Docker Compose and live Redis were not verified on this machine
