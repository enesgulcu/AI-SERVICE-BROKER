# ADR-0011: Safe completion boundary

- Status: Accepted, quote and job sentences superseded for synthetic leads by ADR-0016
- Date: 2026-09-23
- Supersedes: the requirement-state sentence of ADR-0010

## Context

The sales path can collect a home-helper requirement and record risk without
inventing a price, a contract, a WhatsApp integration, or a legal promise.
Those decisions remain open. The public workflow command must not be able to
mark a lead qualified by itself.

## Decision

Requirement schema `regular-home-helper-v1` accepts human-confirmed days,
hours, and start date. A fake model may attach evidence below confidence 1.
It cannot turn free text into a fact. Special requirements are only `LIVE_IN`,
`CHILDCARE`, and `COOKING`. Each version is immutable. Confirmed schedule
fields are also stored in typed columns. Events carry the version, schema,
readiness, and missing count, not the field values.

`QUALIFIED` is reached only by the requirement confirmation use case after its
own readiness check. `POST /v1/leads/{id}/workflow-transitions` always passes
`requirementsReady` false.

Policy `policy-empty-v1` has no approved company fact. Risk signals stay in
`REVIEW` and never set `BLOCKED`. The price function is deterministic, but the
API passes no rate card, so quotes are not issued. Negotiation has no
concession authority. Follow-up stays unapproved.

Outbound delivery accepts a human-approved `MOCK` template. `WHATSAPP` and
unattended AI delivery are refused. A human first-contact approval remains a
mock delivery. Webhooks without a valid HMAC signature are rejected. An empty
`WEBHOOK_SECRET` rejects every webhook. Rate limiting applies to POST requests.
Dead-letter redrive is allowed only for an already-safe unpublished event and
is audited.

Operator reads mask the phone and omit listing text. There is no public admin
login.

## Consequences

The safe path can qualify a synthetic lead and stop. Price, WhatsApp, real
personal data, acceptance, and `JOB_READY` stay fail-closed until their open
decisions are approved.
