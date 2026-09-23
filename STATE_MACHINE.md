# Workflow State Machine

Status: Initial V1 contract

## States

- `NEW`: normalized lead has been accepted.
- `ANALYZED`: analysis completed or safely marked for review.
- `CONTACT_PENDING`: eligible and awaiting outreach.
- `CONTACTED`: first outbound contact accepted for delivery.
- `NO_RESPONSE`: follow-up policy currently applies.
- `INTERESTED`: customer confirmed an active need.
- `QUALIFYING`: progressive requirement collection is active.
- `QUALIFIED`: minimum category-specific information is confirmed.
- `QUOTE_READY`: deterministic price and scoped quote exist.
- `QUOTE_SENT`: quote accepted for delivery.
- `NEGOTIATING`: objection/concession workflow is active.
- `CUSTOMER_ACCEPTED`: customer accepted an exact quote version.
- `JOB_READY`: validated job snapshots were created.
- `CLOSED_LOST`: terminal commercial outcome with reason.
- `BLOCKED`: automation/contact prohibited by policy.
- `MANUAL_REVIEW`: automated progression is suspended for review.

Control mode is orthogonal: `AI_ACTIVE | HUMAN_CONTROL | PAUSED`.
`CUSTOMER_ACCEPTED` is an operational workflow fact, not proof that a legally
binding contract or payment obligation exists; that meaning requires OD-014.

## Normal progression

`NEW → ANALYZED → CONTACT_PENDING → CONTACTED`

From `CONTACTED`:

- customer confirms need: `INTERESTED`
- no reply under follow-up policy: `NO_RESPONSE`
- no longer interested/ineligible: `CLOSED_LOST`

`INTERESTED → QUALIFYING → QUALIFIED → QUOTE_READY → QUOTE_SENT`

From `QUOTE_SENT`:

- objection/counteroffer: `NEGOTIATING`
- exact quote accepted: `CUSTOMER_ACCEPTED`
- rejected/expired with no viable alternative: `CLOSED_LOST`

`NEGOTIATING → QUOTE_READY | CUSTOMER_ACCEPTED | CLOSED_LOST`

`CUSTOMER_ACCEPTED → JOB_READY`

## Interrupt transitions

Any nonterminal state may enter:

- `MANUAL_REVIEW` when policy requires human judgment
- `BLOCKED` when an authorized deterministic policy prohibits continuation
- `CLOSED_LOST` for withdrawal, invalid contact, duplicate or configured reason

`MANUAL_REVIEW` can return only to an explicitly selected allowed state, or move
to `BLOCKED`/`CLOSED_LOST`. Review resolution records actor, reason and evidence.

`NO_RESPONSE` may return to the previous active stage when the customer replies.
The previous state must be stored; it must not be guessed.

## Transition guards

- Every command supplies expected workflow version and idempotency key.
- Transition definitions are versioned and executed by the workflow module.
- Side effects run from outbox events after the transition commits.
- `QUALIFIED` requires the active service schema's minimum confirmed fields.
- `QUOTE_READY` requires a successful deterministic pricing result.
- `CUSTOMER_ACCEPTED` references an unexpired exact quote version and explicit
  acceptance evidence.
- `JOB_READY` requires accepted requirement/quote snapshots, risk clearance and
  no pending mandatory review.
- `BLOCKED` requires an authorized policy action; an LLM score alone is invalid.
- Kill switch or `HUMAN_CONTROL` prevents automated outbound delivery.

## Terminal semantics

`JOB_READY`, `CLOSED_LOST` and `BLOCKED` are terminal for the workflow instance.
Reactivation starts a new workflow linked to the prior one unless an approved
transition-policy version explicitly permits reopening.

## Implemented policy `workflow-v1`

Human commands may record `INTERESTED` and `NO_RESPONSE` from `CONTACTED`,
`MANUAL_REVIEW` from a non-terminal state, and `CLOSED_LOST` with a fixed
reason. A held state returns only to its stored resume state. First contact
keeps `NEW → CONTACT_PENDING → CONTACTED`.

`INTERESTED → QUALIFYING` starts requirement collection. `QUALIFYING → QUALIFIED`
happens only inside requirement confirmation, after the home-helper schema is
ready. The public workflow command cannot set `QUALIFIED`.

`ANALYZED`, quote states, `CUSTOMER_ACCEPTED`, `JOB_READY`, and `BLOCKED` stay
closed. No workflow command sends a message.

## Future workflow

Worker search, reservation, matching, readiness, active service, incidents and
completion use a separate fulfilment workflow. They must not overload the V1
sales workflow states.
