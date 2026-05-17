'use strict';
const { loadLocalEnvFile } = require('./load-local-env');
loadLocalEnvFile();

const fs = require('fs');
const path = require('path');
const { RedisQueueAdapter } = require('../src/adapters/redis-queue-adapter');
const { PostgresStorageAdapter } = require('../src/adapters/postgres-adapter');

const eventDir = path.resolve(process.env.EVENT_LOG_DIR || (process.env.STORAGE_ROOT && path.join(process.env.STORAGE_ROOT, 'events')) || './storage/events');
const checkpointFile = path.resolve(process.env.INGESTION_CHECKPOINT_FILE || (process.env.STORAGE_ROOT && path.join(process.env.STORAGE_ROOT, 'worker-ingestion-checkpoint.json')) || './storage/worker-ingestion-checkpoint.json');
const once = String(process.env.WORKER_ONCE || '').toLowerCase() === 'true';
const consumer = process.env.WORKER_CONSUMER_NAME || `ingestion-${process.pid}`;
const batchSize = Number(process.env.WORKER_BATCH_SIZE || 100);

function readCheckpoint() { try { return JSON.parse(fs.readFileSync(checkpointFile, 'utf8')); } catch { return { files: {} }; } }
function saveCheckpoint(cp) { fs.mkdirSync(path.dirname(checkpointFile), { recursive: true }); fs.writeFileSync(checkpointFile, JSON.stringify(cp, null, 2)); }
function listLogs() { if (!fs.existsSync(eventDir)) return []; return fs.readdirSync(eventDir).filter(f => /^events-.*\.ndjson$/.test(f)).sort(); }

function unwrapEvent(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.schema === 'avp.event.v1') return obj;
  if (obj.event && typeof obj.event === 'object') return obj.event;
  return null;
}

async function flushBatch(db, batch) {
  if (!batch.length) return 0;
  if (db) await db.saveEvents(batch);
  const count = batch.length;
  batch.length = 0;
  return count;
}

async function ingestFileBacklog(db) {
  let processed = 0, invalid = 0;
  const cp = readCheckpoint();
  for (const f of listLogs()) {
    const full = path.join(eventDir, f);
    const offset = cp.files[f]?.offset || 0;
    const raw = fs.readFileSync(full, 'utf8');
    const slice = raw.slice(offset);
    const batch = [];
    for (const line of slice.split(/\n+/)) {
      if (!line.trim()) continue;
      try {
        const event = unwrapEvent(JSON.parse(line));
        if (!event) { invalid++; continue; }
        batch.push(event);
        if (batch.length >= batchSize) processed += await flushBatch(db, batch);
      } catch { invalid++; }
    }
    processed += await flushBatch(db, batch);
    cp.files[f] = { offset: raw.length, updatedAt: new Date().toISOString() };
  }
  saveCheckpoint(cp);
  return { processed, invalid, source: 'file', eventDir, checkpointFile, batchSize };
}

async function ingestRedisStream(db, redis) {
  let processed = 0, invalid = 0;
  const messages = await redis.readGroup({ consumer, count: batchSize, blockMs: Number(process.env.WORKER_BLOCK_MS || 5000) });
  const ackIds = [];
  const batch = [];
  for (const msg of messages) {
    const event = unwrapEvent(msg.event);
    if (!event) { invalid++; ackIds.push(msg.id); continue; }
    batch.push(event);
    ackIds.push(msg.id);
  }
  if (batch.length) {
    try {
      if (!db) throw new Error('POSTGRES_URL_required_for_redis_ingestion');
      await db.saveEvents(batch);
      processed = batch.length;
    } catch (err) {
      console.error(JSON.stringify({ time: new Date().toISOString(), level: 'error', message: 'event_batch_ingestion_failed', batch: batch.length, error: err.message }));
      // Do not ack failed batch; messages remain pending for replay.
      return { processed, invalid, source: 'redis', acked: 0, failedBatch: batch.length };
    }
  }
  if (ackIds.length) await redis.ack(ackIds);
  return { processed, invalid, source: 'redis', acked: ackIds.length, batchSize };
}


(async () => {
  const postgresUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL || '';
  const redisUrl = process.env.REDIS_URL || '';
  const db = postgresUrl ? new PostgresStorageAdapter({ connectionString: postgresUrl, ssl: String(process.env.POSTGRES_SSL || '').toLowerCase() === 'true' }) : null;
  if (db) { await db.connect(); if (String(process.env.POSTGRES_AUTO_MIGRATE || '').toLowerCase() === 'true') await db.migrate(); }

  const redis = redisUrl ? new RedisQueueAdapter({ url: redisUrl, stream: process.env.REDIS_EVENT_STREAM || 'avp:events' }) : null;
  if (redis) await redis.connect();

  if (!redis) {
    const result = await ingestFileBacklog(db);
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
    if (db) await db.close();
    return;
  }

  do {
    const result = await ingestRedisStream(db, redis);
    if (result.processed || result.invalid || once) console.log(JSON.stringify({ ok: true, ...result }));
  } while (!once);

  await redis.close();
  if (db) await db.close();
})().catch(err => {
  console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
});
