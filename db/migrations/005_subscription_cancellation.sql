-- AVP migration 005: subscription cancellation audit + destructive beta offboarding support.

CREATE TABLE IF NOT EXISTS avp_subscription_cancellations (
  id text PRIMARY KEY,
  account_id text,
  email text NOT NULL,
  full_name text,
  company_name text,
  plan_id text,
  project_ids text[] NOT NULL DEFAULT '{}',
  reason text,
  mail_status text,
  ip_hash text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_avp_subscription_cancellations_email ON avp_subscription_cancellations(email);
CREATE INDEX IF NOT EXISTS idx_avp_subscription_cancellations_created ON avp_subscription_cancellations(created_at DESC);
