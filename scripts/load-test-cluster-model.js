'use strict';

const http = require('http');
const https = require('https');
const crypto = require('crypto');

const base = (process.env.PUBLIC_BASE_URL || 'http://localhost:3443').replace(/\/$/, '');
const projectKeys = String(process.env.PROJECT_KEYS || process.env.PROJECT_KEY || '').split(',').map(s => s.trim()).filter(Boolean);
const clients = Number(process.env.LOAD_CLIENTS || 5);
const tabsPerClient = Number(process.env.LOAD_TABS_PER_CLIENT || 3);
const activeSeconds = Number(process.env.LOAD_ACTIVE_SECONDS || 60);
const concurrency = Number(process.env.LOAD_CONCURRENCY || 25);
const heartbeatEveryMs = Number(process.env.LOAD_HEARTBEAT_EVERY_MS || 20000);
const rerenderEveryMs = Number(process.env.LOAD_RERENDER_EVERY_MS || 60000);
const originBase = process.env.LOAD_ORIGIN_BASE || 'https://client-demo';
const agent = base.startsWith('https:') ? https : http;

function request(method, pathname, body, origin) {
  return new Promise(resolve => {
    const url = new URL(pathname, base);
    const payload = body ? JSON.stringify(body) : '';
    const req = agent.request(url, {
      method,
      rejectUnauthorized: false,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Origin': origin,
        'X-AVP-Request': '1',
        'User-Agent': 'AVP cluster model load test'
      }
    }, res => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', d => raw += d);
      res.on('end', () => {
        let json = null;
        try { json = raw ? JSON.parse(raw) : null; } catch {}
        resolve({ status: res.statusCode, json, raw });
      });
    });
    req.on('error', err => resolve({ status: 0, error: err.message }));
    if (payload) req.write(payload);
    req.end();
  });
}
function get(pathname, origin) { return request('GET', pathname, null, origin); }
function post(pathname, body, origin) { return request('POST', pathname, body, origin); }
function sha256(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function expectedCanvasProof(nonce) {
  const r = parseInt(String(nonce).slice(0, 2), 16) || 0;
  const g = parseInt(String(nonce).slice(2, 4), 16) || 0;
  const b = parseInt(String(nonce).slice(4, 6), 16) || 0;
  const arr = [];
  for (let i = 0; i < 100; i++) arr.push(r, g, b, 255);
  return sha256(arr.join(',') + nonce);
}
function canonicalPayload(payload) {
  const out = {};
  for (const key of Object.keys(payload).sort()) out[key] = payload[key];
  return JSON.stringify(out);
}
function genKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return { publicJwk: publicKey.export({ format: 'jwk' }), privateKey };
}
function signPayload(privateKey, payload) {
  const sig = crypto.sign('sha256', Buffer.from(canonicalPayload(payload)), { key: privateKey, dsaEncoding: 'ieee-p1363' });
  return sig.toString('base64');
}
async function emitEvent(projectKey, visitorToken, privateKey, type, reason, details, origin, seq) {
  const detailsHash = sha256(JSON.stringify(details));
  const eventEnvelope = { projectKey, visitorToken, type, reason, seq, detailsHash, pageUrl: details.pageUrl, ts: Date.now() };
  return post('/api/v1/events/batch', { projectKey, visitorToken, events: [{ projectKey, visitorToken, type, reason, details, eventEnvelope, eventSignature: signPayload(privateKey, eventEnvelope) }] }, origin);
}
async function tabFlow(i) {
  const projectKey = projectKeys[i % projectKeys.length];
  const clientNo = i % clients;
  const origin = `${originBase}-${clientNo + 1}.example`;
  const pageUrl = `${origin}/article/${i}`;
  const kp = genKeyPair();
  const ping = await get(`/api/v1/ping?projectKey=${encodeURIComponent(projectKey)}`, origin);
  if (ping.status !== 200) throw new Error(`ping_${ping.status}`);
  const sess = await post('/api/v1/session', { projectKey, pageUrl, mode: 'soft-gate', clientPublicKey: kp.publicJwk }, origin);
  if (sess.status !== 200 || !sess.json?.visitorToken) throw new Error(`session_${sess.status}_${sess.json?.reason || ''}`);
  const visitorToken = sess.json.visitorToken;
  const challengeRes = await post('/api/v1/challenge', { projectKey, visitorToken, kind: 'content' }, origin);
  if (challengeRes.status !== 200 || !challengeRes.json?.challenge) throw new Error(`challenge_${challengeRes.status}_${challengeRes.json?.reason || ''}`);
  const ch = challengeRes.json.challenge;
  const frag = await get(`/api/v1/ad-fragment?projectKey=${encodeURIComponent(projectKey)}&visitorToken=${encodeURIComponent(visitorToken)}&reason=load_model&nonce=${encodeURIComponent(ch.nonce)}&slotId=${encodeURIComponent(ch.slotId)}&baitToken=${encodeURIComponent(ch.baitToken)}`, origin);
  if (frag.status !== 200) throw new Error(`ad_fragment_${frag.status}`);
  await get(`/api/v1/bait-hit?projectKey=${encodeURIComponent(projectKey)}&visitorToken=${encodeURIComponent(visitorToken)}&nonce=${encodeURIComponent(ch.nonce)}&slotId=${encodeURIComponent(ch.slotId)}&baitToken=${encodeURIComponent(ch.baitToken)}`, origin);
  const payload = { kind: 'content', seq: ch.seq, nonce: ch.nonce, slotId: ch.slotId, poolToken: ch.poolToken, proof: expectedCanvasProof(ch.nonce), visibleRatioScaled: 1000, baitNetworkOk: true, baitDomVisible: true, pageUrl, mode: 'soft-gate' };
  const proof = await post('/api/v1/proof', { projectKey, visitorToken, payload, signature: signPayload(kp.privateKey, payload) }, origin);
  if (proof.status !== 200 || !proof.json?.success) throw new Error(`proof_${proof.status}_${proof.json?.reason || ''}`);
  let seq = 1;
  await emitEvent(projectKey, visitorToken, kp.privateKey, 'content_unlocked', 'load_model', { pageUrl }, origin, seq++);
  const started = Date.now();
  let nextHeartbeat = started + heartbeatEveryMs;
  let nextRerender = started + rerenderEveryMs;
  while (Date.now() - started < activeSeconds * 1000) {
    const wait = Math.max(50, Math.min(nextHeartbeat, nextRerender) - Date.now());
    await new Promise(r => setTimeout(r, wait));
    if (Date.now() >= nextHeartbeat) {
      const r = await emitEvent(projectKey, visitorToken, kp.privateKey, 'heartbeat', 'ok', { pageUrl }, origin, seq++);
      if (r.status !== 200) throw new Error(`heartbeat_${r.status}_${r.json?.reason || ''}`);
      nextHeartbeat += heartbeatEveryMs;
    }
    if (Date.now() >= nextRerender) {
      const r = await emitEvent(projectKey, visitorToken, kp.privateKey, 'scheduled_rerender', 'timer', { pageUrl }, origin, seq++);
      if (r.status !== 200) throw new Error(`rerender_${r.status}_${r.json?.reason || ''}`);
      nextRerender += rerenderEveryMs;
    }
  }
}
(async () => {
  if (!projectKeys.length) {
    console.error('PROJECT_KEYS or PROJECT_KEY is required. Example: PROJECT_KEYS=avp_pub_1,avp_pub_2 LOAD_CLIENTS=10 LOAD_ACTIVE_SECONDS=300 npm run load-test:cluster-model');
    process.exit(2);
  }
  const totalTabs = clients * tabsPerClient;
  let next = 0, ok = 0, fail = 0;
  const errors = {};
  async function worker() {
    while (next < totalTabs) {
      const i = next++;
      try { await tabFlow(i); ok++; }
      catch (err) { fail++; errors[err.message] = (errors[err.message] || 0) + 1; }
    }
  }
  const started = Date.now();
  await Promise.all(Array.from({ length: Math.min(concurrency, totalTabs) }, worker));
  console.log(JSON.stringify({ base, clients, tabsPerClient, totalTabs, activeSeconds, concurrency, projectKeys: projectKeys.length, ok, fail, durationMs: Date.now() - started, errors }, null, 2));
  process.exit(fail ? 1 : 0);
})();
