-- AVP v2.1 cluster runtime compatibility migration
-- Safe to run on databases created by v2.0 scaffolds. Fresh databases already get these from 001_init.sql.

ALTER TABLE avp_projects ADD COLUMN IF NOT EXISTS path_rules jsonb NOT NULL DEFAULT '{"allow":[],"deny":[]}'::jsonb;
ALTER TABLE avp_projects ADD COLUMN IF NOT EXISTS overlay_copy jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE avp_projects ADD COLUMN IF NOT EXISTS domain_verification jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE avp_projects ADD COLUMN IF NOT EXISTS plan_id text NOT NULL DEFAULT 'pilot';
ALTER TABLE avp_projects ADD COLUMN IF NOT EXISTS quota jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE avp_events ADD COLUMN IF NOT EXISTS ingested_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE avp_daily_stats ADD COLUMN IF NOT EXISTS events bigint NOT NULL DEFAULT 0;
ALTER TABLE avp_daily_stats ADD COLUMN IF NOT EXISTS server_verifications bigint NOT NULL DEFAULT 0;
ALTER TABLE avp_daily_stats ADD COLUMN IF NOT EXISTS successful_server_verifications bigint NOT NULL DEFAULT 0;
ALTER TABLE avp_daily_stats ADD COLUMN IF NOT EXISTS dropped_events bigint NOT NULL DEFAULT 0;
ALTER TABLE avp_daily_stats ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS avp_usage_counters (
  project_id text NOT NULL REFERENCES avp_projects(id) ON DELETE CASCADE,
  month text NOT NULL,
  events bigint NOT NULL DEFAULT 0,
  server_verifications bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(project_id, month)
);

CREATE TABLE IF NOT EXISTS avp_event_ingestion_offsets (
  stream_name text PRIMARY KEY,
  last_event_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_avp_events_project_type_time ON avp_events(project_id, type, time DESC);
CREATE INDEX IF NOT EXISTS idx_avp_events_project_time ON avp_events(project_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_avp_events_domain ON avp_events(project_id, domain);
CREATE INDEX IF NOT EXISTS idx_avp_visitor_sessions_expires ON avp_visitor_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_avp_daily_stats_day ON avp_daily_stats(day DESC);
