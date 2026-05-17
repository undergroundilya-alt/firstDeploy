'use strict';

function lazyRedis() {
  try { return require('redis'); }
  catch (err) {
    const e = new Error('redis_package_missing_run_npm_install');
    e.cause = err;
    throw e;
  }
}

function stringify(value) { return JSON.stringify(value || {}); }
function parse(value, fallback = null) { try { return JSON.parse(value); } catch { return fallback; } }

class RedisQueueAdapter {
  constructor({ url, stream = 'avp:events', prefix = 'avp', consumerGroup = 'avp-ingestion' } = {}) {
    this.url = url || process.env.REDIS_URL || '';
    this.stream = stream || process.env.REDIS_EVENT_STREAM || 'avp:events';
    this.prefix = prefix || process.env.REDIS_KEY_PREFIX || 'avp';
    this.consumerGroup = consumerGroup;
    this.client = null;
  }

  async connect() {
    if (!this.url) throw new Error('REDIS_URL_required');
    const redis = lazyRedis();
    this.client = redis.createClient({ url: this.url });
    this.client.on('error', err => console.error('[redis]', err.message));
    await this.client.connect();
    return this;
  }

  async close() {
    if (this.client) await this.client.quit();
    this.client = null;
  }

  async ensure() {
    if (!this.client) await this.connect();
    return this.client;
  }

  key(name) { return `${this.prefix}:${name}`; }

  async publishEvent(event) {
    const client = await this.ensure();
    const id = await client.xAdd(this.stream, '*', { event: stringify({ schema: 'avp.event.v1', ...event }) }, { TRIM: { strategy: 'MAXLEN', strategyModifier: '~', threshold: Number(process.env.REDIS_STREAM_MAXLEN || 250000) } });
    return id;
  }

  async createConsumerGroup() {
    const client = await this.ensure();
    try { await client.xGroupCreate(this.stream, this.consumerGroup, '0', { MKSTREAM: true }); }
    catch (err) { if (!/BUSYGROUP/i.test(err.message)) throw err; }
  }

  async readGroup({ consumer = 'worker-1', count = 100, blockMs = 5000 } = {}) {
    const client = await this.ensure();
    await this.createConsumerGroup();
    const rows = await client.xReadGroup(this.consumerGroup, consumer, [{ key: this.stream, id: '>' }], { COUNT: count, BLOCK: blockMs });
    if (!rows || !rows.length) return [];
    const messages = [];
    for (const stream of rows) for (const msg of stream.messages || []) messages.push({ id: msg.id, event: parse(msg.message.event, null) });
    return messages.filter(m => m.event);
  }

  async ack(ids = []) {
    if (!ids.length) return 0;
    const client = await this.ensure();
    return client.xAck(this.stream, this.consumerGroup, ids);
  }

  async setJson(key, value, ttlMs) {
    const client = await this.ensure();
    const full = this.key(key);
    if (ttlMs) return client.set(full, stringify(value), { PX: ttlMs });
    return client.set(full, stringify(value));
  }

  async getJson(key) {
    const client = await this.ensure();
    return parse(await client.get(this.key(key)), null);
  }

  async del(key) {
    const client = await this.ensure();
    return client.del(this.key(key));
  }

  async touch(key, ttlMs) {
    const client = await this.ensure();
    return client.pExpire(this.key(key), ttlMs);
  }

  async rateLimit(bucket, limit, windowMs) {
    const client = await this.ensure();
    const key = this.key(`rl:${bucket}`);
    const count = await client.incr(key);
    if (count === 1) await client.pExpire(key, windowMs);
    const ttl = await client.pTTL(key);
    return { ok: count <= limit, count, limit, retryAfterMs: ttl > 0 ? ttl : windowMs };
  }

  async health() {
    const client = await this.ensure();
    const pong = await client.ping();
    return { ok: pong === 'PONG', stream: this.stream, prefix: this.prefix };
  }
}

module.exports = { RedisQueueAdapter };
