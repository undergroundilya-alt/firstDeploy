'use strict';

const fs = require('fs');
const path = require('path');

function lazyPg() {
  try { return require('pg'); }
  catch (err) {
    const e = new Error('pg_package_missing_run_npm_install');
    e.cause = err;
    throw e;
  }
}

function toPgTime(value) {
  if (!value) return new Date();
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : new Date();
}

function safeJson(value) {
  if (!value || typeof value !== 'object') return {};
  return value;
}

class PostgresStorageAdapter {
  constructor({ connectionString, ssl = false, migrationsDir = path.resolve(__dirname, '../../db/migrations') } = {}) {
    this.connectionString = connectionString || process.env.POSTGRES_URL || process.env.DATABASE_URL || '';
    this.ssl = ssl;
    this.migrationsDir = migrationsDir;
    this.pool = null;
  }

  async connect() {
    if (!this.connectionString) throw new Error('POSTGRES_URL_required');
    const { Pool } = lazyPg();
    this.pool = new Pool({
      connectionString: this.connectionString,
      ssl: this.ssl ? { rejectUnauthorized: false } : undefined,
      max: Number(process.env.POSTGRES_POOL_MAX || 10),
      idleTimeoutMillis: Number(process.env.POSTGRES_IDLE_TIMEOUT_MS || 30_000),
      connectionTimeoutMillis: Number(process.env.POSTGRES_CONNECT_TIMEOUT_MS || 10_000)
    });
    await this.pool.query('select 1');
    return this;
  }

  async close() {
    if (this.pool) await this.pool.end();
    this.pool = null;
  }

  async query(sql, params = []) {
    if (!this.pool) await this.connect();
    return this.pool.query(sql, params);
  }

  async migrate() {
    if (!fs.existsSync(this.migrationsDir)) return [];
    await this.query('CREATE TABLE IF NOT EXISTS avp_schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const files = fs.readdirSync(this.migrationsDir).filter(f => /^\d+_.*\.sql$/.test(f)).sort();
    const applied = [];
    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      const seen = await this.query('SELECT 1 FROM avp_schema_migrations WHERE version=$1', [version]);
      if (seen.rowCount) continue;
      const sql = fs.readFileSync(path.join(this.migrationsDir, file), 'utf8');
      await this.query('BEGIN');
      try {
        await this.query(sql);
        await this.query('INSERT INTO avp_schema_migrations(version) VALUES($1)', [version]);
        await this.query('COMMIT');
        applied.push(version);
      } catch (err) {
        await this.query('ROLLBACK');
        throw err;
      }
    }
    return applied;
  }

  eventToParams(event) {
    const e = event || {};
    return [
      toPgTime(e.time), String(e.projectId || e.project_id || ''), String(e.projectName || e.project_name || ''), String(e.type || 'client_event'),
      String(e.reason || 'none'), String(e.visitor || e.visitorHash || e.visitor_hash || ''), String(e.origin || ''), String(e.page || e.pageUrl || ''),
      String(e.domain || ''), String(e.ipHash || e.ip_hash || ''), String(e.ua || e.userAgent || e.user_agent || ''), String(e.browser || ''), JSON.stringify(safeJson(e.details))
    ];
  }

  async saveEvent(event) {
    const sql = `
      INSERT INTO avp_events
        (time, project_id, project_name, type, reason, visitor_hash, origin, page, domain, ip_hash, user_agent, browser, details)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
    `;
    await this.query(sql, this.eventToParams(event));
  }

  async saveEvents(events = []) {
    const list = (Array.isArray(events) ? events : []).filter(Boolean);
    if (!list.length) return { inserted: 0 };
    const batchSize = Math.max(1, Math.min(1000, Number(process.env.POSTGRES_EVENT_BATCH_SIZE || 500)));
    let inserted = 0;
    for (let i = 0; i < list.length; i += batchSize) {
      const batch = list.slice(i, i + batchSize);
      const params = [];
      const values = [];
      batch.forEach((event, idx) => {
        const base = idx * 13;
        values.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13}::jsonb)`);
        params.push(...this.eventToParams(event));
      });
      await this.query(`
        INSERT INTO avp_events
          (time, project_id, project_name, type, reason, visitor_hash, origin, page, domain, ip_hash, user_agent, browser, details)
        VALUES ${values.join(',')}
      `, params);
      inserted += batch.length;
    }
    return { inserted };
  }

  async saveAudit(entry = {}) {
    await this.query(
      `INSERT INTO avp_audit_log (time, user_id, user_email, action, ip_hash, user_agent, details)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [toPgTime(entry.time), entry.userId || '', entry.userEmail || '', entry.action || '', entry.ipHash || '', entry.ua || entry.userAgent || '', JSON.stringify(safeJson(entry.details))]
    );
  }

  async saveAlert(entry = {}) {
    await this.query(
      `INSERT INTO avp_alerts (time, type, severity, details) VALUES ($1,$2,$3,$4::jsonb)`,
      [toPgTime(entry.time), entry.type || 'alert', entry.severity || 'info', JSON.stringify(safeJson(entry.details))]
    );
  }

  async getProjectByPublicKey(publicKey) {
    const res = await this.query('SELECT * FROM avp_projects WHERE public_key=$1 LIMIT 1', [publicKey]);
    if (!res.rowCount) return null;
    const row = res.rows[0];
    const secrets = await this.query('SELECT * FROM avp_project_secrets WHERE project_id=$1 ORDER BY created_at DESC', [row.id]);
    return this.mapProject(row, secrets.rows);
  }

  async getProjectById(id) {
    const res = await this.query('SELECT * FROM avp_projects WHERE id=$1 LIMIT 1', [id]);
    if (!res.rowCount) return null;
    const secrets = await this.query('SELECT * FROM avp_project_secrets WHERE project_id=$1 ORDER BY created_at DESC', [id]);
    return this.mapProject(res.rows[0], secrets.rows);
  }

  mapProject(row, secretRows = []) {
    return {
      id: row.id,
      companyId: row.company_id,
      name: row.name,
      publicKey: row.public_key,
      mode: row.mode,
      enabled: row.enabled,
      killSwitch: row.kill_switch,
      allowedDomains: row.allowed_domains || [],
      protectedSelector: row.protected_selector,
      adContainerSelector: row.ad_container_selector,
      marketBenchmarkPercent: Number(row.market_benchmark_percent || 33),
      loaderEnabled: row.loader_enabled,
      autoCreateAdContainer: row.auto_create_ad_container,
      strictness: row.strictness,
      sdkVersion: row.sdk_version,
      sdkChannel: row.sdk_channel,
      canaryPercent: Number(row.canary_percent || 0),
      fallbackPolicy: row.fallback_policy,
      hardening: row.hardening || {},
      limits: row.limits || {},
      pathRules: row.path_rules || { allow: [], deny: [] },
      overlayCopy: row.overlay_copy || {},
      domainVerification: row.domain_verification || {},
      planId: row.plan_id || 'pilot',
      quota: row.quota || {},
      secrets: secretRows.map(s => ({
        id: s.id,
        kind: s.kind,
        label: s.label,
        secretKeyEnc: s.secret_key_enc,
        createdAt: s.created_at ? s.created_at.toISOString() : '',
        lastUsedAt: s.last_used_at ? s.last_used_at.toISOString() : '',
        revokedAt: s.revoked_at ? s.revoked_at.toISOString() : ''
      })),
      createdAt: row.created_at ? row.created_at.toISOString() : '',
      updatedAt: row.updated_at ? row.updated_at.toISOString() : ''
    };
  }


  async listCompanies() {
    const res = await this.query('SELECT * FROM avp_companies ORDER BY created_at ASC');
    return res.rows.map(row => ({
      id: row.id,
      name: row.name,
      contactEmail: row.contact_email || '',
      notes: row.notes || '',
      createdAt: row.created_at ? row.created_at.toISOString() : '',
      updatedAt: row.updated_at ? row.updated_at.toISOString() : ''
    }));
  }

  async listProjects() {
    const res = await this.query('SELECT * FROM avp_projects ORDER BY created_at ASC');
    const out = [];
    for (const row of res.rows) {
      const secrets = await this.query('SELECT * FROM avp_project_secrets WHERE project_id=$1 ORDER BY created_at DESC', [row.id]);
      out.push(this.mapProject(row, secrets.rows));
    }
    return out;
  }

  async upsertCompany(company = {}) {
    await this.query(
      `INSERT INTO avp_companies (id, name, contact_email, notes, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name, contact_email=EXCLUDED.contact_email, notes=EXCLUDED.notes, updated_at=now()`,
      [company.id, company.name || 'Company', company.contactEmail || company.contact_email || '', company.notes || '', toPgTime(company.createdAt), toPgTime(company.updatedAt)]
    );
  }

  async upsertProject(project = {}) {
    await this.query(
      `INSERT INTO avp_projects
       (id, company_id, name, public_key, mode, enabled, kill_switch, allowed_domains, protected_selector, ad_container_selector,
        market_benchmark_percent, loader_enabled, auto_create_ad_container, strictness, sdk_version, sdk_channel, canary_percent,
        fallback_policy, hardening, limits, path_rules, overlay_copy, domain_verification, plan_id, quota, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20::jsonb,$21::jsonb,$22::jsonb,$23::jsonb,$24,$25::jsonb,$26,$27)
       ON CONFLICT(id) DO UPDATE SET
        company_id=EXCLUDED.company_id, name=EXCLUDED.name, public_key=EXCLUDED.public_key, mode=EXCLUDED.mode, enabled=EXCLUDED.enabled,
        kill_switch=EXCLUDED.kill_switch, allowed_domains=EXCLUDED.allowed_domains, protected_selector=EXCLUDED.protected_selector,
        ad_container_selector=EXCLUDED.ad_container_selector, market_benchmark_percent=EXCLUDED.market_benchmark_percent,
        loader_enabled=EXCLUDED.loader_enabled, auto_create_ad_container=EXCLUDED.auto_create_ad_container, strictness=EXCLUDED.strictness,
        sdk_version=EXCLUDED.sdk_version, sdk_channel=EXCLUDED.sdk_channel, canary_percent=EXCLUDED.canary_percent,
        fallback_policy=EXCLUDED.fallback_policy, hardening=EXCLUDED.hardening, limits=EXCLUDED.limits, path_rules=EXCLUDED.path_rules,
        overlay_copy=EXCLUDED.overlay_copy, domain_verification=EXCLUDED.domain_verification, plan_id=EXCLUDED.plan_id, quota=EXCLUDED.quota, updated_at=now()`,
      [
        project.id, project.companyId || project.company_id || null, project.name || 'Project', project.publicKey || project.public_key,
        project.mode || 'soft-gate', project.enabled !== false, Boolean(project.killSwitch || project.kill_switch), project.allowedDomains || [],
        project.protectedSelector || '#protected-content', project.adContainerSelector || '#ad-slot', Number(project.marketBenchmarkPercent || 33),
        project.loaderEnabled !== false, project.autoCreateAdContainer !== false, project.strictness || 'balanced', project.sdkVersion || 'v1',
        project.sdkChannel || 'stable', Number(project.canaryPercent || 0), project.fallbackPolicy || 'balanced', JSON.stringify(project.hardening || {}),
        JSON.stringify(project.limits || {}), JSON.stringify(project.pathRules || { allow: [], deny: [] }), JSON.stringify(project.overlayCopy || {}),
        JSON.stringify(project.domainVerification || {}), project.planId || 'pilot', JSON.stringify(project.quota || {}), toPgTime(project.createdAt), toPgTime(project.updatedAt)
      ]
    );
    for (const secret of project.secrets || []) await this.upsertProjectSecret(project.id, secret);
  }

  async upsertProjectSecret(projectId, secret = {}) {
    await this.query(
      `INSERT INTO avp_project_secrets (id, project_id, kind, label, secret_key_enc, created_at, last_used_at, revoked_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT(id) DO UPDATE SET kind=EXCLUDED.kind, label=EXCLUDED.label, secret_key_enc=EXCLUDED.secret_key_enc, last_used_at=EXCLUDED.last_used_at, revoked_at=EXCLUDED.revoked_at`,
      [secret.id, projectId, secret.kind || 'server_verify', secret.label || '', secret.secretKeyEnc || secret.secret_key_enc || '', toPgTime(secret.createdAt), secret.lastUsedAt ? toPgTime(secret.lastUsedAt) : null, secret.revokedAt ? toPgTime(secret.revokedAt) : null]
    );
  }

  async getDashboardStats({ days = 30, recentLimit = 100 } = {}) {
    const safeDays = Math.max(1, Math.min(365, Number(days || 30)));
    const safeRecent = Math.max(1, Math.min(1000, Number(recentLimit || 100)));
    const summary = await this.query(`
      SELECT
        project_id,
        max(project_name) AS project_name,
        count(*)::bigint AS events,
        count(*) FILTER (WHERE type='visit')::bigint AS visits,
        count(*) FILTER (WHERE type='unique_visitor')::bigint AS unique_visitors,
        count(*) FILTER (WHERE type='ad_fragment_delivered')::bigint AS ad_fragments_delivered,
        count(*) FILTER (WHERE type='content_unlocked')::bigint AS content_unlocked,
        count(*) FILTER (WHERE type='overlay_shown')::bigint AS overlay_shown,
        count(*) FILTER (WHERE type='ad_restore')::bigint AS ad_restores,
        count(*) FILTER (WHERE type='connection_issue')::bigint AS connection_issues,
        count(*) FILTER (WHERE type='client_error')::bigint AS client_errors,
        count(*) FILTER (WHERE type='server_verification')::bigint AS server_verifications,
        count(*) FILTER (WHERE type='server_verification_ok')::bigint AS successful_server_verifications,
        count(*) FILTER (WHERE type='proof_ok')::bigint AS proof_ok,
        count(*) FILTER (WHERE type='proof_failed')::bigint AS proof_failed,
        count(*) FILTER (WHERE type='heartbeat_lost')::bigint AS heartbeat_lost,
        count(*) FILTER (WHERE type='scheduled_rerender')::bigint AS scheduled_rerenders,
        count(*) FILTER (WHERE type='abuse')::bigint AS abuse_events
      FROM avp_events
      WHERE time >= now() - ($1::int * interval '1 day')
      GROUP BY project_id
    `, [safeDays]);
    const reasons = await this.query(`
      SELECT project_id, reason, count(*)::bigint AS count
      FROM avp_events
      WHERE time >= now() - ($1::int * interval '1 day') AND reason IS NOT NULL AND reason <> ''
      GROUP BY project_id, reason
      ORDER BY count DESC
      LIMIT 500
    `, [safeDays]);
    const domains = await this.query(`
      SELECT project_id, domain, count(*)::bigint AS count
      FROM avp_events
      WHERE time >= now() - ($1::int * interval '1 day') AND domain IS NOT NULL AND domain <> ''
      GROUP BY project_id, domain
      ORDER BY count DESC
      LIMIT 500
    `, [safeDays]);
    const browsers = await this.query(`
      SELECT project_id, browser, count(*)::bigint AS count
      FROM avp_events
      WHERE time >= now() - ($1::int * interval '1 day') AND browser IS NOT NULL AND browser <> ''
      GROUP BY project_id, browser
      ORDER BY count DESC
      LIMIT 500
    `, [safeDays]);
    const daily = await this.query(`
      SELECT * FROM avp_daily_stats
      WHERE day >= current_date - $1::int
      ORDER BY day DESC
    `, [safeDays]);
    const recent = await this.query(`
      SELECT time, project_id, project_name, type, reason, visitor_hash, origin, page, domain, ip_hash, user_agent, browser, details
      FROM avp_events
      ORDER BY time DESC
      LIMIT $1
    `, [safeRecent]);
    return { summary: summary.rows, reasons: reasons.rows, domains: domains.rows, browsers: browsers.rows, daily: daily.rows, recent: recent.rows };
  }

  async bootstrapFromState(state = {}) {
    for (const company of state.companies || []) await this.upsertCompany(company);
    for (const project of state.projects || []) await this.upsertProject(project);
    return { companies: (state.companies || []).length, projects: (state.projects || []).length };
  }
}

module.exports = { PostgresStorageAdapter };
