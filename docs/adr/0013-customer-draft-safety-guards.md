# ADR-0013: Customer-draft safety guards

- Status: Accepted
- Date: 2026-09-23

## Context

ADR-0004 requires every customer-visible draft to pass deterministic promise,
legal-language, policy, and risk guards. The first-contact template check
covers the sandbox wording. It does not reject a legal admission, an
unapproved company fact, or sensitive or abusive language on its own.

## Options considered

- Leave those checks inside the first-contact template. A later message path
  could skip them.
- Block the lead when risk language appears. OD-007 forbids an automatic
  punitive block.
- Put one fail-closed guard in the safety module and require the contact flow
  to call it before a mock delivery.

## Decision

`guardCustomerDraft` uses policy `policy-empty-v1`. An empty draft is
rejected. Promise, legal-commitment, numeric company-fact, and sensitive or
abusive language are rejected. A rejection stops that draft. It does not set
the lead to `BLOCKED`, issue a quote, or open WhatsApp. The sandbox first
contact calls this guard together with the template check, both when the
draft is prepared and when a human approves it.

## Consequences

Another customer-visible path must call the same guard before delivery. Guard
failure prevents delivery. Approved commercial or legal wording still needs
OD-003 and an approved policy version.

## Validation and rollback

Unit tests cover the sandbox draft and each rejection class. Rollback is to
stop calling the guard; the empty policy and closed quote path stay in place.
