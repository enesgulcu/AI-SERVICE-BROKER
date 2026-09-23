# Integration Contracts

All external and asynchronous contracts are versioned. Breaking changes create
a new version; they do not silently mutate active consumers.

## Lead ingestion V1

Authoritative schema:
`packages/contracts/src/v1/lead-ingestion.contract.ts`

Required request controls:

- `Idempotency-Key` is 8–128 safe characters.
- `x-correlation-id` is accepted only when it matches the safe request-ID
  format; otherwise the API generates one.
- Phone is normalized E.164 before entering the domain.
- Unknown request fields are rejected.
- Source reference is unique within a source.
- Request/body limits apply before schema validation.

The transport contract may contain `rawData`, but raw source payloads do not
enter the Lead aggregate or domain events. The future ingestion adapter stores
raw evidence separately under restricted access and passes only an opaque
`rawPayloadReference` to the domain.

Response dispositions:

- `CREATED`: a new lead and outbox event committed atomically.
- `DUPLICATE`: the idempotency key or `(source, sourceReference)` already maps
  to an existing lead; no second lead/event is created.

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
