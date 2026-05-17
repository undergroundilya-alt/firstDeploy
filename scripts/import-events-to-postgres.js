'use strict';
const { loadLocalEnvFile } = require('./load-local-env');
loadLocalEnvFile();
console.log(`This project ships the PostgreSQL schema in db/postgres_schema.sql.
For a real import install pg and stream data/events/*.ndjson into avp_events.
Suggested command after npm install pg:
  DATABASE_URL=postgres://... node scripts/import-events-to-postgres.js --run

The app remains JSON/NDJSON-first in v1.8 so it can run without a database.
`);
if (process.argv.includes('--run')) {
  try { require.resolve('pg'); } catch { console.error('Package pg is not installed. Run: npm install pg'); process.exit(1); }
  console.error('Importer scaffold intentionally stops here. Map NDJSON fields to db/postgres_schema.sql avp_events before using in production.');
  process.exit(1);
}
