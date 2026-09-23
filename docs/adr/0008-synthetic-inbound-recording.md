# ADR-0008: Synthetic inbound recording

- Status: Accepted
- Date: 2026-09-23

## Context

A later conversation needs one customer for a phone number, one conversation for
that customer, and one stored copy of each provider message. Real messaging,
identity proof and automatic replies remain blocked by OD-005, OD-009 and
OD-013. ADR-0002 already requires inbox idempotency and a transactional outbox.

## Decision

Customer resolution and conversation recording stay in their own packages. The
PostgreSQL adapter is the only place that writes both, together with the inbox
row, outbox event and audit entry.

- A phone is stored on the customer record and hashed for lookup. The hash is
  not identity proof, so `identity_verified` stays false.
- The same phone reuses the customer and the mock conversation. The first
  message sets `AI_ACTIVE` or `PAUSED`; later messages keep that mode.
- `AUTOMATION_PAUSED` records the message as `PAUSED` and does not create a
  reply.
- Only `SYNTHETIC` and `TEST` leads can be linked.
- The same provider message id is a duplicate when the body and phone hash
  match, and a conflict when they do not. The transaction takes advisory locks
  on the phone hash and the provider message id.
- The inbox row is inserted as `PROCESSED` in that same transaction. Its
  payload reference is the message id, not the message body. There is no
  separate inbox worker yet.
- `InboundMessageRecorded` version 1 carries message, conversation, customer,
  mock channel and control mode. It does not carry the phone, body, name or raw
  payload.

## Consequences

Retries of the same inbound message do not create a second customer or
conversation. A changed body does not overwrite the first message. Outbound
delivery, webhook authentication and a separate inbox consumer remain later
work. Container-backed database tests are still required before this path is
treated as production-ready.
