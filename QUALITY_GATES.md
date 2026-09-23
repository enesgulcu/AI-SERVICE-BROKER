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

Later phases add database integration, migration, architecture-boundary,
conversation regression, adversarial, load and recovery tests.

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
- Feature flags default off for new autonomous behavior.
- Define measurable success, guardrail and rollback thresholds before pilots.
- Record release version, config/policy versions and verification evidence.
