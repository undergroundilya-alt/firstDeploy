#!/usr/bin/env node
'use strict';

const { loadLocalEnvFile } = require('./load-local-env');
loadLocalEnvFile();

const { Pool } = require('pg');

function envBool(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

function csv(value, fallback) {
  return String(value || fallback)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

async function createMockProject(pool, opts = {}) {
  const suffix = opts.suffix ? `_${String(opts.suffix).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12)}` : '';
  const companyId = process.env.MOCK_COMPANY_ID || `cmp_mock_adproof${suffix}`;
  const projectId = process.env.MOCK_PROJECT_ID || process.env.SEED_PROJECT_ID || `prj_mock_adproof${suffix}`;
  const projectName = process.env.MOCK_PROJECT_NAME || 'Mock Analytics Project';
  const contactEmail = opts.accountEmail || process.env.MOCK_CONTACT_EMAIL || process.env.SMTP_USER || 'client@example.com';
  const publicKey = process.env.MOCK_PUBLIC_KEY || 'pk_mock_adproof_local';
  const allowedDomains = csv(process.env.MOCK_DOMAINS || process.env.SEED_DOMAINS, 'somesite.com,www.somesite.com,localhost,127.0.0.1');

  await pool.query(`
    INSERT INTO avp_companies (id, name, contact_email, notes)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        contact_email = EXCLUDED.contact_email,
        notes = EXCLUDED.notes,
        updated_at = now()
  `, [companyId, 'Mock Client Company', contactEmail, 'Local mock company for remote analytics testing']);

  await pool.query(`
    INSERT INTO avp_projects (
      id,
      company_id,
      name,
      public_key,
      mode,
      allowed_domains,
      protected_selector,
      ad_container_selector,
      enabled,
      kill_switch
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, false)
    ON CONFLICT (id) DO UPDATE
    SET company_id = EXCLUDED.company_id,
        name = EXCLUDED.name,
        public_key = EXCLUDED.public_key,
        mode = EXCLUDED.mode,
        allowed_domains = EXCLUDED.allowed_domains,
        protected_selector = EXCLUDED.protected_selector,
        ad_container_selector = EXCLUDED.ad_container_selector,
        enabled = true,
        kill_switch = false,
        updated_at = now()
  `, [
    projectId,
    companyId,
    projectName,
    publicKey,
    'soft-gate',
    allowedDomains,
    '#protected-content',
    '#ad-slot'
  ]);

  return { companyId, projectId, projectName, publicKey, allowedDomains };
}

async function main() {
  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL || '';
  if (!connectionString) {
    throw new Error('DATABASE_URL or POSTGRES_URL is required to create a mock project');
  }

  const pool = new Pool({
    connectionString,
    ssl: envBool('POSTGRES_SSL') ? { rejectUnauthorized: false } : undefined
  });

  try {
    const result = await createMockProject(pool);
    const email = String(process.env.SEED_EMAIL || process.env.SEED_ACCOUNT_EMAIL || process.env.SMTP_USER || process.env.MOCK_CONTACT_EMAIL || '').trim().toLowerCase();
    if (email) {
      try {
        await pool.query(`CREATE TABLE IF NOT EXISTS avp_client_project_links (account_id text NOT NULL REFERENCES avp_client_accounts(id) ON DELETE CASCADE, project_id text NOT NULL, role text NOT NULL DEFAULT 'owner', created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(account_id, project_id))`);
        const account = await pool.query('SELECT id,email FROM avp_client_accounts WHERE lower(trim(email))=$1 LIMIT 1', [email]);
        if (account.rowCount) {
          await pool.query('INSERT INTO avp_client_project_links(account_id,project_id,role) VALUES($1,$2,$3) ON CONFLICT(account_id,project_id) DO NOTHING', [account.rows[0].id, result.projectId, 'owner']);
          result.linkedAccountId = account.rows[0].id;
          result.linkedAccountEmail = account.rows[0].email;
        }
      } catch (err) {
        result.linkWarning = err.message;
      }
    }
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});

module.exports = { createMockProject };
