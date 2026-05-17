-- AVP migration 003: client portal accounts, client sessions, project links and leads.
-- Safe for Render/PostgreSQL deployments. The app still falls back to JSON storage when DATABASE_URL is not configured.

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
  email_verified boolean NOT NULL DEFAULT false,
  trial_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE avp_client_accounts ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE avp_client_accounts ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE avp_client_accounts ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;

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
CREATE INDEX IF NOT EXISTS idx_avp_leads_project ON avp_leads(project_id);
