'use strict';

const { loadLocalEnvFile } = require('./load-local-env');
loadLocalEnvFile();

function setDefault(name, value) {
  if (process.env[name] === undefined || process.env[name] === '') process.env[name] = value;
}

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
if (/render\.com/i.test(url) || /sslmode=require/i.test(url)) process.env.POSTGRES_SSL = 'true';

const { PostgresStorageAdapter } = require('../src/adapters/postgres-adapter');

(async () => {
  if (!url) throw new Error('DATABASE_URL_or_POSTGRES_URL_required');
  const db = new PostgresStorageAdapter({
    connectionString: url,
    ssl: String(process.env.POSTGRES_SSL || '').toLowerCase() === 'true' || /render\.com/i.test(url) || /sslmode=require/i.test(url)
  });
  await db.connect();
  const applied = await db.migrate();
  const tables = await db.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema='public' AND table_name LIKE 'avp_%'
    ORDER BY table_name
  `);
  console.log(JSON.stringify({
    ok: true,
    ssl: String(process.env.POSTGRES_SSL || '').toLowerCase() === 'true' || /render\.com/i.test(url) || /sslmode=require/i.test(url),
    applied,
    avpTables: tables.rows.map(r => r.table_name),
    next: 'Run npm start, then open /debug/test-site-scripts and /manual-test.'
  }, null, 2));
  await db.close();
})().catch(err => {
  console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
});
