# Project Status

Last updated: 2026-09-23  
Current phase: Phase 2 — First vertical slice: controlled lead contact  
Overall status: In progress

## Current objective

Complete persistence for idempotent lead intake, then expose a controlled
synthetic ingestion API. Real personal data remains blocked.

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

## In progress

- Container-backed PostgreSQL/Redis verification
- Controlled lead ingestion HTTP API

## Next

1. Verify Compose, migrations, and repository behavior after Docker is available.
2. Expose the idempotent lead ingestion API with human-approval defaults.
3. Add module-boundary architecture tests.
4. Complete the conversation/risk evaluation catalogue.

## Current blockers

Docker is not installed on the current machine, so local PostgreSQL/Redis and
container-backed integration tests cannot yet be verified. Foundation work can
continue meanwhile. Real-data ingestion, production messaging, pricing and
autonomous outreach remain blocked by decisions in `OPEN_DECISIONS.md`.
The highest-priority approvals are source/contact legality, KVKK and
cross-border processing, and WhatsApp opt-in/template operation.

## Verification

Verified on 2026-09-23:

- `pnpm check`: passed (format, lint, type-check, 37 unit tests, 5 API end-to-end
  tests and production builds)
- `pnpm audit --prod --audit-level high`: passed with no known vulnerabilities
- Node.js `v22.15.0`, pnpm `11.5.3`
- Docker Compose and live PostgreSQL/Redis were not verified on this machine
