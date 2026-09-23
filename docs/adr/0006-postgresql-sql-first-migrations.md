# ADR-0006: SQL-first PostgreSQL persistence

- Status: Accepted
- Date: 2026-09-23

## Context

Correctness depends on PostgreSQL uniqueness, transactions and JSONB behavior.
Module ownership and auditable migrations are more important than hiding SQL
behind an ORM. Migration history must be deterministic and tamper-evident.

## Decision

Use `pg` with explicit SQL repositories/adapters. Keep forward-only numbered SQL
migrations under `packages/postgres/migrations`.

The migration runner:

- takes a PostgreSQL advisory lock,
- creates a migration ledger when absent,
- applies files in lexical order inside individual transactions,
- stores a SHA-256 checksum,
- refuses to continue if an applied file's checksum changes.

Database constraints remain the final defense for uniqueness and valid states.
Domain code has no PostgreSQL dependency; infrastructure implements its ports.

## Consequences

SQL behavior is visible and reviewable, and no ORM-generated query can bypass
intentional boundaries. Mapping and query code is more explicit. Production use
requires container-backed migration and repository integration tests before the
adapter is wired into the API.
