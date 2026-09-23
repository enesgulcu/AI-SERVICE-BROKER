# Initial Threat Model

Status: Living document; must be reviewed before real-data pilot

## Assets

- Customer/worker identity and conversation data
- Contact permissions and suppression records
- Quotes, pricing limits, policy versions and company facts
- Admin sessions, provider credentials and signing secrets
- Workflow state, audit evidence and incident records
- Model prompts, tool permissions and operational controls

## Trust boundaries

- Lead source → ingestion API
- Meta/WhatsApp/provider → webhook endpoint
- Public API → application/domain modules
- Application → PostgreSQL/Redis/queue
- Application → AI provider
- Admin browser → admin API
- Worker process → external delivery/provider APIs

## Priority threats and controls

### Spoofed or replayed webhooks

Verify signatures against the raw body, enforce timestamp/replay windows, store
provider IDs uniquely, rate-limit and process through an inbox.

### Duplicate/concurrent AI replies

Use provider idempotency keys, conversation lease locks, optimistic versions and
transactional outbox delivery.

### Prompt injection and unauthorized tools

Treat all customer/source text as data. Use stage-specific allow-lists, typed
tool inputs, application authorization and post-generation guards. Never expose
secrets, hidden context, other records or internal limits to the model.

### Personal-data leakage

Minimize model context, redact logs, mask admin fields, authorize every read,
audit sensitive access, restrict exports and define retention/deletion.

### Pricing/policy bypass

Compute financial decisions deterministically, sign/reference immutable policy
versions and reject stale calculations or unauthorized exceptions.

### Account takeover and insider misuse

Use MFA-ready identity, least-privilege RBAC, short sessions, privileged-action
re-authentication, immutable audit events and break-glass monitoring.

### Queue and provider abuse

Authenticate producers, validate schemas, bound payloads/retries, isolate DLQs,
rate-limit destinations and require authorization for redrive.

### Supply-chain/secret compromise

Use frozen lockfiles, explicit dependency build allow-lists, scanning, protected
CI credentials, secret managers and rotation procedures.

### Availability/cost exhaustion

Apply request and token limits, timeouts, circuit breakers, queue backpressure,
budget alerts, bounded model retries and global/module kill switches.

### Audit tampering

Restrict append permissions, prohibit updates/deletes, export to protected
storage and correlate actor, request, policy, model and source evidence.

## Abuse cases to test

- Forged/replayed WhatsApp event
- Same inbound message delivered concurrently
- Customer asks to ignore policy or reveal another person's data
- Model proposes a below-minimum price or guarantee
- Admin accesses an unrelated sensitive record
- Compromised queue payload attempts an unauthorized state transition
- AI/provider timeout causes retry storms or duplicate outbound messages
- Kill switch races with an already queued outbound delivery

## Residual approval gates

Legal basis, processor agreements, cross-border transfer, retention periods,
production identity provider, webhook provider details and incident-response
ownership remain unresolved in `OPEN_DECISIONS.md`.
