# Quality Gates

## Definition of ready

A work item has an outcome, acceptance criteria, owner, affected modules,
decision/policy references, data/security impact and rollout expectation.
Unknown business or legal choices are linked to `OPEN_DECISIONS.md`.

## Definition of done

- Acceptance criteria and failure paths are implemented.
- Module boundaries and deterministic authority rules are preserved.
- Unit tests cover domain invariants; integration/contract tests cover changed
  boundaries; regression scenarios cover changed AI behavior.
- Format, lint, type-check, tests and build pass through `pnpm check`.
- Security/privacy, observability, migration and rollback impacts are handled.
- API/event/schema changes are versioned and documented.
- `PROJECT_STATUS.md`, `CHANGELOG.md` and relevant specifications are updated.
- Production-impacting automation is feature-flagged and has kill-switch scope.

## CI gates

Every change must pass:

1. Reproducible frozen-lockfile installation
2. Formatting check
3. ESLint without automatic mutation
4. Strict TypeScript type-check
5. Unit and in-process end-to-end tests
6. Production build
7. Dependency and secret scanning

CI also runs the Postgres 16 integration test, the secret scan, and
`pnpm audit --prod --audit-level high`. Architecture-boundary, conversation
regression, and adversarial tests run inside `pnpm check`. A production soak
and a backup restore are not claimed.

## Review triggers

Mandatory specialist/human review applies to:

- Personal-data purpose, retention, sharing or provider changes
- Customer-facing legal, liability, refund or guarantee language
- Authentication, authorization, cryptography or secret handling
- Financial policy, pricing bounds and monetary migrations
- Automatic risk blocking or enforcement thresholds
- Irreversible migrations and destructive operational tooling
- New external processors/providers and production outbound channels

## Release controls

- Deploy immutable artifacts through development → staging → production.
- Migrations must be backward-compatible where possible and include rollback or
  forward-recovery instructions.
- Feature flags default off for new autonomous behavior. `AUTOMATION_PAUSED=true`
  stops automated outbound delivery and the outbox drain, and blocks a return
  to `AI_ACTIVE`. `PERSONAL_DATA_MODE=synthetic` blocks real lead sources.
  `WEBHOOK_SECRET` empty rejects every inbound webhook. No flag turns on
  live WhatsApp, an approved company tariff, or a legal contract. The sandbox
  quote and the sandbox WhatsApp record do not open either. Rollback is to set
  `AUTOMATION_PAUSED=true` and leave personal data in synthetic mode.
- Define measurable success, guardrail and rollback thresholds before pilots.
- Record release version, config/policy versions and verification evidence.

## Real-data and outbound go-live gates

No production lead ingestion or outbound customer message is permitted until:

1. Source-specific acquisition/contact authority, IYS/6563 treatment, proof of
   permission, opt-out and suppression behavior have written legal approval.
2. KVKK inventory, notice, processing conditions, retention/destruction,
   data-subject request and cross-border processor controls are approved.
3. WhatsApp opt-in, approved templates, 24-hour window, unsubscribe, quality
   and rate-limit rules are enforced and tested.
4. Production admins use MFA and least-privilege RBAC; restricted reads and
   exports are audited.
5. Webhook signature, timestamp/replay protection, inbox idempotency,
   conversation locking and transactional outbox tests pass.
6. Guard or policy service failure prevents delivery; it never fails open.
7. Human takeover, kill switch, queued-message cancellation, DLQ recovery and
   backup restore procedures are exercised.
8. Model/provider terms prohibit unauthorized training and satisfy approved
   retention, subprocessor, region and transfer requirements.

## Commercial and safety go-live gates

- Price, discount, tax, margin and exception rules are deterministic, versioned
  and approved.
- Quote scope, period, tax treatment, validity and acceptance semantics are
  explicit and customer-confirmed.
- `JOB_READY` requires confirmed scope, price, start date, contact eligibility
  and no pending mandatory review.
- Risk score alone cannot punish or block; enforcement is policy-authorized,
  explainable, appealable and monitored for false positives/fairness.
- Protected-trait preferences are rejected or reviewed under approved policy.
- Dashboards include opt-out, complaints, wrong-price events, guard blocks,
  review SLA, false positives and delivery quality—not conversion alone.
