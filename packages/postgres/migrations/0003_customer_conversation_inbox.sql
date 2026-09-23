CREATE SCHEMA IF NOT EXISTS customer;
CREATE SCHEMA IF NOT EXISTS conversation;

CREATE TABLE customer.customers (
  id uuid PRIMARY KEY,
  phone_hash char(64) NOT NULL UNIQUE,
  phone varchar(16) NOT NULL,
  identity_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT customers_identity_unverified CHECK (identity_verified = false),
  CONSTRAINT customers_phone_hash_check CHECK (phone_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT customers_phone_check CHECK (phone ~ '^\+[1-9][0-9]{7,14}$')
);

CREATE TABLE customer.customer_leads (
  customer_id uuid NOT NULL REFERENCES customer.customers (id),
  lead_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (customer_id, lead_id)
);

CREATE TABLE conversation.conversations (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL UNIQUE,
  channel varchar(32) NOT NULL,
  control_mode varchar(32) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT conversations_channel_check CHECK (channel = 'MOCK'),
  CONSTRAINT conversations_control_mode_check CHECK (control_mode IN ('AI_ACTIVE', 'PAUSED'))
);

CREATE TABLE conversation.messages (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversation.conversations (id),
  customer_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  provider varchar(100) NOT NULL,
  provider_message_id varchar(256) NOT NULL,
  phone_hash char(64) NOT NULL,
  body text NOT NULL,
  control_mode varchar(32) NOT NULL,
  correlation_id varchar(128) NOT NULL,
  received_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT messages_provider_id_unique UNIQUE (provider, provider_message_id),
  CONSTRAINT messages_provider_check CHECK (provider = 'MOCK'),
  CONSTRAINT messages_direction_inbound CHECK (char_length(body) BETWEEN 1 AND 2000)
);
