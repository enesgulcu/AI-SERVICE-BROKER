ALTER TABLE conversation.conversations
  ADD COLUMN version integer NOT NULL DEFAULT 1;

ALTER TABLE conversation.conversations
  ADD CONSTRAINT conversations_version_check CHECK (version > 0);

ALTER TABLE conversation.conversations
  DROP CONSTRAINT conversations_control_mode_check;

ALTER TABLE conversation.conversations
  ADD CONSTRAINT conversations_control_mode_check
  CHECK (control_mode IN ('AI_ACTIVE', 'HUMAN_CONTROL', 'PAUSED'));

CREATE TABLE conversation.control_changes (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversation.conversations (id),
  control_mode varchar(32) NOT NULL,
  version integer NOT NULL,
  actor_id varchar(128) NOT NULL,
  correlation_id varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT control_changes_mode_check
    CHECK (control_mode IN ('AI_ACTIVE', 'HUMAN_CONTROL', 'PAUSED')),
  CONSTRAINT control_changes_version_check CHECK (version > 0)
);
