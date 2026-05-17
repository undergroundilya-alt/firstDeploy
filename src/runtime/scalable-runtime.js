'use strict';

const { RedisQueueAdapter } = require('../adapters/redis-queue-adapter');
const { PostgresStorageAdapter } = require('../adapters/postgres-adapter');

function enabled(value) { return String(value || '').toLowerCase() === 'true' || value === '1'; }

function createScalableRuntime({ visitorSessionTtlMs = 2 * 60 * 60 * 1000, state = null, logger = console } = {}) {
  const redisUrl = process.env.REDIS_URL || '';
  const postgresUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL || '';
  const useRedisRuntime = enabled(process.env.ENABLE_REDIS_RUNTIME || process.env.CLUSTER_MODE) && Boolean(redisUrl);
  const useRedisQueue = enabled(process.env.ENABLE_REDIS_EVENT_QUEUE || process.env.CLUSTER_MODE) && Boolean(redisUrl);
  const usePostgres = enabled(process.env.ENABLE_POSTGRES_STORAGE || process.env.ENABLE_APP_DB || (postgresUrl ? 'true' : 'false') || process.env.CLUSTER_MODE) && Boolean(postgresUrl);
  const usePostgresEventsDirect = enabled(process.env.POSTGRES_DIRECT_EVENT_WRITE || (usePostgres && !useRedisQueue ? 'true' : 'false')) && Boolean(postgresUrl);

  const redis = (useRedisRuntime || useRedisQueue) ? new RedisQueueAdapter({ url: redisUrl }) : null;
  const pg = usePostgres ? new PostgresStorageAdapter({ connectionString: postgresUrl, ssl: enabled(process.env.POSTGRES_SSL) }) : null;

  let connected = false;

  async function connect() {
    if (redis) await redis.connect();
    if (pg) {
      await pg.connect();
      if (enabled(process.env.POSTGRES_AUTO_MIGRATE || process.env.CLUSTER_MODE)) await pg.migrate();
      if (state && enabled(process.env.POSTGRES_BOOTSTRAP_FROM_JSON || process.env.CLUSTER_MODE)) await pg.bootstrapFromState(state);
    }
    connected = true;
    logger.log(JSON.stringify({ time: new Date().toISOString(), level: 'log', message: 'scalable_runtime_connected', redis: Boolean(redis), postgres: Boolean(pg), redisRuntime: useRedisRuntime, redisQueue: useRedisQueue }));
    return api;
  }

  async function close() {
    if (redis) await redis.close();
    if (pg) await pg.close();
    connected = false;
  }

  function isRedisRuntimeEnabled() { return Boolean(redis && useRedisRuntime); }
  function isRedisQueueEnabled() { return Boolean(redis && useRedisQueue); }
  function isPostgresEnabled() { return Boolean(pg); }
  function isPostgresDirectEventWriteEnabled() { return Boolean(pg && usePostgresEventsDirect); }

  async function getVisitorSession(token) {
    if (!token) return null;
    if (!isRedisRuntimeEnabled()) return null;
    return redis.getJson(`sess:${token}`);
  }

  async function setVisitorSession(token, session) {
    if (!token || !isRedisRuntimeEnabled()) return false;
    await redis.setJson(`sess:${token}`, session, visitorSessionTtlMs);
    return true;
  }

  async function deleteVisitorSession(token) {
    if (!token || !isRedisRuntimeEnabled()) return false;
    await redis.del(`sess:${token}`);
    return true;
  }

  async function touchVisitorSession(token) {
    if (!token || !isRedisRuntimeEnabled()) return false;
    await redis.touch(`sess:${token}`, visitorSessionTtlMs);
    return true;
  }

  async function publishEvent(event) {
    if (isRedisQueueEnabled()) return redis.publishEvent(event);
    if (isPostgresDirectEventWriteEnabled()) return pg.saveEvent(event);
    return null;
  }

  async function saveEventToPostgres(event) {
    if (!pg) return false;
    await pg.saveEvent(event);
    return true;
  }

  async function sharedRateLimit(bucket, limit, windowMs = 60_000) {
    if (!isRedisRuntimeEnabled()) return { ok: true, localOnly: true };
    return redis.rateLimit(bucket, Number(limit || 1), Number(windowMs || 60_000));
  }

  async function health() {
    const out = { connected, redisRuntime: isRedisRuntimeEnabled(), redisQueue: isRedisQueueEnabled(), postgres: isPostgresEnabled() };
    if (redis) { try { out.redis = await redis.health(); } catch (err) { out.redis = { ok: false, error: err.message }; } }
    if (pg) { try { await pg.query('select 1'); out.postgresOk = true; } catch (err) { out.postgresOk = false; out.postgresError = err.message; } }
    return out;
  }

  const api = {
    connect, close, health,
    isRedisRuntimeEnabled, isRedisQueueEnabled, isPostgresEnabled, isPostgresDirectEventWriteEnabled,
    getVisitorSession, setVisitorSession, deleteVisitorSession, touchVisitorSession,
    publishEvent, saveEventToPostgres, sharedRateLimit,
    redis, pg
  };
  return api;
}

module.exports = { createScalableRuntime };
