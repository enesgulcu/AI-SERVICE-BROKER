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
      'QUALIFIED'
    )
  );

CREATE SCHEMA IF NOT EXISTS requirement;

CREATE TABLE requirement.versions (
  id uuid PRIMARY KEY,
  lead_id uuid NOT NULL,
  version integer NOT NULL,
  schema_version varchar(64) NOT NULL,
  fields jsonb NOT NULL,
  special_requirements jsonb NOT NULL,
  missing_fields jsonb NOT NULL,
  contradictions jsonb NOT NULL,
  evidence_count integer NOT NULL,
  ready boolean NOT NULL,
  days_per_week smallint,
  working_hours varchar(11),
  start_date date,
  idempotency_key varchar(128) NOT NULL UNIQUE,
  request_fingerprint char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT requirement_versions_version_check CHECK (version > 0),
  CONSTRAINT requirement_versions_evidence_check CHECK (evidence_count >= 0),
  CONSTRAINT requirement_versions_days_check
    CHECK (days_per_week IS NULL OR days_per_week BETWEEN 1 AND 7),
  UNIQUE (lead_id, version)
);

CREATE SCHEMA IF NOT EXISTS safety;

CREATE TABLE safety.risk_signals (
  id uuid PRIMARY KEY,
  lead_id uuid NOT NULL,
  code varchar(64) NOT NULL,
  severity varchar(16) NOT NULL,
  disposition varchar(16) NOT NULL,
  idempotency_key varchar(128) NOT NULL UNIQUE,
  request_fingerprint char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT safety_risk_disposition_check CHECK (disposition = 'REVIEW'),
  CONSTRAINT safety_risk_code_check
    CHECK (code IN ('ABUSE_LANGUAGE', 'SENSITIVE_DATA', 'CONTRADICTION')),
  CONSTRAINT safety_risk_severity_check CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH'))
);
