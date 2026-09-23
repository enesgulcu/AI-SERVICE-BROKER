# Delivery Roadmap

The unit of delivery is a vertical slice with domain rules, persistence, API or
worker boundary, tests, observability and documentation.

Status on 2026-09-23: 42 of 58 items. The safe path qualifies a synthetic lead
and refuses a price, WhatsApp, a contract, and real personal data. Open items
need an approved decision, Docker, or a capability that is not invented here.

## Phase 0 — Product and engineering control

- [x] Living master specification
- [x] Architecture and initial ADR
- [x] Domain model and workflow contract
- [x] AI safety rules
- [x] Open-decision register
- [x] Persistent repository development rule
- [x] Threat model and data-classification register
- [x] Legal/compliance approval checklist
- [ ] Requirement IDs and specification traceability matrix
- [x] Conversation/risk evaluation catalogue

Exit: critical unknowns have safe defaults and implementation has an agreed
source-of-truth hierarchy.

## Phase 1 — Executable foundation

- [x] pnpm workspace and shared TypeScript/tooling configuration
- [x] API liveness and worker process skeletons
- [x] Validated environment configuration
- [x] Local PostgreSQL/Redis Compose definition (runtime not yet verified)
- [x] Structured logging, correlation IDs and safe HTTP error contract
- [x] Security headers and liveness/readiness endpoints
- [x] CI quality and dependency-security checks

Exit: one command starts local dependencies/apps and CI proves the skeleton.

## Phase 2 — First vertical slice: controlled lead contact

- [x] Framework-independent Lead domain/application module
- [x] Versioned lead ingestion and `LeadCreated` contracts
- [x] Source-adapter normalization and raw-payload provenance
- [x] Source-specific contact eligibility and suppression decision
- [x] PostgreSQL migrations, checksummed runner, and lead/outbox adapter
- [ ] Container-backed PostgreSQL integration tests
- [x] Idempotent intake API (synthetic-only by default)
- [x] First-message draft through policy/legal/promise guards
- [x] Mandatory human approval and mock messaging adapter
- [x] State transition, transactional outbox and audit evidence
- [x] Unit, integration and contract tests for the in-process path

Exit: a duplicate-safe synthetic lead can reach `CONTACTED` only through an
eligible, guarded, human-approved mock delivery with complete audit evidence.

## Phase 3 — Workflow, customer and conversation core

- [x] Versioned workflow transitions
- [x] Customer/contact resolution
- [x] Conversation/message persistence
- [x] Outbox claim, publish and dead-letter without customer delivery
- [x] Inbox idempotency and conversation lock
- [ ] Outbound provider delivery
- [x] Human control and kill-switch enforcement

## Phase 4 — Requirement intelligence

- [ ] Dynamic service/requirement schemas
- [x] Field evidence and confidence
- [x] Requirement versions, contradiction and missing-information engines
- [x] Special requirements/preferences
- [x] Fake AI provider and schema-validation pipeline

## Phase 5 — Safety and commercial core

- [x] Versioned policy and company facts
- [x] Risk/anomaly accumulation and review
- [ ] Promise/legal/policy/risk guards
- [x] Deterministic pricing
- [ ] Quotes and bounded negotiation

## Phase 6 — Messaging and follow-up

- [ ] WhatsApp adapter after OD-005 approval
- [ ] Signature verification, templates and delivery callbacks
- [ ] Policy-based contact/follow-up after OD-006 approval
- [x] Rate limiting, retry, DLQ and redrive operations

## Phase 7 — Job Ready and operations UI

- [ ] Acceptance evidence and job snapshots
- [x] Review queue, takeover and operational controls
- [ ] Lead/conversation/requirement/quote/audit views
- [ ] RBAC and sensitive-data masking

## Phase 8 — Evaluation and controlled pilot

- [ ] Regression/adversarial/risk datasets
- [ ] Load, failure-recovery and security testing
- [ ] Funnel, quality, cost and safety dashboards
- [ ] Synthetic pilot, then approval-gated real-data pilot
- [x] Gradual feature-flag expansion with rollback criteria

Future worker, matching, contract, payment and incident capabilities begin only
after V1 evidence and separate domain decisions.
