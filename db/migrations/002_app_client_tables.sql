-- AVP PostgreSQL migration 002
-- Client portal/auth tables for DB-first mode. These match the runtime app DB schema in server.js.

CREATE TABLE IF NOT EXISTS avp_client_accounts (
  id text PRIMARY KEY,
  email text UNIQUE NOT NULL,
  full_name text,
  phone text,
  company_name text,
  password_algo text NOT NULL,
  password_iterations integer,
  password_salt text NOT NULL,
  password_hash text NOT NULL,
  provider text NOT NULL DEFAULT 'password',
  role text NOT NULL DEFAULT 'client_owner',
  status text NOT NULL DEFAULT 'trial',
  plan_id text NOT NULL DEFAULT 'beta',
  marketing_consent boolean NOT NULL DEFAULT false,
  marketing_consent_at timestamptz,
  email_verified boolean NOT NULL DEFAULT false,
  trial_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_avp_client_accounts_email_lower ON avp_client_accounts (lower(trim(email)));
CREATE INDEX IF NOT EXISTS idx_avp_client_accounts_created ON avp_client_accounts(created_at DESC);

CREATE TABLE IF NOT EXISTS avp_client_sessions (
  sid_hash text PRIMARY KEY,
  account_id text NOT NULL REFERENCES avp_client_accounts(id) ON DELETE CASCADE,
  csrf_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_avp_client_sessions_account ON avp_client_sessions(account_id);
CREATE INDEX IF NOT EXISTS idx_avp_client_sessions_expires ON avp_client_sessions(expires_at);

CREATE TABLE IF NOT EXISTS avp_client_project_links (
  account_id text NOT NULL REFERENCES avp_client_accounts(id) ON DELETE CASCADE,
  project_id text NOT NULL,
  role text NOT NULL DEFAULT 'owner',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(account_id, project_id)
);
CREATE INDEX IF NOT EXISTS idx_avp_client_project_links_account ON avp_client_project_links(account_id);
CREATE INDEX IF NOT EXISTS idx_avp_client_project_links_project ON avp_client_project_links(project_id);

CREATE TABLE IF NOT EXISTS avp_password_reset_tokens (
  token_hash text PRIMARY KEY,
  account_id text NOT NULL REFERENCES avp_client_accounts(id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_avp_password_reset_tokens_account ON avp_password_reset_tokens(account_id);
CREATE INDEX IF NOT EXISTS idx_avp_password_reset_tokens_expires ON avp_password_reset_tokens(expires_at);

CREATE TABLE IF NOT EXISTS avp_marketing_consents (
  id text PRIMARY KEY,
  account_id text REFERENCES avp_client_accounts(id) ON DELETE SET NULL,
  email text NOT NULL,
  consented boolean NOT NULL DEFAULT true,
  source text,
  ip_hash text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_avp_marketing_consents_email ON avp_marketing_consents(email);
CREATE INDEX IF NOT EXISTS idx_avp_marketing_consents_created ON avp_marketing_consents(created_at DESC);

CREATE TABLE IF NOT EXISTS avp_leads (
  id text PRIMARY KEY,
  time timestamptz NOT NULL DEFAULT now(),
  project_id text,
  project_key text,
  name text,
  email text NOT NULL,
  company text,
  site_url text,
  message text,
  source text,
  ip_hash text,
  user_agent text
);
CREATE INDEX IF NOT EXISTS idx_avp_leads_time ON avp_leads(time DESC);
CREATE INDEX IF NOT EXISTS idx_avp_leads_email ON avp_leads(email);

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
