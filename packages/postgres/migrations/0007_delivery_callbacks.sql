CREATE TABLE outreach.delivery_callbacks (
  id uuid PRIMARY KEY,
  provider varchar(32) NOT NULL,
  provider_event_id varchar(128) NOT NULL,
  template_version varchar(64) NOT NULL,
  status varchar(32) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT delivery_callbacks_provider_check CHECK (provider = 'MOCK'),
  CONSTRAINT delivery_callbacks_template_check CHECK (template_version = 'sandbox-first-contact-v1'),
  CONSTRAINT delivery_callbacks_status_check CHECK (status IN ('DELIVERED', 'FAILED')),
  CONSTRAINT delivery_callbacks_event_unique UNIQUE (provider, provider_event_id)
);
