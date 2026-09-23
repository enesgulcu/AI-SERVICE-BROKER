# AI Service Broker

An auditable AI-assisted commercial operations system that converts service
leads into safe, structured and commercially viable `JOB_READY` records.

## Current state

The project is in foundation development. It does not yet process real customer
data or send production messages. See `PROJECT_STATUS.md` and `ROADMAP.md`.

## Prerequisites

- Node.js 22 or newer
- pnpm 11.5.3 through Corepack
- Docker Desktop (required from PostgreSQL/Redis integration work onward)

## Start

```bash
pnpm install
pnpm check
pnpm --filter @ai-service-broker/api dev
```

API liveness: `GET http://localhost:3000/health/live`

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

Do not use real personal data until the legal/privacy and infrastructure gates
listed in `OPEN_DECISIONS.md` are resolved.
