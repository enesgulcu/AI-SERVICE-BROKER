# ADR-0010: Versioned workflow transitions

- Status: Accepted, partially superseded by ADR-0011
- Date: 2026-09-23

## Context

The sales workflow has more states than first contact. Quote, acceptance, job
creation, analysis, requirements, and policy blocks each depend on a decision
that is still open. Those transitions must fail closed instead of being
invented. First contact already owns `NEW`, `CONTACT_PENDING`, and `CONTACTED`.

## Decision

Workflow policy `workflow-v1` is the only transition catalogue. A human command
supplies the expected lead version and an idempotency key.

Allowed moves are interest after contact, no response after contact, manual
review, a closed outcome with a fixed reason, and a return only to the stored
resume state. The first-contact edges stay on the contact flow.

`ANALYZED`, quote states, `CUSTOMER_ACCEPTED`, `JOB_READY`, and `BLOCKED`
return a gate code and write nothing. Public workflow commands cannot set
`QUALIFIED`. Requirement collection is defined in ADR-0011. Closing a lead
does not create a contract or a job.

The outbox event carries statuses, the policy version, and the reason code. It
does not carry the phone, name, or message body.

## Consequences

Later pricing, requirement, and policy work can open a gate by superseding this
policy version. Existing leads keep their version, and a stale command conflicts.
