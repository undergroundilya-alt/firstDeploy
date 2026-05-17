-- AVP migration 006: architecture foundation pack for the 19-point SaaS architecture checklist.
-- Safe additive migration: creates missing operational tables without changing existing runtime behavior.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Auth / account consent and unsubscribe foundation.
CREATE TABLE IF NOT EXISTS avp_marketing_consents (
  id text PRIMARY KEY,
  account_id text,
  email text NOT NULL,
  consented boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'signup',
  ip_hash text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_avp_marketing_consents_email ON avp_marketing_consents(lower(trim(email)));
CREATE INDEX IF NOT EXISTS idx_avp_marketing_consents_account ON avp_marketing_consents(account_id);

CREATE TABLE IF NOT EXISTS avp_email_unsubscribes (
  id text PRIMARY KEY,
  account_id text,
  email text NOT NULL,
  email_type text NOT NULL DEFAULT 'marketing',
  token_hash text,
  reason text,
  ip_hash text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_avp_email_unsubscribes_email ON avp_email_unsubscribes(lower(trim(email)));
CREATE INDEX IF NOT EXISTS idx_avp_email_unsubscribes_type ON avp_email_unsubscribes(email_type, created_at DESC);

-- 2) Companies / projects normalization beyond the legacy allowed_domains array.
CREATE TABLE IF NOT EXISTS avp_project_members (
  project_id text NOT NULL REFERENCES avp_projects(id) ON DELETE CASCADE,
  account_id text NOT NULL,
  role text NOT NULL DEFAULT 'owner',
  invited_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(project_id, account_id)
);
CREATE INDEX IF NOT EXISTS idx_avp_project_members_account ON avp_project_members(account_id);

CREATE TABLE IF NOT EXISTS avp_project_domains (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES avp_projects(id) ON DELETE CASCADE,
  domain text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  verification_method text,
  verification_token text,
  verified_at timestamptz,
  last_checked_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, domain)
);
CREATE INDEX IF NOT EXISTS idx_avp_project_domains_project ON avp_project_domains(project_id);
CREATE INDEX IF NOT EXISTS idx_avp_project_domains_domain ON avp_project_domains(lower(domain));
CREATE INDEX IF NOT EXISTS idx_avp_project_domains_status ON avp_project_domains(status);

CREATE TABLE IF NOT EXISTS avp_project_settings (
  project_id text PRIMARY KEY REFERENCES avp_projects(id) ON DELETE CASCADE,
  sdk_version text NOT NULL DEFAULT 'v1',
  sdk_channel text NOT NULL DEFAULT 'stable',
  overlay_mode text NOT NULL DEFAULT 'soft',
  strict_mode boolean NOT NULL DEFAULT false,
  config_cache_seconds integer NOT NULL DEFAULT 60,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3) Analytics pipeline: hourly/page/session-level aggregates and raw-event operational helpers.
CREATE TABLE IF NOT EXISTS avp_hourly_stats (
  project_id text NOT NULL REFERENCES avp_projects(id) ON DELETE CASCADE,
  hour timestamptz NOT NULL,
  events bigint NOT NULL DEFAULT 0,
  visits bigint NOT NULL DEFAULT 0,
  unique_visitors bigint NOT NULL DEFAULT 0,
  overlay_shown bigint NOT NULL DEFAULT 0,
  ad_hidden bigint NOT NULL DEFAULT 0,
  ad_removed bigint NOT NULL DEFAULT 0,
  mutation_detected bigint NOT NULL DEFAULT 0,
  content_unlocked bigint NOT NULL DEFAULT 0,
  proof_failed bigint NOT NULL DEFAULT 0,
  foreign_script_blocked bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(project_id, hour)
);
CREATE INDEX IF NOT EXISTS idx_avp_hourly_stats_hour ON avp_hourly_stats(hour DESC);

CREATE TABLE IF NOT EXISTS avp_page_sessions (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES avp_projects(id) ON DELETE CASCADE,
  visitor_hash text,
  domain text,
  page_url text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  visits integer NOT NULL DEFAULT 1,
  overlay_shown integer NOT NULL DEFAULT 0,
  mutations integer NOT NULL DEFAULT 0,
  unlocks integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_avp_page_sessions_project_started ON avp_page_sessions(project_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_avp_page_sessions_visitor ON avp_page_sessions(project_id, visitor_hash, started_at DESC);

CREATE TABLE IF NOT EXISTS avp_page_stats (
  project_id text NOT NULL REFERENCES avp_projects(id) ON DELETE CASCADE,
  day date NOT NULL,
  domain text NOT NULL DEFAULT '',
  page_url text NOT NULL DEFAULT '',
  visits bigint NOT NULL DEFAULT 0,
  overlay_shown bigint NOT NULL DEFAULT 0,
  mutations bigint NOT NULL DEFAULT 0,
  unlocks bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(project_id, day, domain, page_url)
);
CREATE INDEX IF NOT EXISTS idx_avp_page_stats_day ON avp_page_stats(day DESC);

-- 4) Billing / plans / revenue-share reporting.
CREATE TABLE IF NOT EXISTS avp_plan_limits (
  plan_id text PRIMARY KEY,
  name text NOT NULL,
  monthly_price_cents integer,
  project_limit integer,
  protected_visits_monthly bigint,
  protected_visits_daily bigint,
  events_monthly bigint,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO avp_plan_limits (plan_id, name, monthly_price_cents, project_limit, protected_visits_monthly, protected_visits_daily, events_monthly, features)
VALUES
  ('beta', 'Beta Trial', 0, 1, 100000, 10000, 1000000, '{"trialDays":30,"support":"email"}'::jsonb),
  ('classic', 'Classic', 4900, 3, 500000, 50000, 5000000, '{"support":"email","analytics":"standard"}'::jsonb),
  ('enterprise', 'Enterprise', NULL, NULL, NULL, NULL, NULL, '{"pricing":"custom","revenueShare":"10-30%","support":"priority"}'::jsonb)
ON CONFLICT(plan_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS avp_subscriptions (
  id text PRIMARY KEY,
  account_id text,
  company_id text REFERENCES avp_companies(id) ON DELETE SET NULL,
  plan_id text REFERENCES avp_plan_limits(plan_id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'trialing',
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  cancelled_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_avp_subscriptions_account ON avp_subscriptions(account_id);
CREATE INDEX IF NOT EXISTS idx_avp_subscriptions_status ON avp_subscriptions(status);

CREATE TABLE IF NOT EXISTS avp_usage_daily (
  account_id text,
  project_id text REFERENCES avp_projects(id) ON DELETE CASCADE,
  day date NOT NULL,
  protected_visits bigint NOT NULL DEFAULT 0,
  events bigint NOT NULL DEFAULT 0,
  recovered_impressions bigint NOT NULL DEFAULT 0,
  overlay_shown bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(project_id, day)
);
CREATE INDEX IF NOT EXISTS idx_avp_usage_daily_account_day ON avp_usage_daily(account_id, day DESC);

CREATE TABLE IF NOT EXISTS avp_invoices (
  id text PRIMARY KEY,
  account_id text,
  company_id text REFERENCES avp_companies(id) ON DELETE SET NULL,
  subscription_id text REFERENCES avp_subscriptions(id) ON DELETE SET NULL,
  period_start date,
  period_end date,
  currency text NOT NULL DEFAULT 'USD',
  amount_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_avp_invoices_account ON avp_invoices(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_avp_invoices_status ON avp_invoices(status);

CREATE TABLE IF NOT EXISTS avp_revenue_share_reports (
  id text PRIMARY KEY,
  project_id text REFERENCES avp_projects(id) ON DELETE CASCADE,
  account_id text,
  period_start date NOT NULL,
  period_end date NOT NULL,
  recovered_impressions bigint NOT NULL DEFAULT 0,
  agreed_rpm numeric NOT NULL DEFAULT 0,
  recovered_revenue_cents integer NOT NULL DEFAULT 0,
  share_percent numeric NOT NULL DEFAULT 0,
  amount_due_cents integer NOT NULL DEFAULT 0,
  basis text NOT NULL DEFAULT 'publisher_reported_rpm',
  status text NOT NULL DEFAULT 'draft',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_avp_revenue_share_reports_project ON avp_revenue_share_reports(project_id, period_start DESC);

-- 5) Support / complaints / abuse reporting.
CREATE TABLE IF NOT EXISTS avp_support_tickets (
  id text PRIMARY KEY,
  account_id text,
  project_id text REFERENCES avp_projects(id) ON DELETE SET NULL,
  email text,
  category text NOT NULL DEFAULT 'support',
  subject text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  priority text NOT NULL DEFAULT 'normal',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_avp_support_tickets_status ON avp_support_tickets(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_avp_support_tickets_project ON avp_support_tickets(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS avp_abuse_reports (
  id text PRIMARY KEY,
  project_id text REFERENCES avp_projects(id) ON DELETE SET NULL,
  domain text,
  page_url text,
  reason text NOT NULL,
  reporter_email text,
  status text NOT NULL DEFAULT 'new',
  ip_hash text,
  user_agent text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_avp_abuse_reports_status ON avp_abuse_reports(status, created_at DESC);

CREATE TABLE IF NOT EXISTS avp_user_complaints (
  id text PRIMARY KEY,
  project_id text REFERENCES avp_projects(id) ON DELETE SET NULL,
  visitor_hash text,
  domain text,
  page_url text,
  complaint_type text NOT NULL DEFAULT 'page_blocked',
  message text,
  status text NOT NULL DEFAULT 'new',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_avp_user_complaints_project ON avp_user_complaints(project_id, created_at DESC);

-- 6) System, API keys, webhooks, feature flags, kill switch, SDK versioning and incidents.
CREATE TABLE IF NOT EXISTS avp_api_keys (
  id text PRIMARY KEY,
  account_id text,
  project_id text REFERENCES avp_projects(id) ON DELETE CASCADE,
  label text NOT NULL,
  key_hash text NOT NULL,
  scopes text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_avp_api_keys_project ON avp_api_keys(project_id, revoked_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_avp_api_keys_hash ON avp_api_keys(key_hash);

CREATE TABLE IF NOT EXISTS avp_webhook_deliveries (
  id text PRIMARY KEY,
  project_id text REFERENCES avp_projects(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  target_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_avp_webhook_deliveries_status ON avp_webhook_deliveries(status, created_at DESC);

CREATE TABLE IF NOT EXISTS avp_feature_flags (
  key text PRIMARY KEY,
  description text,
  enabled boolean NOT NULL DEFAULT false,
  rollout_percent numeric NOT NULL DEFAULT 0,
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS avp_kill_switch_events (
  id text PRIMARY KEY,
  project_id text REFERENCES avp_projects(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'project',
  enabled boolean NOT NULL,
  reason text,
  changed_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_avp_kill_switch_events_project ON avp_kill_switch_events(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS avp_sdk_versions (
  version text PRIMARY KEY,
  channel text NOT NULL DEFAULT 'stable',
  core_path text NOT NULL,
  integrity_hash text,
  release_notes text,
  status text NOT NULL DEFAULT 'active',
  released_at timestamptz NOT NULL DEFAULT now(),
  rollback_to text
);

CREATE TABLE IF NOT EXISTS avp_domain_verification_tokens (
  token_hash text PRIMARY KEY,
  project_id text NOT NULL REFERENCES avp_projects(id) ON DELETE CASCADE,
  domain text NOT NULL,
  method text NOT NULL DEFAULT 'dns_txt',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  verified_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_avp_domain_verification_project ON avp_domain_verification_tokens(project_id, domain);

CREATE TABLE IF NOT EXISTS avp_data_retention_policies (
  id text PRIMARY KEY,
  scope text NOT NULL DEFAULT 'global',
  raw_event_days integer NOT NULL DEFAULT 90,
  aggregate_months integer NOT NULL DEFAULT 24,
  support_ticket_months integer NOT NULL DEFAULT 36,
  account_delete_mode text NOT NULL DEFAULT 'delete_or_anonymize',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS avp_incidents (
  id text PRIMARY KEY,
  severity text NOT NULL DEFAULT 'minor',
  status text NOT NULL DEFAULT 'investigating',
  title text NOT NULL,
  summary text,
  affected_components text[] NOT NULL DEFAULT '{}',
  started_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_avp_incidents_status ON avp_incidents(status, started_at DESC);

CREATE TABLE IF NOT EXISTS avp_status_events (
  id text PRIMARY KEY,
  component text NOT NULL,
  status text NOT NULL,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_avp_status_events_component ON avp_status_events(component, created_at DESC);

CREATE TABLE IF NOT EXISTS avp_backup_restore_checks (
  id text PRIMARY KEY,
  environment text NOT NULL DEFAULT 'staging',
  backup_id text,
  status text NOT NULL DEFAULT 'pending',
  checked_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_avp_backup_restore_checks_checked ON avp_backup_restore_checks(checked_at DESC);
