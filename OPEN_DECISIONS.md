# Open Decisions

Do not hard-code unresolved business/legal choices. `Blocking point` identifies
the latest phase that can safely proceed without an answer.

## OD-001 — V1 service catalogue

- Status: Open
- Owner: Product
- Blocking point: Requirement/Pricing pilot
- Question: Which service categories launch in V1?
- Safe default: Build category schemas dynamically; activate only
  `REGULAR_HOME_HELPER` in development.

## OD-002 — Pricing and margin policy

- Status: Open
- Owner: Business/Finance
- Blocking point: Production quote generation
- Needed: price inputs, taxes, list/target/minimum prices, discount authority,
  minimum margin, validity and exception approval.
- Safe default: No production price or autonomous negotiation.

## OD-003 — Legal business role and approved language

- Status: Legal review required
- Owner: Legal/Product
- Blocking point: Production customer communication
- Needed: intermediary/employer role, approved/restricted terms, liability,
  replacement, cancellation, refund and dispute language.
- Safe default: Informational sandbox messages only; no contractual claims.

## OD-004 — KVKK privacy lifecycle

- Status: Legal/security review required
- Owner: Data controller/Legal/Security
- Blocking point: Real personal data ingestion
- Needed: processing purposes/legal bases, notice/consent flow, source legality,
  retention, deletion/anonymization, data-subject requests, processor inventory,
  cross-border transfer and AI-provider terms.
- Safe default: Synthetic data only outside an approved controlled pilot.

## OD-005 — WhatsApp operating model

- Status: Open
- Owner: Operations/Marketing/Legal
- Blocking point: WhatsApp production integration
- Needed: Meta business/WABA ownership, provider choice, verified number,
  opt-in evidence, template catalogue, 24-hour window rules and unsubscribe.
- Safe default: Mock messaging adapter.

## OD-006 — Contact and follow-up policy

- Status: Open
- Owner: Marketing/Operations/Legal
- Blocking point: Automated outreach
- Needed: permitted sources, contact hours/timezone, attempt limits, cadence,
  suppression, opt-out keywords and dormant criteria.
- Safe default: Automation disabled by feature flag.

## OD-007 — Risk enforcement matrix

- Status: Open
- Owner: Operations/Safety/Legal
- Blocking point: Automated block/review
- Needed: signal weights, decay, thresholds, mandatory reviews, evidence
  retention, appeal/reversal and false-positive monitoring.
- Safe default: Detection and review only; no automatic punitive block.

## OD-008 — Company facts approval workflow

- Status: Open
- Owner: Operations/Marketing
- Blocking point: AI factual company claims
- Needed: fact owners, evidence, effective/expiry dates and approval roles.
- Safe default: No quantitative claims.

## OD-009 — Admin identity and roles

- Status: Open
- Owner: Security/Operations
- Blocking point: Admin pilot
- Needed: identity provider, MFA, roles, sensitive-field masking and break-glass.
- Safe default: No public admin deployment.

## OD-010 — Infrastructure and data residency

- Status: Open
- Owner: Engineering/Security/Legal
- Blocking point: Shared staging with personal data
- Needed: cloud/account, region, managed PostgreSQL/Redis, secret manager,
  backup/RPO/RTO, domains, email/alerting and budget.
- Safe default: Local containers and synthetic fixtures.

## OD-011 — AI provider policy

- Status: Open
- Owner: Engineering/Security/Legal/Finance
- Blocking point: Real-data AI processing
- Needed: providers/models, data retention/training terms, region, fallback,
  budget/limits, redaction requirements and human-review threshold.
- Safe default: Provider abstraction with a deterministic fake.

## OD-012 — Analytics and experimentation

- Status: Open
- Owner: Product/Marketing
- Blocking point: Pilot reporting
- Needed: canonical funnel definitions, attribution model, event retention,
  dashboards, experiment guardrails and privacy limits.
- Safe default: First-party operational events only.

## Decision process

Accepted decisions move to `docs/adr/` when architectural, or to a versioned
policy/config when operational. This file retains a short resolution link and
date so the decision history remains discoverable.
