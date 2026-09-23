# ADR-0002: Transactional outbox and inbox

- Status: Accepted
- Date: 2026-09-23

## Context

Webhook retries, queue retries and process failures can otherwise create
duplicate customer messages, quotes, jobs or missing events.

## Decision

Persist inbound idempotency records before processing. Persist aggregate changes
and outbound/domain-event outbox records in the same PostgreSQL transaction.
Workers publish/deliver outbox records asynchronously and idempotently.

Redis locks reduce concurrent work but are not the correctness boundary.
Database unique constraints, expected aggregate versions and idempotency keys
remain authoritative.

## Consequences

Delivery is at least once, so every consumer must be idempotent. Outbox backlog,
attempts, age, dead letters and redrive actions require monitoring and tooling.
