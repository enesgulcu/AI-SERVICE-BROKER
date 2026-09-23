# ADR-0009: Conversation control and kill switch

- Status: Accepted
- Date: 2026-09-23

## Context

Operators need to stop automation for one conversation, and a global pause must
stop automation from being turned back on. Production admin login remains
OD-009. WhatsApp delivery remains OD-005. The state machine already treats
control mode as separate from lead status: `AI_ACTIVE`, `HUMAN_CONTROL` or
`PAUSED`.

## Decision

A conversation control command changes only that mode. It uses the expected
version and an idempotency key. The same request replays. A different request
with the same key conflicts. The same mode does not consume a new version.

`AUTOMATION_PAUSED` blocks a change to `AI_ACTIVE`. `HUMAN_CONTROL` and
`PAUSED` remain available while the switch is on. Automated reply is allowed
only for `AI_ACTIVE` while the switch is off. This command does not send a
message.

The outbox event carries the conversation id, mode and version. The audit entry
carries the actor and reason code. Neither carries a phone number or message
body.

## Consequences

Taking over a conversation is an audited, versioned fact. Outbound delivery
still has to consult this mode before any future send. Admin authentication is
unchanged: the actor id is a record, not a login.
