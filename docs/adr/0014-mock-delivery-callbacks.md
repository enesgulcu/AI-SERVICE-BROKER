# ADR-0014: Approved template catalogue and mock delivery callbacks

- Status: Accepted
- Date: 2026-09-23

## Context

Outbound assessment treated any caller-supplied approval flag as a template.
Provider delivery callbacks were not recorded. OD-005 still blocks WhatsApp.

## Options considered

- Keep the boolean flag. A caller could approve an unknown template.
- Accept WhatsApp callback payloads and store them unused.
- Approve one mock template version and record only mock delivery callbacks.

## Decision

The only approved template is `sandbox-first-contact-v1` on channel `MOCK`.
`POST /v1/delivery-callbacks` accepts `DELIVERED` or `FAILED` for that
template. The same provider event id is idempotent. A different status or
template for that id is a conflict. The row stores no message body. WhatsApp
is refused. No customer message is sent.

## Consequences

A later template is a catalogue entry plus an approved channel. Callback
storage is migration `0007_delivery_callbacks.sql`.

## Validation and rollback

Unit tests cover the catalogue and idempotent callback store. An API test
covers create, replay, and WhatsApp refusal. Rollback is to stop the route
and leave the table unused.
