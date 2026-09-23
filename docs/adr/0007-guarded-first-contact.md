# ADR-0007: Guarded synthetic first contact

- Status: Accepted
- Date: 2026-09-23

## Context

The first vertical slice must show how a lead becomes `CONTACTED` without
opening real personal-data processing, autonomous outreach, or production
messaging. Those choices remain OD-003, OD-005, OD-006, OD-013 and OD-019.

## Decision

First contact is a separate application flow. It may read and advance a lead
only through the lead aggregate's transition methods. It does not own lead
ingestion.

A synthetic or test lead can move `NEW → CONTACT_PENDING → CONTACTED` only when
all of the following are true:

- the source is still approved for sandbox contact,
- the draft is exactly the versioned sandbox template,
- the template states that it is automated, offers a human, and makes no
  promise,
- a human records an approval before the review expires,
- delivery is recorded on the mock channel in the same transaction as the state
  change, audit entry and outbox event.

Rejection and expiry release the lead back to `NEW` and do not send. Expiry
never approves. `AUTO_FIRST_CONTACT` cannot skip this path. Raw source payloads
stay in a separate evidence table and out of events and audit entries.

## Consequences

The contact flow depends on the lead aggregate, not the other way around.
Production WhatsApp, unapproved sources and contractual language stay blocked
until their open decisions are accepted. Container-backed database tests are
still required before this path is treated as production-ready.
