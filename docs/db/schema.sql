-- Reference PostgreSQL schema for a production-backed version of this assignment.
-- The MVP runs with an in-memory repository so it can be evaluated without services.

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL,
  customer_id TEXT,
  reference_id TEXT,
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('Pending', 'Processing', 'Success', 'Failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL,
  gateway_payment_id TEXT,
  failure_reason TEXT,
  next_retry_at TIMESTAMPTZ,
  processing_started_at TIMESTAMPTZ,
  processing_expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE payment_attempts (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES payments (id),
  attempt_number INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Started', 'Success', 'Failed', 'Timeout', 'Ignored')),
  gateway_payment_id TEXT,
  provider_event_id TEXT,
  error_code TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  latency_ms INTEGER,
  UNIQUE (payment_id, attempt_number)
);

CREATE TABLE webhook_events (
  id TEXT PRIMARY KEY,
  provider_event_id TEXT NOT NULL UNIQUE,
  payment_id TEXT NOT NULL,
  gateway_payment_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  accepted BOOLEAN NOT NULL DEFAULT false,
  ignored_reason TEXT,
  received_at TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX payments_status_idx ON payments (status);
CREATE INDEX payment_attempts_payment_id_idx ON payment_attempts (payment_id);
CREATE INDEX webhook_events_payment_id_idx ON webhook_events (payment_id);
