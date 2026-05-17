-- AVP PostgreSQL migration 001 v2.1
-- Cluster-ready commercial beta schema used by the API, ingestion workers and analytics workers.
-- All app-owned tables use the avp_* prefix so fresh migrations match the runtime adapter.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS avp_users (
  id text PRIMARY KEY,
  email text UNIQUE NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','admin','analyst','support','client_readonly')),
  password_algo text NOT NULL,
  password_iterations integer,
  password_salt text NOT NULL,
  password_hash text NOT NULL,
  mfa_enabled boolean NOT NULL DEFAULT false,
  mfa_secret_enc text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS avp_companies (
  id text PRIMARY KEY,
  name text NOT NULL,
  contact_email text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS avp_projects (
  id text PRIMARY KEY,
  company_id text REFERENCES avp_companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  public_key text UNIQUE NOT NULL,
  mode text NOT NULL CHECK (mode IN ('observe-only','soft-gate','server-gate')),
  enabled boolean NOT NULL DEFAULT true,
  kill_switch boolean NOT NULL DEFAULT false,
  allowed_domains text[] NOT NULL DEFAULT '{}',
  protected_selector text NOT NULL DEFAULT '#protected-content',
  ad_container_selector text NOT NULL DEFAULT '#ad-slot',
  market_benchmark_percent numeric NOT NULL DEFAULT 33,
  loader_enabled boolean NOT NULL DEFAULT true,
  auto_create_ad_container boolean NOT NULL DEFAULT true,
  strictness text NOT NULL DEFAULT 'balanced',
  sdk_version text NOT NULL DEFAULT 'v1',
  sdk_channel text NOT NULL DEFAULT 'stable',
  canary_percent numeric NOT NULL DEFAULT 0,
  fallback_policy text NOT NULL DEFAULT 'balanced',
  hardening jsonb NOT NULL DEFAULT '{}'::jsonb,
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  path_rules jsonb NOT NULL DEFAULT '{"allow":[],"deny":[]}'::jsonb,
  overlay_copy jsonb NOT NULL DEFAULT '{}'::jsonb,
  domain_verification jsonb NOT NULL DEFAULT '{}'::jsonb,
  plan_id text NOT NULL DEFAULT 'pilot',
  quota jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_avp_projects_public_key ON avp_projects(public_key);
CREATE INDEX IF NOT EXISTS idx_avp_projects_company ON avp_projects(company_id);

CREATE TABLE IF NOT EXISTS avp_project_secrets (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES avp_projects(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('server_verify','events_ingest','analytics_readonly')),
  label text NOT NULL,
  secret_key_enc text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_avp_project_secrets_project_kind ON avp_project_secrets(project_id, kind, revoked_at);

-- Redis is the primary cluster runtime for visitor sessions. This table is kept for optional future
-- durable session replay/debugging and for deployments that intentionally mirror runtime data.
CREATE TABLE IF NOT EXISTS avp_visitor_sessions (
  visitor_token_hash text PRIMARY KEY,
  project_id text NOT NULL REFERENCES avp_projects(id) ON DELETE CASCADE,
  origin text,
  page_url text,
  status text NOT NULL DEFAULT 'created',
  fingerprint text,
  client_public_key jsonb,
  next_seq integer NOT NULL DEFAULT 1,
  challenges jsonb NOT NULL DEFAULT '{}'::jsonb,
  proof jsonb,
  proof_attempts integer NOT NULL DEFAULT 0,
  content_unlocked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_avp_visitor_sessions_project_seen ON avp_visitor_sessions(project_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_avp_visitor_sessions_expires ON avp_visitor_sessions(expires_at);

CREATE TABLE IF NOT EXISTS avp_events (
  id bigserial PRIMARY KEY,
  time timestamptz NOT NULL DEFAULT now(),
  ingested_at timestamptz NOT NULL DEFAULT now(),
  project_id text NOT NULL REFERENCES avp_projects(id) ON DELETE CASCADE,
  project_name text,
  type text NOT NULL,
  reason text,
  visitor_hash text,
  origin text,
  page text,
  domain text,
  ip_hash text,
  user_agent text,
  browser text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_avp_events_project_time ON avp_events(project_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_avp_events_project_type_time ON avp_events(project_id, type, time DESC);
CREATE INDEX IF NOT EXISTS idx_avp_events_type_reason ON avp_events(type, reason);
CREATE INDEX IF NOT EXISTS idx_avp_events_domain ON avp_events(project_id, domain);
CREATE INDEX IF NOT EXISTS idx_avp_events_time ON avp_events(time DESC);
CREATE INDEX IF NOT EXISTS idx_avp_events_visitor ON avp_events(project_id, visitor_hash, time DESC);

CREATE TABLE IF NOT EXISTS avp_daily_stats (
  project_id text NOT NULL REFERENCES avp_projects(id) ON DELETE CASCADE,
  day date NOT NULL,
  events bigint NOT NULL DEFAULT 0,
  visits bigint NOT NULL DEFAULT 0,
  unique_visitors bigint NOT NULL DEFAULT 0,
  content_unlocked bigint NOT NULL DEFAULT 0,
  overlay_shown bigint NOT NULL DEFAULT 0,
  ad_restores bigint NOT NULL DEFAULT 0,
  connection_issues bigint NOT NULL DEFAULT 0,
  client_errors bigint NOT NULL DEFAULT 0,
  proof_failed bigint NOT NULL DEFAULT 0,
  server_verifications bigint NOT NULL DEFAULT 0,
  successful_server_verifications bigint NOT NULL DEFAULT 0,
  abuse_events bigint NOT NULL DEFAULT 0,
  dropped_events bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(project_id, day)
);
CREATE INDEX IF NOT EXISTS idx_avp_daily_stats_day ON avp_daily_stats(day DESC);

CREATE TABLE IF NOT EXISTS avp_usage_counters (
  project_id text NOT NULL REFERENCES avp_projects(id) ON DELETE CASCADE,
  month text NOT NULL,
  events bigint NOT NULL DEFAULT 0,
  server_verifications bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(project_id, month)
);

CREATE TABLE IF NOT EXISTS avp_audit_log (
  id bigserial PRIMARY KEY,
  time timestamptz NOT NULL DEFAULT now(),
  user_id text,
  user_email text,
  action text NOT NULL,
  ip_hash text,
  user_agent text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_avp_audit_time ON avp_audit_log(time DESC);

CREATE TABLE IF NOT EXISTS avp_alerts (
  id bigserial PRIMARY KEY,
  time timestamptz NOT NULL DEFAULT now(),
  type text NOT NULL,
  severity text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_at timestamptz,
  acknowledged_by text
);
CREATE INDEX IF NOT EXISTS idx_avp_alerts_time ON avp_alerts(time DESC);

CREATE TABLE IF NOT EXISTS avp_event_ingestion_offsets (
  stream_name text PRIMARY KEY,
  last_event_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS avp_schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW avp_project_summary AS
SELECT
  p.id,
  p.name,
  p.public_key,
  p.mode,
  p.enabled,
  p.kill_switch,
  count(e.*) AS events,
  count(e.*) FILTER (WHERE e.type = 'visit') AS visits,
  count(e.*) FILTER (WHERE e.type = 'content_unlocked') AS content_unlocked,
  count(e.*) FILTER (WHERE e.type = 'overlay_shown') AS overlay_shown,
  count(e.*) FILTER (WHERE e.type = 'server_verification_ok') AS server_verification_ok,
  max(e.time) AS last_event_at
FROM avp_projects p
LEFT JOIN avp_events e ON e.project_id = p.id
GROUP BY p.id;
