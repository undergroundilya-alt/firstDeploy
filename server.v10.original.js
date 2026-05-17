const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

require('./ensure-certs')();

const APP_HOST = '127.0.0.1';
const APP_PORT = 3001;
const FRONT_ORIGIN_FALLBACK = 'https://localhost:3443';

const SESSION_TTL = 60 * 60 * 1000;
const PAGE_RUN_TTL = 10 * 60 * 1000;
const CONTENT_CHALLENGE_TTL = 75 * 1000;
const BAIT_HITS_REQUIRED = 2;
const RANDOM_POOL_SIZE = 128;

// sid -> { createdAt, lastSeen, run }
const sessions = new Map();

const ARTICLE_HTML = `
  <p><strong>Контент виданий сервером.</strong></p>
  <p>Початковий HTML був порожньою оболонкою. Цей контент відданий тільки після TLS-gate, session challenge, bait-реклами, перевірки видимості та підпису WebCrypto-ключем поточного запуску сторінки.</p>
  <p>Після відкриття контенту рекламний блок плавно перерендерюється із сервера кожні 30 секунд у те саме місце поверх попереднього блоку.</p>
`;

function now() { return Date.now(); }
function randomHex(bytes = 16) { return crypto.randomBytes(bytes).toString('hex'); }
function sha256(input) { return crypto.createHash('sha256').update(String(input)).digest('hex'); }

function parseCookies(header = '') {
  const out = {};
  header.split(';').forEach(part => {
    const trimmed = part.trim();
    if (!trimmed) return;
    const i = trimmed.indexOf('=');
    if (i === -1) out[trimmed] = '';
    else out[trimmed.slice(0, i)] = decodeURIComponent(trimmed.slice(i + 1));
  });
  return out;
}

function newRandomPool() {
  return Array.from({ length: RANDOM_POOL_SIZE }, () => randomHex(24));
}

function newSession() {
  const sid = randomHex(24);
  sessions.set(sid, {
    createdAt: now(),
    lastSeen: now(),
    run: null
  });
  return sid;
}

function setSessionCookie(res, sid) {
  res.setHeader('Set-Cookie', `sid=${encodeURIComponent(sid)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=3600`);
}

function getSession(req, res, createIfMissing = false) {
  const cookies = parseCookies(req.headers.cookie || '');
  let sid = cookies.sid;

  if (!sid || !sessions.has(sid)) {
    if (!createIfMissing) return null;
    sid = newSession();
    setSessionCookie(res, sid);
  }

  const session = sessions.get(sid);
  session.lastSeen = now();
  return { sid, session };
}

function resetPageRun(session) {
  session.run = {
    createdAt: now(),
    initialized: false,
    contentUnlocked: false,
    runId: null,
    publicKey: null,
    publicKeyHash: null,
    nextSeq: 1,
    challenges: new Map(),
    randomPool: newRandomPool(),
    failed: false
  };
}

function getUa(req) { return req.headers['user-agent'] || ''; }

function browserHeaderCheck(req) {
  // Настоящий TLS fingerprint проверяется до backend в tls-fingerprint-proxy.js.
  // Здесь только базовая проверка HTTP-заголовков браузера.
  const ua = getUa(req);
  if (!ua.includes('Mozilla')) return false;
  if (!/(Chrome|Firefox|Safari|Edg|OPR)\//.test(ua)) return false;

  const secFetchSite = req.headers['sec-fetch-site'];
  if (secFetchSite && !['same-origin', 'same-site', 'none'].includes(secFetchSite)) return false;

  if (req.method === 'GET' && req.url) {
    const url = new URL(req.url, req.headers.host ? `https://${req.headers.host}` : FRONT_ORIGIN_FALLBACK);
    const accept = req.headers.accept || '';
    const secFetchMode = req.headers['sec-fetch-mode'];

    if (url.pathname === '/' || url.pathname === '/index.html') {
      if (secFetchMode && secFetchMode !== 'navigate') return false;
      if (accept && !accept.includes('text/html')) return false;
    }
  }

  return true;
}

function sameOriginApiCheck(req) {
  const expectedOrigin = req.headers.host ? `https://${req.headers.host}` : FRONT_ORIGIN_FALLBACK;
  const origin = req.headers.origin;
  const secFetchSite = req.headers['sec-fetch-site'];

  if (origin && origin !== expectedOrigin) return false;
  if (secFetchSite && !['same-origin', 'same-site', 'none'].includes(secFetchSite)) return false;
  if (req.headers['x-gate-request'] !== '1') return false;
  return true;
}

function expectedCanvasProof(nonce) {
  const r = parseInt(nonce.slice(0, 2), 16);
  const g = parseInt(nonce.slice(2, 4), 16);
  const b = parseInt(nonce.slice(4, 6), 16);
  const arr = [];
  for (let i = 0; i < 100; i++) arr.push(r, g, b, 255);
  return sha256(arr.join(',') + nonce);
}

function canonicalPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('payload_must_be_object');
  }

  const out = {};
  for (const key of Object.keys(payload).sort()) {
    const value = payload[key];
    const type = typeof value;
    if (!['string', 'number', 'boolean'].includes(type) || value === null || Number.isNaN(value)) {
      throw new Error('payload_value_not_primitive');
    }
    out[key] = value;
  }
  return JSON.stringify(out);
}

function importPublicKeyFromJwk(jwk) {
  if (!jwk || typeof jwk !== 'object') throw new Error('bad_public_key');
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y) throw new Error('bad_public_key');
  return crypto.createPublicKey({ key: jwk, format: 'jwk' });
}

function verifySignedPayload(run, payload, signatureBase64) {
  if (!run || !run.publicKey) return false;
  if (!signatureBase64 || typeof signatureBase64 !== 'string') return false;

  const canonical = canonicalPayload(payload);
  const signature = Buffer.from(signatureBase64, 'base64');
  if (signature.length < 64 || signature.length > 80) return false;

  return crypto.verify(
    'sha256',
    Buffer.from(canonical),
    { key: run.publicKey, dsaEncoding: 'ieee-p1363' },
    signature
  );
}

function takePoolToken(run) {
  if (!run.randomPool || run.randomPool.length === 0) run.randomPool = newRandomPool();
  return run.randomPool.shift();
}

function issueChallenge(session, kind) {
  const run = session.run;
  if (!run || !run.initialized || run.failed) return null;

  const nonce = randomHex(32);
  const slotId = `slot_${randomHex(10)}`;
  const baitToken = randomHex(16);
  const poolToken = takePoolToken(run);
  const seq = run.nextSeq++;
  const ttl = CONTENT_CHALLENGE_TTL;

  run.challenges.set(nonce, {
    ts: now(),
    ttl,
    kind,
    seq,
    slotId,
    baitToken,
    poolTokenHash: sha256(poolToken),
    expectedProof: expectedCanvasProof(nonce),
    baitHits: new Set(),
    used: false
  });

  return { nonce, slotId, baitToken, poolToken, seq, kind, expiresInMs: ttl };
}

function markBaitHitOnRun(run, reqPathname, nonce, slotId, baitToken) {
  if (!run || !run.initialized || run.failed) return false;

  const meta = run.challenges.get(nonce);
  if (!meta || meta.used) return false;
  if (meta.kind !== 'content') return false;
  if (now() - meta.ts > meta.ttl) return false;
  if (meta.slotId !== slotId) return false;
  if (meta.baitToken !== baitToken) return false;

  meta.baitHits.add(reqPathname);
  return true;
}

function recordBaitHit(session, reqPathname, query) {
  const nonce = query.get('nonce') || '';
  const slotId = query.get('slotId') || '';
  const baitToken = query.get('baitToken') || '';

  if (!nonce || !slotId || !baitToken) return false;

  if (session && markBaitHitOnRun(session.run, reqPathname, nonce, slotId, baitToken)) return true;

  // Fallback только для bait-hit: сам по себе он не открывает контент.
  // /api/ad-ok всё равно требует session cookie + подпись WebCrypto + одноразовый challenge.
  for (const [, candidateSession] of sessions) {
    if (candidateSession === session) continue;
    if (markBaitHitOnRun(candidateSession.run, reqPathname, nonce, slotId, baitToken)) return true;
  }

  return false;
}

function takeAndVerifyChallenge(session, body, expectedKind) {
  const run = session.run;
  if (!run || !run.initialized || run.failed) return { ok: false, reason: 'run_not_initialized' };

  const { payload, signature } = body || {};
  if (!payload || typeof payload !== 'object') return { ok: false, reason: 'missing_payload' };

  let signatureOk = false;
  try { signatureOk = verifySignedPayload(run, payload, signature); }
  catch { signatureOk = false; }
  if (!signatureOk) return { ok: false, reason: 'signature_invalid' };

  const meta = run.challenges.get(payload.nonce);
  if (!meta || meta.used) return { ok: false, reason: 'challenge_missing_or_reused' };

  // Любая подписанная попытка с этим challenge сжигает его.
  meta.used = true;
  run.challenges.delete(payload.nonce);

  if (now() - meta.ts > meta.ttl) return { ok: false, reason: 'challenge_expired' };
  if (payload.runId !== run.runId) return { ok: false, reason: 'run_id_mismatch' };
  if (payload.kind !== expectedKind || meta.kind !== expectedKind) return { ok: false, reason: 'kind_mismatch' };
  if (payload.seq !== meta.seq) return { ok: false, reason: 'seq_mismatch' };
  if (payload.slotId !== meta.slotId) return { ok: false, reason: 'slot_mismatch' };
  if (typeof payload.poolToken !== 'string' || sha256(payload.poolToken) !== meta.poolTokenHash) {
    return { ok: false, reason: 'pool_token_mismatch' };
  }

  return { ok: true, run, meta, payload };
}

function verifyContentAdOk(session, body) {
  const base = takeAndVerifyChallenge(session, body, 'content');
  if (!base.ok) return base;

  const { run, meta, payload } = base;

  if (payload.proof !== meta.expectedProof) return { ok: false, reason: 'canvas_proof_invalid' };
  if (payload.baitNetworkOk !== true) return { ok: false, reason: 'bait_network_blocked' };
  if (payload.baitDomVisible !== true) return { ok: false, reason: 'bait_dom_hidden' };
  if (typeof payload.visibleRatioScaled !== 'number' || payload.visibleRatioScaled < 500) {
    return { ok: false, reason: 'ad_not_visible' };
  }
  if (meta.baitHits.size < BAIT_HITS_REQUIRED) {
    return { ok: false, reason: 'server_did_not_see_bait_hits' };
  }

  run.contentUnlocked = true;
  return { ok: true };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[ch]));
}

function makeAdHtml(slotId, reason = 'server') {
  const creativeId = `creative_${randomHex(8)}`;
  const placement = `placement_${randomHex(6)}`;
  const stamp = new Date().toLocaleTimeString('uk-UA', { hour12: false });
  const safeSlot = escapeHtml(slotId);
  return `
    <ins
      id="${creativeId}"
      class="adsbygoogle adsbox ad ad-banner banner-ad advertisement sponsor text-ad pub_300x250 ${placement}"
      data-gate-ad="1"
      data-server-rendered="1"
      data-slot-id="${safeSlot}"
      data-ad-client="ca-pub-0000000000000000"
      data-ad-slot="${safeSlot}"
      data-ad-format="rectangle"
      aria-label="Advertisement"
      style="display:flex;width:300px;height:250px;min-width:300px;min-height:250px;background:linear-gradient(135deg,#4a90d9,#6ab4f5);border-radius:8px;align-items:center;justify-content:center;flex-direction:column;gap:8px;box-shadow:0 4px 20px rgba(74,144,217,.3);text-decoration:none;overflow:hidden;position:relative;"
    >
      <span style="font-size:.7rem;color:rgba(255,255,255,.72);letter-spacing:2px;text-transform:uppercase">Advertisement</span>
      <span style="font-size:1rem;color:#fff;font-weight:bold">Server ad slot</span>
      <span style="font-size:.75rem;color:rgba(255,255,255,.7)">300 × 250 · ${stamp}</span>
    </ins>
  `;
}

function cleanup() {
  const t = now();
  for (const [sid, session] of sessions) {
    if (t - session.lastSeen > SESSION_TTL) {
      sessions.delete(sid);
      continue;
    }
    const run = session.run;
    if (!run) continue;
    if (t - run.createdAt > PAGE_RUN_TTL) {
      session.run = null;
      continue;
    }
    for (const [nonce, meta] of run.challenges) {
      if (t - meta.ts > meta.ttl) run.challenges.delete(nonce);
    }
  }
}
setInterval(cleanup, 10_000);

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(data));
}

function sendFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(data);
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 50_000) {
        reject(new Error('body_too_large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch (err) { reject(err); }
    });
  });
}

const tlsOptions = {
  key: fs.readFileSync(path.join(__dirname, 'certs', 'localhost-key.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'certs', 'localhost-cert.pem')),
  minVersion: 'TLSv1.2',
  ALPNProtocols: ['http/1.1']
};

const server = https.createServer(tlsOptions, async (req, res) => {
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'interest-cohort=()');

  const url = new URL(req.url, req.headers.host ? `https://${req.headers.host}` : FRONT_ORIGIN_FALLBACK);
  const pathname = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('CORS disabled');
    return;
  }

  if ((pathname === '/' || pathname === '/index.html') && req.method === 'GET') {
    if (!browserHeaderCheck(req)) return sendJson(res, 403, { success: false, reason: 'not_browser_like' });
    const sess = getSession(req, res, true);
    resetPageRun(sess.session);
    return sendFile(res, path.join(__dirname, 'index.html'), 'text/html; charset=utf-8');
  }

  if (pathname === '/gate.js' && req.method === 'GET') {
    return sendFile(res, path.join(__dirname, 'gate.js'), 'application/javascript; charset=utf-8');
  }

  const baitPaths = new Set(['/ads/banner.js', '/advertisement/creative.js', '/pagead/js/adsbygoogle.js']);

  if (req.method === 'GET' && baitPaths.has(pathname)) {
    if (!browserHeaderCheck(req)) {
      res.writeHead(403, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end('');
      return;
    }

    const sess = getSession(req, res, false);
    const ok = recordBaitHit(sess && sess.session, pathname, url.searchParams);

    res.writeHead(ok ? 200 : 403, {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(ok ? 'window.__gateBaitNetworkLoaded = (window.__gateBaitNetworkLoaded || 0) + 1;' : '');
    return;
  }

  if (!pathname.startsWith('/api/')) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  if (!browserHeaderCheck(req)) return sendJson(res, 403, { success: false, reason: 'not_browser_like' });
  if (!sameOriginApiCheck(req)) return sendJson(res, 403, { success: false, reason: 'bad_origin_or_header' });

  const sess = getSession(req, res, false);
  if (!sess) return sendJson(res, 403, { success: false, reason: 'no_session' });

  if (pathname === '/api/init' && req.method === 'POST') {
    try {
      const body = await readJson(req);
      const run = sess.session.run;
      if (!run) return sendJson(res, 403, { success: false, reason: 'no_page_run' });
      if (run.initialized) return sendJson(res, 409, { success: false, reason: 'run_already_initialized' });
      if (!body.runId || typeof body.runId !== 'string' || body.runId.length > 80) {
        return sendJson(res, 400, { success: false, reason: 'bad_run_id' });
      }

      const publicKey = importPublicKeyFromJwk(body.publicKeyJwk);
      run.publicKey = publicKey;
      run.publicKeyHash = sha256(JSON.stringify(body.publicKeyJwk));
      run.runId = body.runId;
      run.initialized = true;

      const challenge = issueChallenge(sess.session, 'content');
      return sendJson(res, 200, { success: true, challenge });
    } catch (err) {
      return sendJson(res, 400, { success: false, reason: 'bad_init' });
    }
  }

  if (pathname === '/api/ad-ok' && req.method === 'POST') {
    try {
      const body = await readJson(req);
      const result = verifyContentAdOk(sess.session, body);
      if (!result.ok) return sendJson(res, 403, { success: false, reason: result.reason });

      return sendJson(res, 200, {
        success: true,
        html: ARTICLE_HTML,
        adHtml: makeAdHtml(`slot_${randomHex(10)}`, 'initial')
      });
    } catch (err) {
      return sendJson(res, 400, { success: false, reason: 'bad_json_or_signature' });
    }
  }

  if (pathname === '/api/ad-fragment' && req.method === 'POST') {
    try {
      const body = await readJson(req);
      if (!sess.session.run || !sess.session.run.contentUnlocked) {
        return sendJson(res, 403, { success: false, reason: 'content_not_unlocked' });
      }

      const reason = body && typeof body.reason === 'string' ? body.reason.slice(0, 60) : 'server_restore';
      return sendJson(res, 200, {
        success: true,
        adHtml: makeAdHtml(`slot_${randomHex(10)}`, reason)
      });
    } catch (err) {
      return sendJson(res, 400, { success: false, reason: 'bad_request' });
    }
  }

  return sendJson(res, 404, { success: false, reason: 'unknown_api' });
});

server.listen(APP_PORT, APP_HOST, () => {
  console.log(`[app] HTTPS backend: https://${APP_HOST}:${APP_PORT}`);
  console.log('[app] Do not open backend directly. Open through TLS proxy: https://localhost:3443/');
});
