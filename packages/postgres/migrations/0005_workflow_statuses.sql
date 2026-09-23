ALTER TABLE acquisition.leads
  ADD COLUMN previous_status varchar(32),
  ADD COLUMN resume_status varchar(32);

ALTER TABLE acquisition.leads DROP CONSTRAINT leads_status_check;

ALTER TABLE acquisition.leads
  ADD CONSTRAINT leads_status_check
  CHECK (
    status IN (
      'NEW',
      'CONTACT_PENDING',
      'CONTACTED',
      'INTERESTED',
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
      'NO_RESPONSE',
      'MANUAL_REVIEW'
    )
  );

CREATE SCHEMA IF NOT EXISTS workflow;

CREATE TABLE workflow.transitions (
  id uuid PRIMARY KEY,
  lead_id uuid NOT NULL,
  from_status varchar(32) NOT NULL,
  to_status varchar(32) NOT NULL,
  version integer NOT NULL,
  reason_code varchar(64) NOT NULL,
  actor_id varchar(128) NOT NULL,
  correlation_id varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT workflow_transitions_version_check CHECK (version > 0),
  CONSTRAINT workflow_transitions_reason_check
    CHECK (reason_code IN ('NONE', 'WITHDRAWN', 'NOT_INTERESTED', 'DUPLICATE', 'INVALID_CONTACT'))
);

ALTER TABLE acquisition.leads
  ADD CONSTRAINT leads_resume_status_check
  CHECK (
    resume_status IS NULL
    OR resume_status IN ('NEW', 'CONTACT_PENDING', 'CONTACTED', 'INTERESTED')
  );
