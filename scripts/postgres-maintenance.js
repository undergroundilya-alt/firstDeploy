'use strict';
const { loadLocalEnvFile } = require('./load-local-env');
loadLocalEnvFile();

const { PostgresStorageAdapter } = require('../src/adapters/postgres-adapter');

const retentionDays = Math.max(1, Number(process.env.POSTGRES_EVENT_RETENTION_DAYS || 180));
const dryRun = String(process.env.POSTGRES_MAINTENANCE_DRY_RUN || '').toLowerCase() === 'true';

(async () => {
  const db = new PostgresStorageAdapter({
    connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
    ssl: String(process.env.POSTGRES_SSL || '').toLowerCase() === 'true'
  });
  await db.connect();
  const before = await db.query('SELECT count(*)::bigint AS events FROM avp_events WHERE time < now() - ($1::int * interval \'1 day\')', [retentionDays]);
  let deleted = 0;
  if (!dryRun) {
    const del = await db.query('DELETE FROM avp_events WHERE time < now() - ($1::int * interval \'1 day\')', [retentionDays]);
    deleted = del.rowCount || 0;
    await db.query('ANALYZE avp_events');
    await db.query('ANALYZE avp_daily_stats');
    await db.query('ANALYZE avp_projects');
  }
  const sizes = await db.query(`
    SELECT relname AS table, pg_size_pretty(pg_total_relation_size(quote_ident(relname))) AS total_size
    FROM pg_stat_user_tables
    WHERE relname IN ('avp_events','avp_daily_stats','avp_projects','avp_visitor_sessions')
    ORDER BY pg_total_relation_size(quote_ident(relname)) DESC
  `);
  await db.close();
  console.log(JSON.stringify({ ok: true, dryRun, retentionDays, oldEvents: Number(before.rows[0]?.events || 0), deleted, sizes: sizes.rows }, null, 2));
})().catch(err => {
  console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
});
