# Changelog

All notable product, architecture and implementation changes are recorded here.
Dates use ISO 8601. This project has not released a production version.

## [Unreleased]

### Added — 2026-09-23

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
