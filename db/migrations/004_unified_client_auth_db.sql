-- AVP migration 004: harden unified client auth DB for Google/email login and password reset.

ALTER TABLE avp_client_accounts ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE avp_client_accounts ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE avp_client_accounts ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;

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

CREATE INDEX IF NOT EXISTS idx_avp_client_accounts_email_lower ON avp_client_accounts (lower(trim(email)));
CREATE INDEX IF NOT EXISTS idx_avp_client_accounts_provider ON avp_client_accounts(provider);
