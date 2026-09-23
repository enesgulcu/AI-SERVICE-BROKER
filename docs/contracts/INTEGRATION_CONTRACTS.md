# Integration Contracts

All external and asynchronous contracts are versioned. Breaking changes create
a new version; they do not silently mutate active consumers.

## Lead ingestion V1

Authoritative schema:
`packages/contracts/src/v1/lead-ingestion.contract.ts`

HTTP endpoint: `POST /v1/leads`

Required request controls:

- `Idempotency-Key` is 8–128 safe characters.
- `x-correlation-id` is kept only when it is 8–128 characters from
  `A–Z`, `a–z`, `0–9`, `.`, `_`, `:` or `-`. Shorter or otherwise unsafe values
  are replaced with a generated ID before lead processing.
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

`AUTO_FIRST_CONTACT` cannot skip human approval. Ingestion never sends a
customer message. Raw source JSON is stored only in `acquisition.raw_payloads`
and is referenced from the lead; it is not copied into events.

## First contact V1

Prepare: `POST /v1/leads/{leadId}/contact-reviews`

Decide: `POST /v1/contact-reviews/{reviewId}/decisions`

Both require `Idempotency-Key` and an `actorId`. The actor is recorded for
audit. It is not authentication; production admin identity remains OD-009.

- `201 PENDING`: a sandbox draft and 24-hour review were created. Nothing was
  sent.
- `200 DUPLICATE`: the same preparation or an open review is returned.
- `200 APPROVED` / `MOCK_ACCEPTED`: a human approved before expiry and the mock
  channel accepted delivery.
- `200 REJECTED` / `NOT_SENT`: a human rejected the draft.
- `403 CONTACT_NOT_ELIGIBLE`: the source is not `SYNTHETIC` or `TEST`.
- `409 REVIEW_EXPIRED`: the decision arrived after expiry, so nothing was sent.
- `409 ALREADY_CONTACTED` or `REVIEW_CLOSED`: the lead can no longer take that
  action.

`ContactReviewOpened` and `LeadContacted` events carry identifiers, template
version and channel. They do not carry the draft, phone, name, or raw payload.

## Inbound message V1

`POST /v1/inbox/messages`

Body: `leadId`, `providerMessageId`, `body`. No idempotency header. The
provider message id is the idempotency key. The phone is taken from the stored
lead and is not accepted in the request.

- `201 RECORDED`: one customer, one mock conversation and one inbound message
  were stored. `identityVerified` is always false. A new conversation is
  `PAUSED` when `AUTOMATION_PAUSED=true`, otherwise `AI_ACTIVE`. A later message
  keeps the current mode, including `HUMAN_CONTROL`. No reply is sent.
- `200 DUPLICATE`: the same provider message id arrived again with the same
  content.
- `404 LEAD_NOT_FOUND`: the lead does not exist.
- `403 CONTACT_NOT_ELIGIBLE`: the lead source is not `SYNTHETIC` or `TEST`.
- `409 INBOX_MESSAGE_CONFLICT`: the same provider message id arrived with
  different content. The response does not repeat the body or phone.

`InboundMessageRecorded` version 1 carries `messageId`, `conversationId`,
`customerId`, `channel` (`MOCK`) and `controlMode`. It does not carry the
phone, message body, name or raw payload. A second lead with the same phone
reuses the customer and conversation.

## Conversation control V1

`POST /v1/conversations/{conversationId}/control`

Requires `Idempotency-Key`. Body: `actorId`, `controlMode`
(`AI_ACTIVE`, `HUMAN_CONTROL` or `PAUSED`) and `expectedVersion`. A new
conversation starts at version 1. The actor is recorded for audit and is not
authentication.

- `201 CHANGED`: the mode changed and the version increased by one. No message
  is sent.
- `200 DUPLICATE`: the same key and request are replayed.
- `200 UNCHANGED`: the conversation is already in the requested mode.
- `409 KILL_SWITCH_ACTIVE`: `AUTOMATION_PAUSED=true` blocks a return to
  `AI_ACTIVE`.
- `409 VERSION_CONFLICT`: `expectedVersion` is stale.
- `404 CONVERSATION_NOT_FOUND`.

`ConversationControlChanged` version 1 carries `conversationId`, `controlMode`
and `version`. It does not carry the actor, phone or message body. Automated
reply is allowed only when the mode is `AI_ACTIVE` and automation is not paused.
No sender is attached to this command.

## Workflow transition V1

`POST /v1/leads/{leadId}/workflow-transitions`

Requires `Idempotency-Key`. Body: `actorId`, `toStatus`, `expectedVersion`,
and `reasonCode` when closing a lead. Policy version is `workflow-v1`.

A human may record `INTERESTED` after `CONTACTED`, `NO_RESPONSE` after
`CONTACTED`, `MANUAL_REVIEW` from a non-terminal state, and `CLOSED_LOST` with
`WITHDRAWN`, `NOT_INTERESTED`, `DUPLICATE`, or `INVALID_CONTACT`. A held lead
returns only to its stored resume state. First contact stays on its own
approval flow.

- `201 CHANGED` and `200 DUPLICATE`.
- `409 USE_CONTACT_FLOW`: the target belongs to first contact.
- `409 PRICING_NOT_AVAILABLE`, `ACCEPTANCE_NOT_AVAILABLE`,
  `JOB_NOT_AVAILABLE`, `REQUIREMENTS_NOT_AVAILABLE`, `ANALYSIS_NOT_AVAILABLE`,
  or `POLICY_NOT_AVAILABLE`: the target needs a gate that is not open.
- `409 INVALID_TRANSITION` or `VERSION_CONFLICT`.
- `404 LEAD_NOT_FOUND`.
- `403 WORKFLOW_NOT_ELIGIBLE` for a source other than `SYNTHETIC` or `TEST`.

`WorkflowTransitioned` version 1 carries `leadId`, `fromStatus`, `toStatus`,
`policyVersion`, and `reasonCode`. It does not carry the phone, name, or
message body. The transition does not send a message. `CUSTOMER_ACCEPTED` is
not available and would not create a contract. A public command cannot set
`QUALIFIED`; that move happens only after requirement confirmation.

## Requirement confirmation V1

`POST /v1/leads/{leadId}/requirements`

Requires `Idempotency-Key`. Body: `actorId`, `expectedVersion`, `fields`, and
`specialRequirements`. Schema `regular-home-helper-v1`. A human fact needs
confidence 1. Fake-model evidence stays below 1. Free text is not a fact.

The lead must already be `INTERESTED` or `QUALIFYING`. A ready requirement
moves the lead to `QUALIFIED`. The response returns readiness, missing field
names, and contradictions. It does not return the field values.

`RequirementVersionRecorded` version 1 carries `leadId`, `requirementVersion`,
`schemaVersion`, `ready`, and `missingCount`.

`POST /v1/requirements/extractions` runs the fake extractor and stores nothing.

## Closed commercial and safety commands

- `POST /v1/quotes` returns `409 PRICING_NOT_AVAILABLE`. No approved rate card
  is loaded.
- `POST /v1/negotiations` returns `409 NO_CONCESSION_AUTHORITY`.
- `POST /v1/follow-ups` returns `409 FOLLOW_UP_NOT_APPROVED`.
- `GET /v1/policy/facts` returns `409 NO_APPROVED_FACT`.
- `POST /v1/leads/{leadId}/risk-signals` records `REVIEW`. It does not set
  `BLOCKED`. `RiskSignalRecorded` version 1 carries `leadId`, `code`,
  `severity`, and `disposition`.
- `POST /v1/outbound/deliveries` accepts only a human-approved `MOCK` template
  whose version is `sandbox-first-contact-v1`. `WHATSAPP` returns `409 UNSAFE_CHANNEL`.
- `POST /v1/delivery-callbacks` records `DELIVERED` or `FAILED` for that same
  mock template. A repeat is `DUPLICATE`. A changed status is `409
CALLBACK_CONFLICT`. The callback stores no message body and sends nothing.
- `POST /v1/webhooks/inbound` requires `x-webhook-timestamp` and
  `x-webhook-signature` over the raw body. A missing or invalid signature is
  `401`. A valid signature is accepted and does not create a lead.
- `GET /v1/leads/{leadId}/view` returns status, version, source, and a phone
  mask. It does not return the listing text.
- `GET /v1/leads/{leadId}/requirements/view` returns readiness and counts, not
  field values.
- `GET /v1/leads/{leadId}/conversations/view` returns channel, control mode, and
  message count. It does not return the message body or phone.
- `GET /v1/leads/{leadId}/quotes/view` returns an empty list.
- `GET /v1/leads/{leadId}/audit` returns workflow action, reason code, and time.
- `GET /v1/reviews/queue` lists `MANUAL_REVIEW` leads with the same mask.
- `GET /v1/funnel` returns status counts only.
- `GET /v1/operations/summary` returns those counts, the qualified count, manual
  review count, risk-review count, and `COST_NOT_AVAILABLE`. It includes no
  phone, message, or price.
- `POST /v1/outbox/dead-letters/{eventId}/redrive` requeues an unpublished
  safe event and writes an audit row. Unsafe or missing events are refused.

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
- The worker claims unpublished events with a row lock, then marks them
  published. Unknown event versions, payloads outside the allowed fields,
  personal-data values and any non-mock channel are dead-lettered. The worker
  does not send a customer message.
- `AUTOMATION_PAUSED=true` leaves events unpublished and does not consume
  attempts.
- Consumers deduplicate by `eventId`.
- Event ordering is guaranteed only per aggregate when explicitly implemented.
- Unknown event versions are rejected/dead-lettered, not guessed.
- Redrive is an audited privileged operation.
