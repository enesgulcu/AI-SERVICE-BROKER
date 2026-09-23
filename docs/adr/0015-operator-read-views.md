# ADR-0015: Operator read views omit sensitive values

- Status: Accepted. The empty quote-list sentence is superseded by ADR-0016.
- Date: 2026-09-23

## Context

Operators can read a masked lead and the review queue. Conversation,
requirement, quote, and audit reads were missing. OD-009 still blocks admin
login. Requirement field values stay out of events.

## Options considered

- Return stored field values and message bodies to any caller.
- Wait for RBAC before any additional read.
- Add reads that keep the lead id and operational facts, and omit phone,
  message body, listing text, and requirement field values.

## Decision

`GET /v1/leads/{id}/requirements/view` returns schema, readiness, counts, and
special-requirement codes. `GET /v1/leads/{id}/conversations/view` returns
mock channel, control mode, and message count. `GET /v1/leads/{id}/quotes/view`
returns an empty list because no quote is issued. `GET /v1/leads/{id}/audit`
returns workflow action, reason code, and time for that lead. There is no
admin login.

## Consequences

A later RBAC layer can authorize these reads. It must not widen them to field
values or message bodies without a separate decision.

## Validation and rollback

The qualification API test checks that hours, phone, and listing text are
absent. Rollback is to remove the four routes.
