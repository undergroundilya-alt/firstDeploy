'use strict';

const { loadLocalEnvFile } = require('./load-local-env');
loadLocalEnvFile();

function lazyPg() {
  try { return require('pg'); }
  catch (err) {
    const e = new Error('pg_package_missing_run_npm_install');
    e.cause = err;
    throw e;
  }
}

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
const ssl = String(process.env.POSTGRES_SSL || '').toLowerCase() === 'true' || /render\.com/i.test(connectionString) || /sslmode=require/i.test(connectionString);

if (!connectionString) {
  console.error('[db:inspect] DATABASE_URL or POSTGRES_URL is missing. Put it in .env first.');
  process.exit(1);
}

const { Pool } = lazyPg();
const pool = new Pool({
  connectionString,
  ssl: ssl ? { rejectUnauthorized: false } : undefined,
  max: 3,
  connectionTimeoutMillis: Number(process.env.POSTGRES_CONNECT_TIMEOUT_MS || 10000),
  idleTimeoutMillis: 10000
});

async function safeCount(table) {
  try {
    const res = await pool.query(`SELECT count(*)::int AS count FROM ${table}`);
    return res.rows[0].count;
  } catch (err) {
    return `missing_or_unavailable: ${err.message}`;
  }
}

async function main() {
  const now = await pool.query('select now() as now, current_database() as database, current_user as user');
  const tableRows = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema='public' AND table_name LIKE 'avp_%'
    ORDER BY table_name
  `);

  const counts = {};
  for (const table of [
    'avp_client_accounts',
    'avp_users',
    'avp_companies',
    'avp_projects',
    'avp_client_project_links',
    'avp_events',
    'avp_password_reset_tokens',
    'avp_leads'
  ]) {
    counts[table] = await safeCount(table);
  }

  const recentClientAccounts = await pool.query(`
    SELECT id, email, full_name, provider, status, plan_id, email_verified, trial_ends_at, created_at
    FROM avp_client_accounts
    ORDER BY created_at DESC
    LIMIT 10
  `).catch(() => ({ rows: [] }));

  const recentProjects = await pool.query(`
    SELECT p.id, p.name, p.public_key, p.mode, p.enabled, p.allowed_domains, p.created_at,
           COALESCE(array_agg(a.email) FILTER (WHERE a.email IS NOT NULL), '{}') AS linked_accounts
    FROM avp_projects p
    LEFT JOIN avp_client_project_links l ON l.project_id = p.id
    LEFT JOIN avp_client_accounts a ON a.id = l.account_id
    GROUP BY p.id
    ORDER BY p.created_at DESC
    LIMIT 10
  `).catch(() => ({ rows: [] }));

  console.log(JSON.stringify({
    ok: true,
    connected: now.rows[0],
    avpTables: tableRows.rows.map(r => r.table_name),
    counts,
    recentClientAccounts: recentClientAccounts.rows,
    recentProjects: recentProjects.rows
  }, null, 2));
}

main().catch(err => {
  console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
}).finally(async () => {
  await pool.end().catch(() => {});
});
