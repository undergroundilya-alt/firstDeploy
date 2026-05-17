#!/usr/bin/env node
'use strict';

const { loadLocalEnvFile } = require('./load-local-env');
function getCreateMockProject() { return require('./mock-postgres-project').createMockProject; }

function randomId(prefix) { return `${prefix}_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`; }
function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function normalizeEmail(email) { return String(email || '').trim().toLowerCase(); }
function envBool(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return String(value).toLowerCase() === 'true' || value === '1';
}

async function ensureClientLinkTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS avp_client_project_links (
      account_id text NOT NULL REFERENCES avp_client_accounts(id) ON DELETE CASCADE,
      project_id text NOT NULL,
      role text NOT NULL DEFAULT 'owner',
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(account_id, project_id)
    )
  `);
}

async function ensureSeedAccount(pool, seedEmail) {
  if (!seedEmail) return null;
  const accountId = `acct_seed_${seedEmail.replace(/[^a-z0-9]+/g, '_').slice(0, 42)}`;
  await pool.query(`
    INSERT INTO avp_client_accounts (
      id,email,full_name,phone,company_name,password_algo,password_iterations,password_salt,password_hash,provider,role,status,email_verified,trial_ends_at,created_at,updated_at
    )
    VALUES ($1,$2,$3,'','Mock Client','seed',0,'seed','seed','seed','client_owner','trial',true,now() + interval '30 days',now(),now())
    ON CONFLICT(email) DO UPDATE SET updated_at=now()
  `, [accountId, seedEmail, seedEmail.split('@')[0] || 'Mock Client']);
  const byEmail = await pool.query('SELECT id,email FROM avp_client_accounts WHERE lower(trim(email))=$1 LIMIT 1', [seedEmail]);
  return byEmail.rows[0] || null;
}

async function findSeedAccount(pool) {
  const seedEmail = normalizeEmail(process.env.SEED_EMAIL || process.env.SEED_ACCOUNT_EMAIL || process.env.SMTP_USER || process.env.MOCK_CONTACT_EMAIL || '');
  try {
    await ensureClientLinkTable(pool);
    if (seedEmail) {
      const byEmail = await pool.query('SELECT id,email FROM avp_client_accounts WHERE lower(trim(email))=$1 LIMIT 1', [seedEmail]);
      if (byEmail.rowCount) return { account: byEmail.rows[0], source: 'email', seedEmail };
      const created = await ensureSeedAccount(pool, seedEmail);
      if (created) return { account: created, source: 'seed_email_created', seedEmail };
    }
    const latest = await pool.query('SELECT id,email FROM avp_client_accounts ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST LIMIT 1');
    if (latest.rowCount) return { account: latest.rows[0], source: 'latest_account', seedEmail };
  } catch (err) {
    return { account: null, source: 'client_accounts_unavailable', seedEmail, error: err.message };
  }
  return { account: null, source: 'none', seedEmail };
}

async function projectForSeed(pool) {
  const requestedProjectId = process.env.SEED_PROJECT_ID || '';
  if (requestedProjectId) {
    const byId = await pool.query('SELECT id,name,public_key FROM avp_projects WHERE id=$1 LIMIT 1', [requestedProjectId]);
    if (byId.rowCount) return { project: byId.rows[0], account: null, linked: false, source: 'SEED_PROJECT_ID' };
  }

  const accountInfo = await findSeedAccount(pool);
  const account = accountInfo.account || null;
  if (account) {
    const linked = await pool.query(`
      SELECT p.id,p.name,p.public_key
      FROM avp_client_project_links l
      JOIN avp_projects p ON p.id=l.project_id
      WHERE l.account_id=$1
      ORDER BY l.created_at DESC
      LIMIT 1
    `, [account.id]);
    if (linked.rowCount) return { project: linked.rows[0], account, linked: true, source: `linked_${accountInfo.source}` };

    const mock = await getCreateMockProject()(pool, { accountEmail: account.email, suffix: account.id.slice(-6) });
    await pool.query(
      'INSERT INTO avp_client_project_links(account_id,project_id,role) VALUES($1,$2,$3) ON CONFLICT(account_id,project_id) DO NOTHING',
      [account.id, mock.projectId, 'owner']
    );
    const created = await pool.query('SELECT id,name,public_key FROM avp_projects WHERE id=$1 LIMIT 1', [mock.projectId]);
    console.log(JSON.stringify({ ok: true, message: 'mock_project_created_and_linked_to_account', accountId: account.id, accountEmail: account.email, projectId: mock.projectId, projectName: mock.projectName }, null, 2));
    return { project: created.rows[0], account, linked: true, source: `created_for_${accountInfo.source}` };
  }

  const latest = await pool.query('SELECT id,name,public_key FROM avp_projects ORDER BY created_at DESC LIMIT 1');
  if (latest.rowCount) return { project: latest.rows[0], account: null, linked: false, source: 'latest_project_no_account' };

  const autoCreate = String(process.env.SEED_AUTO_PROJECT || 'true').toLowerCase() !== 'false';
  if (!autoCreate) throw new Error('No project found in avp_projects. Create a project first, then run this script again.');
  const mock = await getCreateMockProject()(pool);
  const created = await pool.query('SELECT id,name,public_key FROM avp_projects WHERE id=$1 LIMIT 1', [mock.projectId]);
  if (!created.rowCount) throw new Error('Mock project creation failed: avp_projects still has no matching project.');
  console.log(JSON.stringify({ ok: true, message: 'mock_project_created', projectId: mock.projectId, projectName: mock.projectName }, null, 2));
  return { project: created.rows[0], account: null, linked: false, source: 'created_no_account' };
}

function curveForDay(day, days) {
  const age = days - 1 - day;
  const weeklyPulse = Math.sin((day + 1) / Math.max(2, days) * Math.PI * 2) * 28;
  const growth = age * 2.2;
  const visits = Math.max(20, Math.round(90 + growth + weeklyPulse + Math.random() * 70));
  const overlayRate = Math.min(0.42, Math.max(0.04, 0.07 + (day % 6) * 0.025 + Math.random() * 0.08));
  const overlays = Math.max(1, Math.round(visits * overlayRate));
  const unlocks = Math.max(1, Math.round(visits * (0.42 + Math.random() * 0.28)));
  return { visits, overlays, unlocks };
}

async function main() {
  loadLocalEnvFile();
  const appEnv = String(process.env.APP_ENV || process.env.NODE_ENV || '').toLowerCase();
  if ((appEnv === 'production' || appEnv === 'prod') && !envBool('ALLOW_PRODUCTION_MOCK_SEED', false)) {
    throw new Error('Refusing to seed mock analytics into production. Use a staging database, set APP_ENV=staging, or deliberately set ALLOW_PRODUCTION_MOCK_SEED=true.');
  }
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
  if (!connectionString) throw new Error('DATABASE_URL or POSTGRES_URL is required to seed remote analytics');
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString, ssl: envBool('POSTGRES_SSL') ? { rejectUnauthorized: false } : undefined });
  try {
    const seed = await projectForSeed(pool);
    const project = seed.project;
    if (!project) throw new Error('No project selected for analytics seed.');

    if (envBool('SEED_CLEAR', false)) {
      const deleted = await pool.query("DELETE FROM avp_events WHERE project_id=$1 AND details->>'seeded'='true'", [project.id]);
      console.log(JSON.stringify({ ok: true, message: 'seeded_events_cleared', projectId: project.id, deleted: deleted.rowCount }, null, 2));
    }

    const domains = String(process.env.SEED_DOMAINS || 'somesite.com,www.somesite.com,localhost,127.0.0.1').split(',').map(x => x.trim()).filter(Boolean);
    const days = Math.max(1, Math.min(180, Number(process.env.SEED_DAYS || 90))); // one seed covers Today / Week / Month / All time filters
    const rows = [];
    for (let day = days - 1; day >= 0; day--) {
      const base = new Date(Date.now() - day * 24 * 60 * 60 * 1000);
      const index = days - 1 - day;
      const { visits, overlays, unlocks } = curveForDay(index, days);
      for (let i = 0; i < visits; i++) {
        const t = new Date(base);
        t.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60), Math.floor(Math.random() * 60), 0);
        const domain = choice(domains);
        rows.push({ time: t, type: 'visit', reason: 'page_view', domain, page: `https://${domain}/article-${1 + (i % 7)}` });
      }
      for (let i = 0; i < overlays; i++) {
        const t = new Date(base);
        t.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60), Math.floor(Math.random() * 60), 0);
        const domain = choice(domains);
        rows.push({ time: t, type: 'overlay_shown', reason: choice(['ad_container_hidden','ad_slot_removed','heartbeat_ad_not_visible','persistent_dom_tamper']), domain, page: `https://${domain}/article-${1 + (i % 7)}` });
      }
      for (let i = 0; i < unlocks; i++) {
        const t = new Date(base);
        t.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60), Math.floor(Math.random() * 60), 0);
        const domain = choice(domains);
        rows.push({ time: t, type: 'content_unlocked', reason: 'verified_visible_ad', domain, page: `https://${domain}/article-${1 + (i % 7)}` });
      }
    }

    const batchSize = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const values = [];
      const params = [];
      batch.forEach((event, idx) => {
        const b = idx * 13;
        values.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13}::jsonb)`);
        params.push(event.time, project.id, project.name, event.type, event.reason, randomId('v').slice(0, 18), `https://${event.domain}`, event.page, event.domain, randomId('ip').slice(0, 16), 'seed-script', 'seed', JSON.stringify({ seeded: true, seedSource: seed.source }));
      });
      await pool.query(`INSERT INTO avp_events(time,project_id,project_name,type,reason,visitor_hash,origin,page,domain,ip_hash,user_agent,browser,details) VALUES ${values.join(',')}`, params);
      inserted += batch.length;
    }
    console.log(JSON.stringify({ ok: true, projectId: project.id, projectName: project.name, seedSource: seed.source, linkedAccountId: seed.account?.id || null, inserted, days, domains, hint: `Open /account/projects/${project.id}/analytics?period=week&view=percent` }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
