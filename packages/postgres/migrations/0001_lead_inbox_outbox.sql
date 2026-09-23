CREATE SCHEMA IF NOT EXISTS acquisition;
CREATE SCHEMA IF NOT EXISTS platform;

CREATE TABLE acquisition.leads (
  id uuid PRIMARY KEY,
  status varchar(32) NOT NULL,
  source varchar(64) NOT NULL,
  source_reference varchar(256) NOT NULL,
  phone varchar(16) NOT NULL,
  customer_name varchar(160),
  city varchar(120),
  district varchar(120),
  listing_title varchar(500),
  listing_text text,
  published_at timestamptz,
  received_at timestamptz NOT NULL,
  raw_payload_reference text,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT leads_status_check CHECK (status IN ('NEW')),
  CONSTRAINT leads_source_check CHECK (source ~ '^[A-Z0-9_-]{1,64}$'),
  CONSTRAINT leads_phone_check CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
  CONSTRAINT leads_source_reference_unique UNIQUE (source, source_reference)
);

CREATE INDEX leads_status_received_at_idx
  ON acquisition.leads (status, received_at);

CREATE TABLE platform.idempotency_keys (
  operation varchar(100) NOT NULL,
  idempotency_key varchar(128) NOT NULL,
  request_fingerprint char(64) NOT NULL,
  resource_type varchar(100) NOT NULL,
  resource_id uuid NOT NULL,
  disposition varchar(32) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT idempotency_keys_pkey PRIMARY KEY (operation, idempotency_key),
  CONSTRAINT idempotency_keys_fingerprint_check
    CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  CONSTRAINT idempotency_keys_disposition_check
    CHECK (disposition IN ('CREATED', 'DUPLICATE'))
);

CREATE INDEX idempotency_keys_resource_idx
  ON platform.idempotency_keys (resource_type, resource_id);

CREATE TABLE platform.inbox_messages (
  id uuid PRIMARY KEY,
  provider varchar(100) NOT NULL,
  provider_message_id varchar(256) NOT NULL,
  correlation_id varchar(128) NOT NULL,
  payload_reference text NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'RECEIVED',
  attempts integer NOT NULL DEFAULT 0,
  received_at timestamptz NOT NULL,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT inbox_messages_provider_id_unique
    UNIQUE (provider, provider_message_id),
  CONSTRAINT inbox_messages_status_check
    CHECK (status IN ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED')),
  CONSTRAINT inbox_messages_attempts_check CHECK (attempts >= 0)
);

CREATE INDEX inbox_messages_pending_idx
  ON platform.inbox_messages (received_at)
  WHERE status IN ('RECEIVED', 'FAILED');

CREATE TABLE platform.outbox_events (
  event_id uuid PRIMARY KEY,
  event_type varchar(150) NOT NULL,
  event_version integer NOT NULL,
  aggregate_type varchar(100) NOT NULL,
  aggregate_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  correlation_id varchar(128) NOT NULL,
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  published_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT outbox_event_version_check CHECK (event_version > 0),
  CONSTRAINT outbox_attempts_check CHECK (attempts >= 0),
  CONSTRAINT outbox_payload_object_check CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX outbox_events_pending_idx
  ON platform.outbox_events (available_at, occurred_at)
  WHERE published_at IS NULL;
