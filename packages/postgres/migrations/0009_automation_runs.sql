ALTER TABLE commercial.records DROP CONSTRAINT commercial_kind_check;

ALTER TABLE commercial.records
  ADD CONSTRAINT commercial_kind_check
  CHECK (
    kind IN (
      'QUOTE',
      'NEGOTIATION',
      'FOLLOW_UP',
      'JOB',
      'PROVIDER_DELIVERY',
      'AUTOMATION'
    )
  );
