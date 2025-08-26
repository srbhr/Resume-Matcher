-- Credit Ledger schema (PostgreSQL / Neon)
-- Safe to run on Neon; requires appropriate privileges.

BEGIN;

-- 1) Stripe customers mapping
CREATE TABLE IF NOT EXISTS stripe_customers (
  clerk_user_id      TEXT PRIMARY KEY,
  stripe_customer_id TEXT UNIQUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Credit ledger (event-sourced)
CREATE TABLE IF NOT EXISTS credit_ledger (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clerk_user_id   TEXT NOT NULL REFERENCES stripe_customers(clerk_user_id) ON DELETE RESTRICT,
  delta           INT NOT NULL,
  reason          TEXT NOT NULL,
  stripe_event_id TEXT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial unique index for webhook idempotency
CREATE UNIQUE INDEX IF NOT EXISTS ux_credit_ledger_stripe_event_id
  ON credit_ledger (stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;

-- Helpful lookup index
CREATE INDEX IF NOT EXISTS ix_credit_ledger_user ON credit_ledger (clerk_user_id);

-- 3) Balance view
CREATE OR REPLACE VIEW v_credit_balance AS
SELECT clerk_user_id, COALESCE(SUM(delta), 0) AS balance
FROM credit_ledger
GROUP BY clerk_user_id;

COMMIT;
