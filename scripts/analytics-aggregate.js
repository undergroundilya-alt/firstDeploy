'use strict';
const { loadLocalEnvFile } = require('./load-local-env');
loadLocalEnvFile();

const fs = require('fs');
const path = require('path');
const { PostgresStorageAdapter } = require('../src/adapters/postgres-adapter');

const eventDir = path.resolve(process.env.EVENT_LOG_DIR || (process.env.STORAGE_ROOT && path.join(process.env.STORAGE_ROOT, 'events')) || './storage/events');
const outFile = path.resolve(process.env.ANALYTICS_AGGREGATE_FILE || (process.env.STORAGE_ROOT && path.join(process.env.STORAGE_ROOT, 'analytics-aggregate.json')) || './storage/analytics-aggregate.json');

async function aggregatePostgres() {
  const db = new PostgresStorageAdapter({ connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL, ssl: String(process.env.POSTGRES_SSL || '').toLowerCase() === 'true' });
  await db.connect();
  const days = Number(process.env.ANALYTICS_AGGREGATE_DAYS || 90);
  await db.query(`
    INSERT INTO avp_daily_stats
      (project_id, day, events, visits, unique_visitors, content_unlocked, overlay_shown, ad_restores, connection_issues, client_errors, proof_failed, server_verifications, successful_server_verifications, abuse_events, updated_at)
    SELECT
      project_id,
      date_trunc('day', time)::date AS day,
      count(*)::bigint,
      count(*) FILTER (WHERE type='visit')::bigint,
      count(*) FILTER (WHERE type='unique_visitor')::bigint,
      count(*) FILTER (WHERE type='content_unlocked')::bigint,
      count(*) FILTER (WHERE type='overlay_shown')::bigint,
      count(*) FILTER (WHERE type='ad_restore')::bigint,
      count(*) FILTER (WHERE type='connection_issue')::bigint,
      count(*) FILTER (WHERE type='client_error')::bigint,
      count(*) FILTER (WHERE type='proof_failed')::bigint,
      count(*) FILTER (WHERE type='server_verification')::bigint,
      count(*) FILTER (WHERE type='server_verification_ok')::bigint,
      count(*) FILTER (WHERE type='abuse')::bigint,
      now()
    FROM avp_events
    WHERE time >= now() - ($1::int * interval '1 day')
    GROUP BY project_id, date_trunc('day', time)::date
    ON CONFLICT(project_id, day) DO UPDATE SET
      events=EXCLUDED.events,
      visits=EXCLUDED.visits,
      unique_visitors=EXCLUDED.unique_visitors,
      content_unlocked=EXCLUDED.content_unlocked,
      overlay_shown=EXCLUDED.overlay_shown,
      ad_restores=EXCLUDED.ad_restores,
      connection_issues=EXCLUDED.connection_issues,
      client_errors=EXCLUDED.client_errors,
      proof_failed=EXCLUDED.proof_failed,
      server_verifications=EXCLUDED.server_verifications,
      successful_server_verifications=EXCLUDED.successful_server_verifications,
      abuse_events=EXCLUDED.abuse_events,
      updated_at=now()
  `, [days]);
  const summary = await db.query(`
    SELECT project_id,
      count(*)::int AS events,
      count(*) FILTER (WHERE type='proof_failed')::int AS proof_failed,
      count(*) FILTER (WHERE type='overlay_shown')::int AS overlay_shown,
      count(*) FILTER (WHERE type='content_unlocked')::int AS content_unlocked
    FROM avp_events
    WHERE time >= now() - ($1::int * interval '1 day')
    GROUP BY project_id
    ORDER BY events DESC
  `, [days]);
  await db.close();
  return { ok: true, source: 'postgres', days, projects: summary.rows };
}

function aggregateFiles() {
  const aggregate = { schema: 'avp.analytics.aggregate.v1', generatedAt: new Date().toISOString(), source: 'file', projects: {}, global: { events: 0, proofFailed: 0, overlayShown: 0, contentUnlocked: 0 } };
  if (fs.existsSync(eventDir)) {
    for (const f of fs.readdirSync(eventDir).filter(x => /^events-.*\.ndjson$/.test(x)).sort()) {
      for (const line of fs.readFileSync(path.join(eventDir, f), 'utf8').split(/\n+/)) {
        if (!line.trim()) continue;
        let row; try { row = JSON.parse(line); } catch { continue; }
        const e = row.schema === 'avp.event.v1' ? row : row.event || row;
        const id = e.projectId || 'unknown';
        const p = aggregate.projects[id] ||= { projectName: e.projectName || id, events: 0, reasons: {}, domains: {}, browsers: {} };
        p.events++; aggregate.global.events++;
        if (e.type === 'proof_failed') aggregate.global.proofFailed++;
        if (e.type === 'overlay_shown') aggregate.global.overlayShown++;
        if (e.type === 'content_unlocked') aggregate.global.contentUnlocked++;
        if (e.reason) p.reasons[e.reason] = (p.reasons[e.reason] || 0) + 1;
        if (e.domain) p.domains[e.domain] = (p.domains[e.domain] || 0) + 1;
        if (e.browser) p.browsers[e.browser] = (p.browsers[e.browser] || 0) + 1;
      }
    }
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(aggregate, null, 2));
  return { ok: true, source: 'file', outFile, projects: Object.keys(aggregate.projects).length, events: aggregate.global.events };
}

(async () => {
  if (process.env.POSTGRES_URL || process.env.DATABASE_URL) console.log(JSON.stringify(await aggregatePostgres(), null, 2));
  else console.log(JSON.stringify(aggregateFiles(), null, 2));
})().catch(err => {
  console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
});
