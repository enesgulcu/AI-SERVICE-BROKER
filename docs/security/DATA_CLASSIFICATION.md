# Data Classification

## Classes

### Public

Approved marketing content and deliberately published company facts.

### Internal

Architecture, non-sensitive operational metrics, generic prompts, feature
configuration and development documentation.

### Confidential

Lead source data, conversations, requirements, preferences, quotes, jobs,
company policies, pricing logic, risk reasons and non-public analytics.

### Restricted

Direct identifiers, phone numbers, addresses, identity documents, sensitive
incident content, authentication data, access tokens, secrets and payment data.
Health/disability information, child data, photos/media and third-party
household information are restricted and may also require special legal
treatment.

## Handling baseline

- Collect only for an approved purpose and retain only as long as required.
- Restricted values are never included in source control, URLs or routine logs.
- Logs use opaque entity IDs; message bodies and raw provider payloads require
  explicit protected storage and access.
- AI providers receive the minimum necessary fields after redaction/pseudonymity
  controls defined by the approved processing policy.
- Production access uses least privilege and records sensitive reads/exports.
- Non-production uses synthetic data unless an explicitly approved exception
  provides equivalent controls.
- Backups, exports and dead-letter payloads inherit the source classification.
- Deletion/anonymization must cover primary records, projections, caches and
  operational copies according to the approved retention schedule.
- Audit entries contain opaque identifiers and reason codes where possible;
  identifying evidence is stored separately so lawful erasure/anonymization
  does not require rewriting business history.
- Unexpected media or special-category data is quarantined from AI processing
  until an approved policy determines handling.

## Prohibited until approved

- Real customer data in local developer environments
- Personal data in analytics/telemetry vendors by default
- Full conversations in error reports
- Secrets in `.env` files shared through chat or committed to Git
- Model training/fine-tuning on customer data
- Cross-border transfer without the required legal and security assessment
- Collection of protected-trait worker preferences without an approved,
  objectively necessary and lawful policy
