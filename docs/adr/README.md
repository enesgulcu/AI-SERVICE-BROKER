# Architecture Decision Records

ADRs preserve why consequential technical decisions were made.

## Lifecycle

1. Copy `template.md` and assign the next four-digit number.
2. Use status `Proposed` while discussion is open.
3. Change to `Accepted` only when the decision is authorized.
4. Never rewrite history. A replacement ADR marks the old record `Superseded`
   and links both directions.

Small implementation details do not need ADRs. Use ADRs for choices that affect
module boundaries, data, security, reliability, deployment or major technology.

## Accepted records

- ADR-0001 modular monolith and TypeScript
- ADR-0002 transactional outbox and inbox
- ADR-0003 versioned policy and configuration
- ADR-0004 AI authority boundary
- ADR-0005 requirement version storage
- ADR-0006 PostgreSQL, SQL-first migrations
- ADR-0007 guarded first contact
- ADR-0008 synthetic inbound recording
- ADR-0009 conversation control and kill switch
- ADR-0010 versioned workflow transitions, requirement sentence superseded by ADR-0011
- ADR-0011 safe completion boundary
