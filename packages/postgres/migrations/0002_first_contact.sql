ALTER TABLE acquisition.leads
  ADD COLUMN version integer NOT NULL DEFAULT 1;

ALTER TABLE acquisition.leads
  ADD CONSTRAINT leads_version_check CHECK (version > 0);

ALTER TABLE acquisition.leads DROP CONSTRAINT leads_status_check;

ALTER TABLE acquisition.leads
  ADD CONSTRAINT leads_status_check
  CHECK (status IN ('NEW', 'CONTACT_PENDING', 'CONTACTED'));

CREATE TABLE acquisition.raw_payloads (
  id uuid PRIMARY KEY,
  lead_id uuid NOT NULL UNIQUE REFERENCES acquisition.leads (id),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT raw_payloads_object_check CHECK (jsonb_typeof(payload) = 'object')
);

CREATE SCHEMA IF NOT EXISTS outreach;
CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE outreach.contact_reviews (
  id uuid PRIMARY KEY,
  lead_id uuid NOT NULL,
  message_id uuid NOT NULL UNIQUE,
  status varchar(32) NOT NULL,
  actor_id varchar(128) NOT NULL,
  template_version varchar(64) NOT NULL,
  reason_code varchar(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  decided_at timestamptz,
  decision_actor_id varchar(128),
  correlation_id varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT contact_reviews_status_check
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED'))
);

CREATE UNIQUE INDEX contact_reviews_one_pending_idx
  ON outreach.contact_reviews (lead_id)
  WHERE status = 'PENDING';

CREATE TABLE outreach.outbound_messages (
  id uuid PRIMARY KEY,
  review_id uuid NOT NULL UNIQUE REFERENCES outreach.contact_reviews (id),
  lead_id uuid NOT NULL,
  channel varchar(32) NOT NULL,
  template_version varchar(64) NOT NULL,
  body text NOT NULL,
  delivery_status varchar(32) NOT NULL,
  provider_message_id varchar(128),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT outbound_messages_channel_check CHECK (channel = 'MOCK'),
  CONSTRAINT outbound_messages_delivery_check
    CHECK (delivery_status IN ('DRAFT', 'MOCK_ACCEPTED', 'NOT_SENT'))
);

CREATE TABLE audit.entries (
  id uuid PRIMARY KEY,
  actor_id varchar(128) NOT NULL,
  action varchar(64) NOT NULL,
  entity_type varchar(64) NOT NULL,
  entity_id uuid NOT NULL,
  reason_code varchar(64) NOT NULL,
  correlation_id varchar(128) NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE INDEX audit_entries_entity_idx
  ON audit.entries (entity_type, entity_id, occurred_at);
