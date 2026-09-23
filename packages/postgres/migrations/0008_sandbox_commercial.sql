ALTER TABLE acquisition.leads DROP CONSTRAINT leads_status_check;
ALTER TABLE acquisition.leads DROP CONSTRAINT leads_previous_status_check;
ALTER TABLE acquisition.leads DROP CONSTRAINT leads_resume_status_check;

ALTER TABLE acquisition.leads
  ADD CONSTRAINT leads_status_check
  CHECK (
    status IN (
      'NEW',
      'CONTACT_PENDING',
      'CONTACTED',
      'INTERESTED',
      'QUALIFYING',
      'QUALIFIED',
      'QUOTE_READY',
      'QUOTE_SENT',
      'NEGOTIATING',
      'CUSTOMER_ACCEPTED',
      'JOB_READY',
      'NO_RESPONSE',
      'MANUAL_REVIEW',
      'CLOSED_LOST'
    )
  );

ALTER TABLE acquisition.leads
  ADD CONSTRAINT leads_previous_status_check
  CHECK (
    previous_status IS NULL
    OR previous_status IN (
      'NEW',
      'CONTACT_PENDING',
      'CONTACTED',
      'INTERESTED',
      'QUALIFYING',
      'QUALIFIED',
      'QUOTE_READY',
      'QUOTE_SENT',
      'NEGOTIATING',
      'CUSTOMER_ACCEPTED',
      'JOB_READY',
      'NO_RESPONSE',
      'MANUAL_REVIEW'
    )
  );

ALTER TABLE acquisition.leads
  ADD CONSTRAINT leads_resume_status_check
  CHECK (
    resume_status IS NULL
    OR resume_status IN (
      'NEW',
      'CONTACT_PENDING',
      'CONTACTED',
      'INTERESTED',
      'QUALIFYING',
      'QUALIFIED',
      'QUOTE_READY',
      'QUOTE_SENT',
      'NEGOTIATING',
      'CUSTOMER_ACCEPTED',
      'JOB_READY'
    )
  );

CREATE SCHEMA IF NOT EXISTS commercial;

CREATE TABLE commercial.records (
  id uuid PRIMARY KEY,
  lead_id uuid,
  kind varchar(32) NOT NULL,
  idempotency_key varchar(128) NOT NULL,
  fingerprint char(64) NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT commercial_kind_check
    CHECK (kind IN ('QUOTE', 'NEGOTIATION', 'FOLLOW_UP', 'JOB', 'PROVIDER_DELIVERY')),
  CONSTRAINT commercial_fingerprint_check CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  CONSTRAINT commercial_key_check CHECK (idempotency_key ~ '^[a-zA-Z0-9._:-]{8,128}$'),
  CONSTRAINT commercial_payload_object_check CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT commercial_kind_key_unique UNIQUE (kind, idempotency_key)
);

CREATE INDEX commercial_records_lead_kind_idx
  ON commercial.records (lead_id, kind);
