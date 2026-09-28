# ADR-0017: Controllable synthetic automation

- Status: Accepted
- Date: 2026-09-28
- Supersedes: the sentence in ADR-0007 that `AUTO_FIRST_CONTACT` cannot skip the human approval path

## Context

The synthetic path can already move a lead when a person calls each step. The
operator asked for that path to run by itself while remaining stoppable.
Live WhatsApp, a company tariff, a legal contract, real personal data, and
invented customer facts stay out of scope.

## Decision

`AUTOMATION_MODE` defaults to `supervised`. In that mode
`POST /v1/automation/runs` returns `AUTOMATION_STOPPED`.

`autonomous` may act only when all of the following are true:

- `AUTOMATION_PAUSED` is false
- every conversation on the lead is `AI_ACTIVE`
- the lead source is synthetic
- the channel is `MOCK`
- the actor recorded in audit is `automation`

When `AUTO_FIRST_CONTACT` is also true, that actor may approve the existing
sandbox draft. The draft text, guards, and mock delivery do not change.

The run performs one allowed step and stores it under the idempotency key:

- `NEW` or `CONTACT_PENDING`: approve the sandbox first contact
- `CONTACTED`: wait for a recorded customer interest
- `INTERESTED` or `QUALIFYING`: wait for a confirmed requirement
- `QUALIFIED`: issue the existing non-binding sandbox quote
- `QUOTE_SENT` or `NEGOTIATING`: plan one unsent mock follow-up
- `QUOTE_READY`: wait, because the fixture quote is already in progress
- `CUSTOMER_ACCEPTED`: wait for a human acceptance decision
- `JOB_READY`: complete
- review or closed statuses: stop

The run does not invent interest, requirement facts, a discount, or
acceptance. It does not send WhatsApp or a binding price. `GET /v1/automation/policy`
exposes the mode, the pause, and `autoFirstContact` without secrets.

## Consequences

A pause or `HUMAN_CONTROL` stops the next run. The default remains supervised,
so existing human-operated tests stay valid. Production outreach still waits
on the open commercial and legal decisions.
