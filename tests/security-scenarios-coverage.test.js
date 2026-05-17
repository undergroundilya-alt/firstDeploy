'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');

const PROJECT_ROOT = path.resolve(__dirname, '..');

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}
function mask(value, left = 12) {
  if (!value || typeof value !== 'string') return String(value);
  return value.length <= left ? value : `${value.slice(0, left)}…`;
}
async function fetchWithTimeout(url, options = {}, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Timeout fetching ${url}`)), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal, redirect: 'manual' }); }
  finally { clearTimeout(timer); }
}
async function startServer() {
  const port = await getFreePort();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avp-security-coverage-'));
  const storageRoot = path.join(tmp, 'storage');
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    USE_HTTPS: 'false',
    HOST: '127.0.0.1',
    PORT: String(port),
    PUBLIC_BASE_URL: `http://127.0.0.1:${port}`,
    STORAGE_ROOT: storageRoot,
    DATA_FILE: path.join(storageRoot, 'saas-state.json'),
    RUNTIME_FILE: path.join(storageRoot, 'runtime-sessions.json'),
    AUTH_DB_FILE: path.join(storageRoot, 'auth-accounts.json'),
    LEADS_FILE: path.join(storageRoot, 'leads.json'),
    BACKUP_DIR: path.join(storageRoot, 'backups'),
    EVENT_LOG_DIR: path.join(storageRoot, 'events'),
    AUDIT_LOG_DIR: path.join(storageRoot, 'audit'),
    ALERT_LOG_DIR: path.join(storageRoot, 'alerts'),
    BACKUP_INTERVAL_MS: '2147483647',
    RESTORE_DRILL_INTERVAL_MS: '2147483647',
    API_LIMIT_MAX: '1000',
    DOCS_PRIVATE: 'false',
    CLUSTER_MODE: 'false',
    ENABLE_REDIS_RUNTIME: 'false',
    ENABLE_REDIS_EVENT_QUEUE: 'false',
    ENABLE_POSTGRES_STORAGE: 'false',
    ENABLE_APP_DB: 'false'
  };
  const child = childProcess.spawn(process.execPath, ['server.js'], { cwd: PROJECT_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', c => { stdout += c.toString(); });
  child.stderr.on('data', c => { stderr += c.toString(); });
  const baseUrl = `http://127.0.0.1:${port}`;
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    if (child.exitCode !== null) throw new Error(`Server exited early\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
    try {
      const res = await fetchWithTimeout(`${baseUrl}/health`, {}, 1000);
      if (res.status === 200) return { child, baseUrl, tmp, getLogs: () => ({ stdout, stderr }) };
    } catch {}
    await sleep(150);
  }
  child.kill('SIGTERM');
  throw new Error(`Server did not start\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
}
async function stopServer(server) {
  if (!server?.child || server.child.killed) return;
  server.child.kill('SIGTERM');
  const deadline = Date.now() + 3000;
  while (server.child.exitCode === null && Date.now() < deadline) await sleep(50);
  if (server.child.exitCode === null) server.child.kill('SIGKILL');
}
async function postJson(base, pathname, body, headers = {}) {
  return await fetchWithTimeout(`${base}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
}
function section(n, title) { console.log(`\n▶ ${n}. ${title}`); }
function pass(msg, details = '') { console.log(`   ✓ ${msg}${details ? ` — ${details}` : ''}`); }

async function main() {
  console.log('\n==================================================================================');
  console.log('AdProof security/test-site coverage: domain guard, proof, heartbeat, analytics');
  console.log('==================================================================================');
  const server = await startServer();
  const base = server.baseUrl;
  try {
    section(1, 'Two-site launcher exposes the allowed and foreign test sites');
    let res = await fetchWithTimeout(`${base}/test-site`);
    assert.equal(res.status, 200);
    let html = await res.text();
    const projectKey = html.match(/avp_pub_[A-Za-z0-9_-]+/)?.[0];
    assert.ok(projectKey, 'Expected public project key on /test-site');
    for (const marker of ['Two-site SDK test bundle', 'Open allowed customer site', 'Open foreign script-tag site', 'Simulated adblock', 'Connection issue', 'Hidden slot', 'Remove slot', 'Server-gate']) {
      assert.ok(html.includes(marker), `Expected launcher marker: ${marker}`);
    }
    assert.ok(!html.includes('/customer-test-site'), 'Launcher should not expose duplicate /customer-test-site route');
    assert.ok(!html.includes('/test-site/foreign'), 'Launcher should not expose duplicate /test-site/foreign route');
    pass('Launcher contains only the two supported test sites and scenario links', mask(projectKey));

    section(2, 'SDK contains the runtime guards we rely on');
    res = await fetchWithTimeout(`${base}/sdk/v1/${encodeURIComponent(projectKey)}/dyn-test.js`);
    assert.equal(res.status, 200);
    const sdk = await res.text();
    const sdkMarkers = [
      ['heartbeat endpoint', '/api/v1/heartbeat'],
      ['MutationObserver anti-tamper', 'MutationObserver'],
      ['IntersectionObserver visibility check', 'IntersectionObserver'],
      ['geometry visibility check', 'getBoundingClientRect'],
      ['hard-lock overlay marker', 'avp-hard-lock'],
      ['scheduled rerender', 'scheduledRerender'],
      ['tab visibility handling', 'visibilitychange'],
      ['WebCrypto proof/signing path', 'crypto.subtle'],
      ['ad fragment / bait delivery path', '/api/v1/ad-fragment'],
      ['batched events path', '/api/v1/events/batch']
    ];
    for (const [label, marker] of sdkMarkers) assert.ok(sdk.includes(marker), `SDK must contain ${label}`);
    pass('SDK runtime has heartbeat, mutation, visibility, proof and batch-event markers');

    section(3, 'Foreign script guard blocks a project key on an unapproved domain');
    res = await fetchWithTimeout(`${base}/sdk/v1/${encodeURIComponent(projectKey)}.js`, {
      headers: { Referer: 'http://evil.example/article.html' }
    });
    assert.equal(res.status, 200);
    const blockedSdk = await res.text();
    assert.ok(blockedSdk.includes('AVP SDK hard-blocked by allowed-domain guard') || blockedSdk.includes('AVP SDK blocked by allowed-domain guard'));
    assert.ok(blockedSdk.includes('avp-domain-block-lock') || blockedSdk.includes('data-avp-lock'));
    assert.ok(blockedSdk.includes('sdk_domain_not_allowed'));
    pass('Unapproved Referer receives blocked SDK stub, not the real SDK');

    section(4, 'API Origin guard rejects direct calls from foreign sites');
    res = await postJson(base, '/api/v1/session', { projectKey, pageUrl: 'http://evil.example/article', mode: 'soft-gate' }, { Origin: 'http://evil.example' });
    assert.equal(res.status, 403);
    let json = await res.json();
    assert.equal(json.reason, 'origin_not_allowed');
    pass('Foreign Origin cannot create visitor session', json.reason);

    section(5, 'Normal visitor session starts locked and cannot unlock through backend without proof');
    res = await postJson(base, '/api/v1/session', { projectKey, pageUrl: `${base}/test-site/article`, mode: 'soft-gate' }, { Origin: base });
    assert.equal(res.status, 200);
    json = await res.json();
    assert.equal(json.success, true);
    const visitorToken = json.visitorToken;
    pass('Allowed Origin creates visitor session', mask(visitorToken));

    res = await fetchWithTimeout(`${base}/api/v1/lease-status?projectKey=${encodeURIComponent(projectKey)}&visitorToken=${encodeURIComponent(visitorToken)}`, { headers: { Origin: base } });
    assert.equal(res.status, 200);
    json = await res.json();
    assert.equal(json.allowed, false);
    pass('Lease is not active before valid proof/heartbeat', json.reason);

    res = await postJson(base, '/test-site/backend-unlock', { projectKey, visitorToken });
    assert.equal(res.status, 200);
    json = await res.json();
    assert.equal(json.allowed, false);
    pass('Customer-backend simulation refuses unlock before valid proof', json.reason);

    section(6, 'Proof and token forgery are rejected');
    res = await postJson(base, '/api/v1/challenge', { projectKey, visitorToken: 'fake-token', kind: 'content' }, { Origin: base });
    assert.equal(res.status, 403);
    json = await res.json();
    assert.equal(json.reason, 'bad_visitor_token');
    pass('Bad visitor token cannot get a challenge', json.reason);

    res = await postJson(base, '/api/v1/challenge', { projectKey, visitorToken, kind: 'content' }, { Origin: base });
    assert.equal(res.status, 200);
    json = await res.json();
    const challenge = json.challenge;
    assert.ok(challenge.nonce && challenge.slotId && challenge.poolToken);
    pass('Legitimate visitor gets one-time challenge', `seq=${challenge.seq}`);

    res = await postJson(base, '/api/v1/proof', {
      projectKey,
      visitorToken,
      payload: { kind: 'content', seq: challenge.seq, nonce: challenge.nonce, slotId: challenge.slotId, poolToken: challenge.poolToken, proof: 'fake', visibleRatioScaled: 1000, baitDomVisible: true, pageUrl: `${base}/test-site/article`, mode: 'soft-gate' },
      signature: 'fake-signature'
    }, { Origin: base });
    assert.equal(res.status, 403);
    json = await res.json();
    assert.equal(json.reason, 'signature_invalid');
    pass('Forged/edited proof payload is rejected', json.reason);

    section(7, 'Heartbeat failure and signed event guard create analytics reasons');
    res = await postJson(base, '/api/v1/heartbeat', { projectKey, visitorToken, status: 'failed', adStatus: 'hidden', reason: 'autotest_ad_hidden', pageUrl: `${base}/test-site/article` }, { Origin: base });
    assert.equal(res.status, 200);
    json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.leaseValid, false);
    pass('Heartbeat failure keeps lease invalid and records heartbeat_lost-style reason', json.status);

    res = await postJson(base, '/api/v1/events', { projectKey, visitorToken, type: 'overlay_shown', reason: 'manual_unsigned_forgery', details: { test: true } }, { Origin: base });
    assert.equal(res.status, 403);
    json = await res.json();
    assert.equal(json.reason, 'unsigned_event');
    pass('Unsigned console-style telemetry is rejected in strict mode', json.reason);

    res = await postJson(base, '/api/v1/events/batch', { projectKey, visitorToken, events: [{ type: 'overlay_shown', reason: 'batch_unsigned_forgery', details: { console: true } }] }, { Origin: base });
    assert.equal(res.status, 200);
    json = await res.json();
    assert.equal(json.accepted, 0);
    assert.equal(json.rejected, 1);
    pass('Unsigned batch telemetry from console is rejected event-by-event', `accepted=${json.accepted}, rejected=${json.rejected}`);

    res = await fetchWithTimeout(`${base}/api/v1/lease-status?projectKey=${encodeURIComponent(projectKey)}&visitorToken=${encodeURIComponent(visitorToken)}`, { headers: { Origin: base } });
    assert.equal(res.status, 200);
    json = await res.json();
    assert.equal(json.allowed, false);
    pass('Telemetry event cannot activate protected-content lease', json.reason);

    section(8, 'Debug/analytics surfaces are reachable for manual verification');
    for (const path of ['/debug/email-outbox', '/readyz', '/metrics']) {
      res = await fetchWithTimeout(`${base}${path}`);
      assert.ok([200, 204, 401, 403].includes(res.status), `${path} should be reachable/protected, got ${res.status}`);
      pass(`${path} returns a controlled status`, String(res.status));
    }

    section(9, 'Mock analytics seeding is blocked in production mode');
    const seedGuard = childProcess.spawnSync(process.execPath, ['scripts/seed-postgres-analytics.js'], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, APP_ENV: 'production', NODE_ENV: 'production', DATABASE_URL: 'postgresql://example.invalid/db', POSTGRES_SSL: 'false', ALLOW_PRODUCTION_MOCK_SEED: 'false' },
      encoding: 'utf8'
    });
    assert.notEqual(seedGuard.status, 0);
    assert.match(`${seedGuard.stdout}\n${seedGuard.stderr}`, /Refusing to seed mock analytics into production/);
    pass('Production env refuses mock analytics seed unless explicitly overridden');

    console.log('\n✅ Security/test-site coverage passed');
  } finally {
    await stopServer(server);
    fs.rmSync(server.tmp, { recursive: true, force: true });
  }
}

main().catch(err => {
  console.error('\n❌ Security/test-site coverage failed');
  console.error(err);
  process.exit(1);
});
