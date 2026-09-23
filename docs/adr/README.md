# Architecture Decision Records

ADRs preserve why consequential technical decisions were made.

## Lifecycle

1. Copy `template.md` and assign the next four-digit number.
2. Use status `Proposed` while discussion is open.
3. Change to `Accepted` only when the decision is authorized.
4. Never rewrite history. A replacement ADR marks the old record `Superseded`
   and links both directions.

Small implementation details do not need ADRs. Use ADRs for choices that affect
module boundaries, data, security, reliability, deployment or major technology.
