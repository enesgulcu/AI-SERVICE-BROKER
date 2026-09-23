# Integration Contracts

All external and asynchronous contracts are versioned. Breaking changes create
a new version; they do not silently mutate active consumers.

## Lead ingestion V1

Authoritative schema:
`packages/contracts/src/v1/lead-ingestion.contract.ts`

HTTP endpoint: `POST /v1/leads`

Required request controls:

- `Idempotency-Key` is 8–128 safe characters.
- `x-correlation-id` is accepted only when it matches the safe request-ID
  format; otherwise the API generates one.
- Phone is normalized E.164 before entering the domain.
- Unknown request fields are rejected.
- Source reference is unique within a source.
- Request/body limits apply before schema validation.
- The API stores a SHA-256 `requestFingerprint` of the canonical request. Reusing
  an `Idempotency-Key` with a different body is a conflict, not a silent
  duplicate.

The transport contract may contain `rawData`, but raw source payloads do not
enter the Lead aggregate or domain events. The future ingestion adapter stores
raw evidence separately under restricted access and passes only an opaque
`rawPayloadReference` to the domain.

Response dispositions:

- `201 CREATED`: a new lead and outbox event committed atomically.
- `200 DUPLICATE`: the idempotency key or `(source, sourceReference)` already
  maps to an existing lead; no second lead/event is created.
- `403 REAL_DATA_INGESTION_BLOCKED`: source is not `SYNTHETIC`/`TEST` while
  `PERSONAL_DATA_MODE=synthetic`.
- `409 IDEMPOTENCY_KEY_REUSED`: the same key was used with a different body.

`AUTO_FIRST_CONTACT` remains off. Ingestion never sends a customer message.

## LeadCreated event V1

Owner: Acquisition/Lead module  
Event type: `LeadCreated`  
Event version: `1`

Envelope fields:

- `eventId`, `aggregateType`, `aggregateId`
- `occurredAt`, `correlationId`
- `eventType`, `eventVersion`

Payload fields:

- `leadId`, `source`, `sourceReference`, `status`

The event intentionally excludes phone, customer name, listing text and raw
payload. Consumers needing personal data must use an authorized query rather
than copying it into queues and analytics.

## Delivery semantics

- Domain events use transactional outbox and at-least-once delivery.
- Consumers deduplicate by `eventId`.
- Event ordering is guaranteed only per aggregate when explicitly implemented.
- Unknown event versions are rejected/dead-lettered, not guessed.
- Redrive is an audited privileged operation.
