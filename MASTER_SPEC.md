# AI Service Broker — Living Master Specification

Status: Active  
Baseline: `SETUP_DOCUMENT.md` v1.0  
Last updated: 2026-09-23

## 1. Product outcome

AI Service Broker is not a chat bot. It is an auditable commercial operations
system that turns an inbound lead into a safe, commercially viable and
structured `JOB_READY` record.

V1 value stream:

`LEAD → ANALYSIS → CONTACT → QUALIFICATION → RISK → PRICING → NEGOTIATION → CUSTOMER_ACCEPTED → JOB_READY`

Worker sourcing, matching, contracts, payments and active-service operations
are future capabilities. V1 must leave explicit ports for them without
implementing speculative complexity.

## 2. Source-of-truth hierarchy

When documents disagree, use this order:

1. Applicable law and an approved legal decision
2. Accepted ADR and versioned policy
3. This document
4. Domain documents (`DOMAIN_MODEL.md`, `STATE_MACHINE.md`, `AI_RULES.md`)
5. `SETUP_DOCUMENT.md`
6. Implementation notes and code comments

An unresolved conflict must be recorded in `OPEN_DECISIONS.md`; it must not be
silently resolved in code.

## 3. Non-negotiable product rules

- AI communicates, extracts, summarizes, persuades and proposes.
- Deterministic services own money, authority, policy and enforcement.
- AI never invents company facts, financial limits or worker availability.
- AI never admits liability, guarantees an outcome or promises compensation.
- Requirements, quotes, policies and jobs retain immutable versions/snapshots.
- Material actions are idempotent, attributable and auditable.
- High-risk and low-confidence critical cases can stop automation and escalate.
- Human takeover and global/module kill switches override automation.
- Customer conversations remain short, natural and stage-aware.
- Data minimization and purpose limitation apply to all personal data.

## 4. V1 capabilities

### Included

- Normalized lead ingestion and analysis
- Customer and conversation resolution
- Progressive requirement collection
- Preferences, special requirements, confidence and contradiction detection
- Risk/anomaly signals and deterministic action policy
- Deterministic pricing and bounded negotiation
- Quote/version lifecycle and acceptance
- Job snapshot and `JOB_READY`
- WhatsApp provider adapter, webhook verification, deduplication and delivery
- Follow-up scheduling
- Human review/takeover, operational kill switches
- Audit events, decision explanations, metrics and admin operations

### Not included in the first delivery

- Autonomous worker matching or worker negotiation
- Payment, deposit, refund or cancellation execution
- Contract generation/signing
- Automated incident compensation or legal adjudication
- Microservice decomposition

## 5. Quality attributes

- **Safety:** deny by default for unauthorized financial/legal actions.
- **Modularity:** modules communicate through contracts, not internal storage.
- **Reliability:** transactional outbox, retries, dead-letter handling and locks.
- **Security:** least privilege, verified webhooks, protected secrets and PII logs.
- **Observability:** correlation IDs, structured logs, metrics and traces.
- **Performance:** asynchronous slow work; bounded context/token windows.
- **Changeability:** policy/config versioning, adapters and feature flags.
- **Explainability:** reason codes, model metadata and source references; no
  private chain-of-thought storage.

## 6. Product metrics

North-star operational outcome: qualified, policy-compliant `JOB_READY` records.

Primary funnel:

- Lead → Contact → Reply → Qualified → Quote → Deal → Job Ready
- Time to first message, qualification and deal
- Messages/questions to qualification and repeated-question rate
- Quote acceptance, average discount and average sale price
- Human escalation, unsafe-output prevention and risk detection rates
- Delivery failure, duplicate processing, AI latency/cost and queue age

Metrics must be segmented by source, service type, location, workflow version
and experiment where privacy permits.

## 7. Delivery policy

Work proceeds in thin, releasable slices. Every slice must include:

1. Accepted scope and decision references
2. Domain/API/data changes and migration impact
3. Automated tests proportional to risk
4. Security/privacy and observability review
5. Documentation, status and changelog update
6. Rollback or feature-flag strategy for production-impacting behavior

Current delivery state is tracked in `PROJECT_STATUS.md`.

## 8. Implementation snapshot — 2026-09-23

Section 4 is the V1 target. It is not a claim that every capability is built.

Built for synthetic data:

- Lead intake, guarded mock first contact, inbox, and conversation control
- Workflow through `INTERESTED`, then home-helper qualification to `QUALIFIED`
- Review-only risk signals, masked operator reads, rate limiting, and audited
  redrive of already-safe dead letters

Fail-closed until an open decision is approved:

- Real personal data, WhatsApp, an issued quote, negotiation, follow-up, and
  company facts
- Acceptance, `JOB_READY`, and admin login

Roadmap checklist: 42 of 58. `pnpm check` passed with 100 unit tests and 20 API
end-to-end tests. Hosted Postgres has migrations `0001` through `0006`. Docker
and Redis on this machine are still unverified. Detail and the remaining
blockers are in `PROJECT_STATUS.md` and `ROADMAP.md`.
