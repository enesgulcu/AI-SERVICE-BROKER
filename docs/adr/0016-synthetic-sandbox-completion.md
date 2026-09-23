# ADR-0016: Synthetic sandbox completion

- Status: Accepted
- Date: 2026-09-23
- Supersedes: the fail-closed quote, follow-up, acceptance, and `JOB_READY` sentences of ADR-0011 for synthetic leads only

## Context

The checklist still had quote, negotiation, follow-up, provider handoff, a
WhatsApp adapter, acceptance, job snapshots, operator roles, a real-data gate,
and a Postgres integration test. Those production decisions stay open. The
synthetic path can still exercise the machinery without inventing a tariff, a
contract, a live WhatsApp call, or an identity provider.

## Decision

`sandbox-rate-card-v1` prices one minor currency unit per whole hour. It is a
fixture, `binding: false`, `tariff: false`, and it is selected only for a
synthetic qualified lead. A request without a lead still returns
`PRICING_NOT_AVAILABLE`. Negotiation accepts zero discount basis points and
refuses any positive discount. `sandbox-follow-up-v1` may plan one `MOCK`
reminder and does not send it.

WhatsApp live delivery stays `UNSAFE_CHANNEL`. `mode: sandbox` records
`WHATSAPP_SANDBOX` with `network: false`. The worker hands a published event to
the mock provider and refuses any other channel.

Acceptance stores an operational snapshot with `contract: false` and then sets
`JOB_READY`. It is not a legal contract. Company facts stay empty.

`OPERATOR_AUTH=token` requires a bearer token. A viewer may read. A viewer may
not write. The default remains `disabled`. This is not the OD-009 identity
provider.

`PERSONAL_DATA_MODE=approved` accepts a non-synthetic source only when
`X-Pilot-Approval` matches `PILOT_APPROVAL_ID`. The default mode stays
`synthetic`.

Postgres integration coverage migrates, inserts one quote row, and deletes that
row. CI runs it against a Postgres service container.

## Consequences

A synthetic lead can reach an operational `JOB_READY` record. OD-002, OD-004,
OD-005, OD-006, OD-009, OD-013, and OD-014 stay open for any production tariff,
live WhatsApp, legal contract, identity provider, or real personal data.
