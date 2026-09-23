# AI Service Broker

An auditable AI-assisted commercial operations system that converts service
leads into safe, structured and commercially viable `JOB_READY` records.

## Current state

The safe path is in place: a synthetic lead can be qualified, and price,
WhatsApp, admin login, and real personal data stay closed. The roadmap
checklist is 42 of 58. See `PROJECT_STATUS.md` and `ROADMAP.md`.

## Prerequisites

- Node.js 22 or newer
- pnpm 11.5.3 through Corepack
- Docker Desktop, when using the local Compose database and Redis

## Start

Copy `.env.example` to `.env`. API, worker, and `pnpm db:migrate` read that
file when it exists. A hosted Postgres database needs `DATABASE_SSL=require`
and the direct host, not the pooled host. Leave `PERSONAL_DATA_MODE=synthetic`.

```bash
pnpm install
pnpm check
docker compose up -d
pnpm db:migrate
pnpm --filter @ai-service-broker/api dev
```

API health:

- Liveness: `GET http://localhost:3000/health/live`
- Readiness: `GET http://localhost:3000/health/ready`

Every HTTP response includes `x-correlation-id`; callers may supply a safe
correlation ID for cross-service tracing.

Synthetic lead intake:

```bash
curl -X POST http://localhost:3000/v1/leads \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: lead:demo-1" \
  -d '{"source":"SYNTHETIC","sourceReference":"demo-1","phone":"+905551112233"}'
```

Sandbox first contact still requires a human decision. Nothing is sent before
approval, and the only delivery channel is a mock adapter:

```bash
curl -X POST http://localhost:3000/v1/leads/<leadId>/contact-reviews \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: contact:demo-1" \
  -d '{"actorId":"operator-1"}'
```

An operator can take over a conversation. Nothing is sent:

```bash
curl -X POST http://localhost:3000/v1/conversations/<conversationId>/control \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: control:demo-1" \
  -d '{"actorId":"operator-1","controlMode":"HUMAN_CONTROL","expectedVersion":1}'
```

A human can record a later workflow state. Quote, acceptance, and job states
stay closed, and this does not send a message:

```bash
curl -X POST http://localhost:3000/v1/leads/<leadId>/workflow-transitions \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: workflow:demo-1" \
  -d '{"actorId":"operator-1","toStatus":"CLOSED_LOST","expectedVersion":1,"reasonCode":"WITHDRAWN"}'
```

A confirmed home-helper requirement can move an interested synthetic lead to
`QUALIFIED`. The public workflow command cannot do that by itself. Quotes,
negotiation, follow-up, company facts, and WhatsApp stay closed:

```bash
curl -X POST http://localhost:3000/v1/quotes \
  -H "Content-Type: application/json" \
  -d '{"actorId":"operator-1"}'
```

The worker drains recorded events. It does not send a customer message. Set
`AUTOMATION_PAUSED=true` to leave those events unpublished and to record any
new inbound message with conversation control `PAUSED`. Use
`OUTBOX_PERSISTENCE=postgres` only when `DATABASE_URL` points at the same
database as the API.

Record a synthetic inbound message after a lead exists. The same provider
message id is replayed; a different body is rejected. No reply is sent:

```bash
curl -X POST http://localhost:3000/v1/inbox/messages \
  -H "Content-Type: application/json" \
  -d '{"leadId":"<leadId>","providerMessageId":"mock-1","body":"Merhaba"}'
```

Start the background worker separately:

```bash
pnpm --filter @ai-service-broker/worker dev
```

## Repository guide

- `MASTER_SPEC.md`: living product contract
- `ARCHITECTURE.md`: system boundaries and reliability design
- `DOMAIN_MODEL.md`: domain ownership and invariants
- `STATE_MACHINE.md`: workflow contract
- `AI_RULES.md`: model authority and safety rules
- `OPEN_DECISIONS.md`: decisions requiring approval
- `QUALITY_GATES.md`: definition of ready/done and release gates
- `PROJECT_STATUS.md`: current work and verification evidence
- `docs/adr/`: durable architecture decisions
- `packages/contracts`: versioned external/event schemas
- `packages/lead`: framework-independent lead domain and application logic
- `packages/postgres`: SQL migrations and lead, contact, inbox and outbox adapters

Do not use real personal data until the legal/privacy and infrastructure gates
listed in `OPEN_DECISIONS.md` are resolved.
