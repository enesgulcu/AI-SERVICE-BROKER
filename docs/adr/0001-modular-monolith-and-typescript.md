# ADR-0001: TypeScript modular monolith

- Status: Accepted
- Date: 2026-09-23

## Context

The product must reach a controlled pilot quickly while supporting substantial
change in pricing, policy, risk, service categories, channels and future worker
operations. It also needs strong transaction boundaries, auditability and
independent background processing.

## Decision

Use a pnpm TypeScript monorepo with NestJS API/worker applications, a Next.js
admin application, PostgreSQL, Redis and BullMQ.

Implement backend capabilities as explicit modules using domain/application/
adapter layering. Modules own their writes and communicate via public contracts
and domain events. Deploy the API and queue worker separately while retaining a
single repository and database in V1.

## Consequences

Positive:

- Fast development and shared type/tooling ecosystem
- Local transactions for critical workflows
- Lower operational overhead than microservices
- Clear extraction path through ports, contracts and outbox events

Costs:

- Module boundaries require automated enforcement and review
- Shared database needs strict ownership discipline
- CPU-heavy workloads may later require another runtime/service

## Revisit when

A module requires independently measured scaling, deployment cadence, data
residency, failure isolation or team ownership that the modular monolith cannot
provide economically.
