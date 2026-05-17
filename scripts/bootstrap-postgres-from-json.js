'use strict';
const { loadLocalEnvFile } = require('./load-local-env');
loadLocalEnvFile();
const fs = require('fs');
const path = require('path');
const { PostgresStorageAdapter } = require('../src/adapters/postgres-adapter');

const STORAGE_ROOT = path.resolve(__dirname, '..', process.env.STORAGE_ROOT || './storage');
const DATA_FILE = path.resolve(__dirname, '..', process.env.DATA_FILE || path.join(STORAGE_ROOT, 'saas-state.json'));

(async () => {
  if (!fs.existsSync(DATA_FILE)) throw new Error(`state file not found: ${DATA_FILE}`);
  const state = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const db = new PostgresStorageAdapter({ connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL, ssl: String(process.env.POSTGRES_SSL || '').toLowerCase() === 'true' });
  await db.connect();
  await db.migrate();
  const result = await db.bootstrapFromState(state);
  console.log(JSON.stringify({ ok: true, source: DATA_FILE, ...result }, null, 2));
  await db.close();
})().catch(err => {
  console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
});
