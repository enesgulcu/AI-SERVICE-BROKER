# Architecture

Status: Proposed for V1  
Style: Modular monolith with ports and adapters

## 1. Technology baseline

- Runtime: Node.js LTS
- Language: TypeScript with strict mode
- Backend: NestJS
- Database: PostgreSQL
- Cache, distributed locks and queues: Redis + BullMQ
- Admin application: Next.js
- API: REST with OpenAPI
- Validation: Zod at untrusted boundaries
- Tests: Jest, integration tests with real PostgreSQL/Redis containers
- Workspace: pnpm monorepo

The stack optimizes delivery speed, type sharing and hiring availability while
preserving module boundaries. Technology changes require an ADR.

## 2. Deployment units

The repository will contain:

- `apps/api`: synchronous REST/webhook/admin API
- `apps/worker`: BullMQ consumers and scheduled work
- `apps/admin`: internal operations UI
- `packages/contracts`: stable DTOs, schemas and event contracts
- `packages/config`: validated configuration
- `packages/observability`: logging, metrics and tracing primitives
- `packages/testing`: test builders and integration harness

API and worker share domain packages initially but deploy independently. No
module may depend on an application entry point.

## 3. Backend module boundaries

- `lead`: ingestion, normalization and source provenance
- `customer`: identity/profile resolution and consent/contact state
- `conversation`: messages, summaries, lock orchestration and AI turn handling
- `requirement`: schemas, field evidence, versions and contradictions
- `company-fact`: approved factual claims
- `policy`: versioned rules and effective-date resolution
- `risk`: signals, anomalies, scores and deterministic actions
- `pricing`: deterministic calculations and financial constraints
- `negotiation`: offers, concessions and scope alternatives
- `quote`: immutable quote versions and acceptance
- `workflow`: allowed state transitions and transition history
- `job`: accepted requirement/quote snapshots and job readiness
- `messaging`: provider ports, webhook inbox and outbound delivery
- `follow-up`: policy-driven schedules and cancellation
- `review`: human escalation, takeover and kill switches
- `audit`: append-only audit/domain events and AI decision metadata
- `analytics`: privacy-aware operational and funnel projections
- `identity-access`: admin authentication, roles and permissions

Each module owns its persistence. Cross-module reads use public application
queries; cross-module writes use commands/events. Direct table access is
forbidden even while tables share one PostgreSQL database.

## 4. Layering

Within a module:

`domain ← application ← adapters/infrastructure ← delivery`

- Domain has no NestJS, ORM, queue or provider imports.
- Application coordinates use cases through ports.
- Adapters implement database, AI, messaging and queue ports.
- Delivery maps HTTP/queue inputs to application commands.
- Domain errors are explicit and translated only at delivery boundaries.

## 5. Critical message flow

1. Verify webhook signature and capture provider message ID.
2. Insert into the inbox with a unique provider constraint.
3. Resolve customer/conversation and acquire a bounded Redis lock.
4. Persist inbound message and load state + structured memory.
5. Ask AI for a schema-valid proposal; retry/repair boundedly.
6. Execute authorized tools through application services.
7. Run promise, legal, policy and risk guards on the draft.
8. Persist final message and outbox record in one transaction.
9. Deliver asynchronously; update delivery state idempotently.
10. Release lock and emit metrics/audit events.

No network call is made inside a long-running database transaction.

## 6. Reliability patterns

- Inbox/outbox for external and domain messages
- Unique idempotency keys for webhooks, commands and deliveries
- Optimistic concurrency/version columns for mutable aggregates
- Redis lease locks with owner tokens and safe release
- Exponential backoff with jitter and bounded retries
- Dead-letter queue with redrive tooling
- Timeouts, circuit breaking and provider-specific rate limits
- UTC persistence; explicit business timezone at presentation/policy boundaries

## 7. AI boundary

`AIProvider` is replaceable and has no database access. It receives the minimum
necessary context and returns schema-validated proposals. Tool authorization,
financial constraints, state transitions and final-message guards execute in
application/domain code. Prompt and model versions are attached to decisions.

## 8. Security and privacy

- RBAC and MFA-ready admin identity
- Environment-specific secret manager; no secrets in source/logs
- Encryption in transit and managed storage encryption
- PII classification, redaction and access audit
- Tenant/customer authorization on every read and mutation
- Webhook replay protection and rate limiting
- Dependency, secret, SAST and container scanning in CI
- Configurable retention, deletion/anonymization and export workflows

Legal basis, retention periods, WhatsApp consent/template rules and AI-provider
data-processing terms remain approval-gated decisions.

## 9. Evolution

Modules are extracted into services only when operational evidence warrants it:
independent scaling, ownership, release cadence, isolation or data residency.
Contracts and outbox events make extraction possible; V1 avoids distributed
transactions and premature infrastructure.
