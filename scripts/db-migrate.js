'use strict';
const { loadLocalEnvFile } = require('./load-local-env');
loadLocalEnvFile();
const { PostgresStorageAdapter } = require('../src/adapters/postgres-adapter');

(async () => {
  const db = new PostgresStorageAdapter({ connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL, ssl: String(process.env.POSTGRES_SSL || '').toLowerCase() === 'true' });
  await db.connect();
  const applied = await db.migrate();
  console.log(JSON.stringify({ ok: true, applied }, null, 2));
  await db.close();
})().catch(err => {
  console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
});
