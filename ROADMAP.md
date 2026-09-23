# Delivery Roadmap

The unit of delivery is a vertical slice with domain rules, persistence, API or
worker boundary, tests, observability and documentation.

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
- [ ] Conversation/risk evaluation catalogue

Exit: critical unknowns have safe defaults and implementation has an agreed
source-of-truth hierarchy.

## Phase 1 — Executable foundation

- [x] pnpm workspace and shared TypeScript/tooling configuration
- [x] API liveness and worker process skeletons
- [x] Validated environment configuration
- [ ] Local PostgreSQL/Redis environment
- [ ] Structured logging, correlation IDs and error contract
- [x] CI quality and dependency-security checks

Exit: one command starts local dependencies/apps and CI proves the skeleton.

## Phase 2 — First vertical slice: controlled lead contact

- [ ] Lead module, normalization and source provenance
- [ ] Source-specific contact eligibility and suppression decision
- [ ] PostgreSQL migrations and repository adapter
- [ ] Idempotent intake API
- [ ] First-message draft through policy/legal/promise guards
- [ ] Mandatory human approval and mock messaging adapter
- [ ] State transition, transactional outbox and audit evidence
- [ ] Unit, integration and contract tests

Exit: a duplicate-safe synthetic lead can reach `CONTACTED` only through an
eligible, guarded, human-approved mock delivery with complete audit evidence.

## Phase 3 — Workflow, customer and conversation core

- [ ] Versioned workflow transitions
- [ ] Customer/contact resolution
- [ ] Conversation/message persistence
- [ ] Inbox, lock and outbound outbox mechanics
- [ ] Human control and kill-switch enforcement

## Phase 4 — Requirement intelligence

- [ ] Dynamic service/requirement schemas
- [ ] Field evidence and confidence
- [ ] Requirement versions, contradiction and missing-information engines
- [ ] Special requirements/preferences
- [ ] Fake AI provider and schema-validation pipeline

## Phase 5 — Safety and commercial core

- [ ] Versioned policy and company facts
- [ ] Risk/anomaly accumulation and review
- [ ] Promise/legal/policy/risk guards
- [ ] Deterministic pricing
- [ ] Quotes and bounded negotiation

## Phase 6 — Messaging and follow-up

- [ ] WhatsApp adapter after OD-005 approval
- [ ] Signature verification, templates and delivery callbacks
- [ ] Policy-based contact/follow-up after OD-006 approval
- [ ] Rate limiting, retry, DLQ and redrive operations

## Phase 7 — Job Ready and operations UI

- [ ] Acceptance evidence and job snapshots
- [ ] Review queue, takeover and operational controls
- [ ] Lead/conversation/requirement/quote/audit views
- [ ] RBAC and sensitive-data masking

## Phase 8 — Evaluation and controlled pilot

- [ ] Regression/adversarial/risk datasets
- [ ] Load, failure-recovery and security testing
- [ ] Funnel, quality, cost and safety dashboards
- [ ] Synthetic pilot, then approval-gated real-data pilot
- [ ] Gradual feature-flag expansion with rollback criteria

Future worker, matching, contract, payment and incident capabilities begin only
after V1 evidence and separate domain decisions.
