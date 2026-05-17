'use strict';
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const base = (process.env.PUBLIC_BASE_URL || 'http://localhost:3443').replace(/\/$/, '');
const projectKey = process.env.PROJECT_KEY || '';
const requests = Number(process.env.LOAD_REQUESTS || 25);
const concurrency = Number(process.env.LOAD_CONCURRENCY || 5);
const origin = process.env.LOAD_ORIGIN || 'http://localhost:3000';
const pageUrl = process.env.LOAD_PAGE_URL || `${origin}/article/demo`;
const agent = base.startsWith('https:') ? https : http;

function request(method, pathname, body) {
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
        'X-AVP-Request': '1'
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
function get(pathname) { return request('GET', pathname); }
function post(pathname, body) { return request('POST', pathname, body); }
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
async function oneFlow(i) {
  const kp = genKeyPair();
  const ping = await get(`/api/v1/ping?projectKey=${encodeURIComponent(projectKey)}`);
  if (ping.status !== 200) throw new Error(`ping_${ping.status}`);
  const sess = await post('/api/v1/session', { projectKey, pageUrl: `${pageUrl}?i=${i}`, mode: 'soft-gate', clientPublicKey: kp.publicJwk });
  if (sess.status !== 200 || !sess.json?.visitorToken) throw new Error(`session_${sess.status}_${sess.json?.reason || ''}`);
  const visitorToken = sess.json.visitorToken;
  const challengeRes = await post('/api/v1/challenge', { projectKey, visitorToken, kind: 'content' });
  if (challengeRes.status !== 200 || !challengeRes.json?.challenge) throw new Error(`challenge_${challengeRes.status}_${challengeRes.json?.reason || ''}`);
  const ch = challengeRes.json.challenge;
  const frag = await get(`/api/v1/ad-fragment?projectKey=${encodeURIComponent(projectKey)}&visitorToken=${encodeURIComponent(visitorToken)}&reason=load_test&nonce=${encodeURIComponent(ch.nonce)}&slotId=${encodeURIComponent(ch.slotId)}&baitToken=${encodeURIComponent(ch.baitToken)}`);
  if (frag.status !== 200) throw new Error(`ad_fragment_${frag.status}`);
  await get(`/api/v1/bait-hit?projectKey=${encodeURIComponent(projectKey)}&visitorToken=${encodeURIComponent(visitorToken)}&nonce=${encodeURIComponent(ch.nonce)}&slotId=${encodeURIComponent(ch.slotId)}&baitToken=${encodeURIComponent(ch.baitToken)}`);
  const payload = { kind: 'content', seq: ch.seq, nonce: ch.nonce, slotId: ch.slotId, poolToken: ch.poolToken, proof: expectedCanvasProof(ch.nonce), visibleRatioScaled: 1000, baitNetworkOk: true, baitDomVisible: true, pageUrl: `${pageUrl}?i=${i}`, mode: 'soft-gate' };
  const proof = await post('/api/v1/proof', { projectKey, visitorToken, payload, signature: signPayload(kp.privateKey, payload) });
  if (proof.status !== 200 || !proof.json?.success) throw new Error(`proof_${proof.status}_${proof.json?.reason || ''}`);
  const details = { pageUrl: `${pageUrl}?i=${i}` };
  const detailsHash = sha256(JSON.stringify(details));
  const eventEnvelope = { projectKey, visitorToken, type: 'content_unlocked', reason: 'load_test', seq: 1, detailsHash, pageUrl: `${pageUrl}?i=${i}`, ts: Date.now() };
  const event = await post('/api/v1/events/batch', { projectKey, visitorToken, events: [{ projectKey, visitorToken, type: 'content_unlocked', reason: 'load_test', details, eventEnvelope, eventSignature: signPayload(kp.privateKey, eventEnvelope) }] });
  if (event.status !== 200) throw new Error(`events_batch_${event.status}_${event.json?.reason || ''}`);
  return { visitorToken, proof: true };
}
(async () => {
  if (!projectKey) {
    console.error('PROJECT_KEY is required. Example: PUBLIC_BASE_URL=http://localhost:3443 PROJECT_KEY=avp_pub_xxx npm run load-test');
    process.exit(2);
  }
  let next = 0, ok = 0, fail = 0;
  const errors = {};
  async function worker() {
    while (next < requests) {
      const i = next++;
      try { await oneFlow(i); ok++; }
      catch (err) { fail++; errors[err.message] = (errors[err.message] || 0) + 1; }
    }
  }
  const started = Date.now();
  await Promise.all(Array.from({ length: concurrency }, worker));
  console.log(JSON.stringify({ base, projectKey: projectKey.slice(0, 14) + '...', origin, requests, concurrency, ok, fail, durationMs: Date.now() - started, errors }, null, 2));
  process.exit(fail ? 1 : 0);
})();
