'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');

const PROJECT_ROOT = path.resolve(__dirname, '..');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}
function canonicalPayload(payload) {
  const out = {};
  for (const key of Object.keys(payload).sort()) out[key] = payload[key];
  return JSON.stringify(out);
}
function createClientSigningKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return { publicJwk: publicKey.export({ format: 'jwk' }), privateKey };
}
function signClientPayload(privateKey, payload) {
  return crypto.sign('sha256', Buffer.from(canonicalPayload(payload)), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64');
}

class VerboseTestLog {
  constructor() {
    this.sectionCount = 0;
    this.checkCount = 0;
    this.startedAt = Date.now();
  }

  banner(title) {
    console.log(`\n${'='.repeat(82)}\n${title}\n${'='.repeat(82)}`);
  }

  section(title) {
    this.sectionCount += 1;
    console.log(`\n▶ ${this.sectionCount}. ${title}`);
  }

  pass(message, details) {
    this.checkCount += 1;
    const suffix = details ? ` — ${details}` : '';
    console.log(`   ✓ ${this.checkCount}. ${message}${suffix}`);
  }

  info(message, details) {
    const suffix = details ? ` — ${details}` : '';
    console.log(`   • ${message}${suffix}`);
  }

  summary() {
    const seconds = ((Date.now() - this.startedAt) / 1000).toFixed(1);
    console.log(`\n✅ E2E smoke/API/backend tests passed: ${this.checkCount} explicit checks in ${this.sectionCount} sections, ${seconds}s`);
  }
}

const log = new VerboseTestLog();

async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Timeout fetching ${url}`)), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function startServer() {
  const port = await getFreePort();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avp-e2e-'));
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
    ENABLE_POSTGRES_STORAGE: 'false'
  };

  log.info('Starting isolated test server', `port=${port}, storage=${storageRoot}`);

  const child = childProcess.spawn(process.execPath, ['server.js'], {
    cwd: PROJECT_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk.toString(); });
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });

  const baseUrl = `http://127.0.0.1:${port}`;
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited early with code ${child.exitCode}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
    }
    try {
      const res = await fetchWithTimeout(`${baseUrl}/health`, { redirect: 'manual' }, 1000);
      if (res.status === 200) {
        log.pass('Server started and answered /health', baseUrl);
        return { child, baseUrl, tmp, storageRoot, env, getLogs: () => ({ stdout, stderr }) };
      }
    } catch {}
    await sleep(150);
  }

  child.kill('SIGTERM');
  throw new Error(`Server did not become ready\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
}

async function stopServer(server) {
  if (!server || !server.child || server.child.killed) return;
  server.child.kill('SIGTERM');
  const deadline = Date.now() + 3000;
  while (server.child.exitCode === null && Date.now() < deadline) await sleep(50);
  if (server.child.exitCode === null) server.child.kill('SIGKILL');
}

function assertHtml(text, expected, label) {
  assert.equal(typeof text, 'string');
  assert.ok(text.includes(expected), `Expected HTML to include: ${expected}`);
  if (label) log.pass(label, `found text: ${expected}`);
}

function firstCookie(setCookieHeader) {
  assert.ok(setCookieHeader, 'Expected Set-Cookie header');
  return setCookieHeader.split(';')[0];
}

function extractCsrf(html) {
  const match = html.match(/name="csrf" value="([^"]+)"/);
  assert.ok(match, 'Expected csrf hidden input');
  return match[1];
}

function mask(value, left = 12) {
  if (!value || typeof value !== 'string') return String(value);
  return value.length <= left ? value : `${value.slice(0, left)}…`;
}

async function main() {
  log.banner('Ad Visibility SaaS — verbose backend/API/admin smoke tests');
  const server = await startServer();
  const base = server.baseUrl;
  const get = async (pathname, options = {}) => fetchWithTimeout(`${base}${pathname}`, { redirect: 'manual', ...options });
  const postJson = async (pathname, body, options = {}) => fetchWithTimeout(`${base}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: JSON.stringify(body),
    redirect: 'manual',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });

  try {
    log.section('Health, readiness and runtime mode');
    let res = await get('/health');
    assert.equal(res.status, 200);
    let json = await res.json();
    assert.equal(json.ok, true);
    assert.equal(json.env, 'test');
    log.pass('GET /health returns 200 and test environment', `ok=${json.ok}, env=${json.env}`);

    res = await get('/readyz');
    assert.equal(res.status, 200);
    json = await res.json();
    assert.equal(json.ok, true);
    assert.equal(json.projects, 1);
    assert.equal(json.clusterMode, false);
    log.pass('GET /readyz returns expected isolated demo state', `projects=${json.projects}, clusterMode=${json.clusterMode}`);

    log.section('Public marketing UI and mapped static assets');
    const publicRoutes = [
      ['/', 'marketing home'],
      ['/product.html', 'product page'],
      ['/security.html', 'security page'],
      ['/pricing.html', 'pricing page'],
      ['/about.html', 'about page'],
      ['/support.html', 'support page'],
      ['/site/style.css', 'public CSS asset'],
      ['/site/app.js', 'public JS asset']
    ];
    for (const [route, label] of publicRoutes) {
      res = await get(route);
      assert.equal(res.status, 200, `${route} should be served`);
      const text = await res.text();
      assert.ok(text.length > 100, `${route} should not be empty`);
      log.pass(`${label} is served`, `${route}, bytes=${text.length}`);
    }
    res = await get('/platform');
    assert.equal(res.status, 200);
    assertHtml(await res.text(), 'Ad Visibility SaaS Beta', 'Legacy/backend platform landing route still works');

    log.section('Test client site route mapping and SDK script delivery');
    res = await get('/test-site');
    assert.equal(res.status, 200);
    const testSiteHtml = await res.text();
    assertHtml(testSiteHtml, 'Two-site SDK test bundle', 'Test-site launcher page renders');
    const projectKey = testSiteHtml.match(/avp_pub_[A-Za-z0-9_-]+/)?.[0];
    assert.ok(projectKey, 'Expected demo project public key on test-site page');
    log.pass('Demo public key is exposed on /test-site for browser checks', mask(projectKey));

    const testClientRoutes = [
      [`/test-site/article?projectKey=${encodeURIComponent(projectKey)}`, 'normal article scenario'],
      [`/test-site/article?projectKey=${encodeURIComponent(projectKey)}&simulateAdBlock=1`, 'simulated adblock article scenario'],
      [`/test-site/article?projectKey=${encodeURIComponent(projectKey)}&simulateConnectionIssue=1`, 'simulated connection issue article scenario'],
      [`/test-site/article?projectKey=${encodeURIComponent(projectKey)}&case=hide-slot`, 'hidden ad-slot article scenario'],
      [`/test-site/article?projectKey=${encodeURIComponent(projectKey)}&case=server-gate`, 'server-gate article scenario']
    ];
    for (const [route, label] of testClientRoutes) {
      res = await get(route);
      assert.equal(res.status, 200, `${route} should be served`);
      const text = await res.text();
      assert.ok(text.includes(projectKey), `${route} should include project key`);
      assert.ok(text.includes('/sdk/'), `${route} should connect SDK`);
      log.pass(`${label} renders and connects SDK`, route);
    }

    res = await get(`/foreign-test-site?projectKey=${encodeURIComponent(projectKey)}`);
    assert.equal(res.status, 200, '/foreign-test-site should be served');
    const foreignHtml = await res.text();
    assertHtml(foreignHtml, 'Can a different site reuse this project script?', 'Foreign script-tag test page renders');
    assertHtml(foreignHtml, 'FOREIGN INJECTED SDK TAG', 'Foreign page exposes removable injected script tag marker');
    log.pass('Foreign script-tag test site renders with removable injected snippet', '/foreign-test-site');

    res = await get(`/sdk/v1/${encodeURIComponent(projectKey)}.js`);
    assert.equal(res.status, 200);
    const entryJs = await res.text();
    assertHtml(entryJs, 'AVP project entry loader');
    assertHtml(entryJs, 'document.createElement');
    assertHtml(entryJs, '/sdk/');
    log.pass('Stable customer SDK tag returns a guarded no-store entry loader', `/sdk/v1/${mask(projectKey)}.js`);

    res = await get(`/sdk/v1/${encodeURIComponent(projectKey)}/boot-test.js`);
    assert.equal(res.status, 200);
    const bootJs = await res.text();
    assertHtml(bootJs, 'document.createElement');
    assertHtml(bootJs, 'encodeURIComponent(key)');
    log.pass('SDK boot-test helper dynamically injects SDK script safely', `bytes=${bootJs.length}`);

    res = await get(`/sdk/v1/${encodeURIComponent(projectKey)}/dyn-test.js`);
    assert.equal(res.status, 200);
    const sdkJs = await res.text();
    assertHtml(sdkJs, '/api/v1/session');
    assertHtml(sdkJs, '/api/v1/events');
    log.pass('Dynamic SDK payload includes required API calls', `/sdk/v1/${mask(projectKey)}/dyn-test.js`);

    log.section('API contract: ping, sessions, challenge, ad fragment and event ingest');
    res = await get(`/api/v1/ping?projectKey=${encodeURIComponent(projectKey)}`);
    assert.equal(res.status, 200);
    json = await res.json();
    assert.equal(json.success, true);
    log.pass('GET /api/v1/ping accepts valid project key', `success=${json.success}`);

    res = await postJson('/api/v1/session', { projectKey: 'missing_project', pageUrl: `${base}/x` });
    assert.equal(res.status, 404);
    json = await res.json();
    assert.equal(json.reason, 'project_not_found');
    log.pass('POST /api/v1/session rejects missing project', `status=404, reason=${json.reason}`);

    const originHeaders = { Origin: `${base}` };
    const clientKeys = createClientSigningKeyPair();
    res = await postJson('/api/v1/session', {
      projectKey,
      pageUrl: `${base}/test-site/article`,
      mode: 'soft-gate',
      clientPublicKey: clientKeys.publicJwk
    }, { headers: originHeaders });
    assert.equal(res.status, 200);
    json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.visitorToken, 'Expected visitor token');
    assert.equal(json.mode, 'soft-gate');
    assert.equal(json.settings.protectedSelector, '#protected-content');
    const visitorToken = json.visitorToken;
    log.pass('POST /api/v1/session creates visitor token and returns SDK settings', `token=${mask(visitorToken)}, mode=${json.mode}, protectedSelector=${json.settings.protectedSelector}`);

    res = await postJson('/api/v1/challenge', { projectKey, visitorToken, kind: 'content' }, { headers: originHeaders });
    assert.equal(res.status, 200);
    json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.challenge.nonce);
    assert.ok(json.challenge.poolToken);
    const challenge = json.challenge;
    log.pass('POST /api/v1/challenge issues nonce/pool proof fields', `nonce=${mask(challenge.nonce, 10)}, slotId=${challenge.slotId}`);

    res = await get(`/api/v1/ad-fragment?projectKey=${encodeURIComponent(projectKey)}&visitorToken=${encodeURIComponent(visitorToken)}&reason=test&nonce=${encodeURIComponent(challenge.nonce)}&slotId=${encodeURIComponent(challenge.slotId)}&baitToken=${encodeURIComponent(challenge.baitToken)}`, { headers: originHeaders });
    assert.equal(res.status, 200);
    json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.html.includes('data-avp-slot'));
    log.pass('GET /api/v1/ad-fragment returns safe test ad HTML', 'contains data-avp-slot');

    res = await postJson('/api/v1/events', {
      projectKey,
      visitorToken,
      type: 'connection_issue',
      reason: 'autotest_unsigned_console_event',
      details: { pageUrl: `${base}/test-site/article` }
    }, { headers: originHeaders });
    assert.equal(res.status, 403);
    json = await res.json();
    assert.equal(json.reason, 'unsigned_event');
    log.pass('POST /api/v1/events rejects unsigned console-style event', `status=403, reason=${json.reason}`);

    const signedDetails = { pageUrl: `${base}/test-site/article` };
    const eventEnvelope = { projectKey, visitorToken, type: 'connection_issue', reason: 'autotest_connection_issue', seq: 1, detailsHash: sha256(JSON.stringify(signedDetails)), pageUrl: `${base}/test-site/article`, ts: Date.now() };
    const eventSignature = signClientPayload(clientKeys.privateKey, eventEnvelope);
    res = await postJson('/api/v1/events', {
      projectKey,
      visitorToken,
      type: 'connection_issue',
      reason: 'autotest_connection_issue',
      details: signedDetails,
      eventEnvelope,
      eventSignature
    }, { headers: originHeaders });
    assert.equal(res.status, 200);
    json = await res.json();
    assert.equal(json.success, true);
    log.pass('POST /api/v1/events ingests signed SDK event', 'type=connection_issue, reason=autotest_connection_issue');

    res = await postJson('/api/v1/events/batch', { projectKey, visitorToken, events: [] }, { headers: originHeaders });
    assert.equal(res.status, 400);
    json = await res.json();
    assert.equal(json.reason, 'empty_batch');
    log.pass('POST /api/v1/events/batch rejects empty event batch', `status=400, reason=${json.reason}`);

    res = await postJson('/api/v1/server/verify', { projectKey, visitorToken, secretKey: 'bad-secret' });
    assert.equal(res.status, 403);
    json = await res.json();
    assert.equal(json.allowed, false);
    assert.equal(json.reason, 'bad_project_or_secret');
    log.pass('POST /api/v1/server/verify rejects bad secret key', `status=403, reason=${json.reason}`);

    res = await postJson('/test-site/backend-unlock', { projectKey, visitorToken });
    assert.equal(res.status, 200);
    json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.allowed, false);
    assert.equal(json.reason, 'not_confirmed_or_expired');
    log.pass('Test-site backend unlock route does server-side verification', `allowed=${json.allowed}, reason=${json.reason}`);

    res = await fetchWithTimeout(`${base}/api/v1/session`, {
      method: 'OPTIONS',
      headers: { Origin: base, 'Access-Control-Request-Method': 'POST' },
      redirect: 'manual'
    });
    assert.equal(res.status, 204);
    log.pass('OPTIONS /api/v1/session handles CORS preflight', 'status=204');

    log.section('Admin auth, dashboard, CSRF protection and project creation');
    res = await get('/admin');
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/admin/login');
    log.pass('GET /admin without session redirects to login', '302 → /admin/login');

    res = await get('/admin/login');
    assert.equal(res.status, 200);
    assertHtml(await res.text(), 'Owner dashboard login', 'Admin login page renders');

    res = await fetchWithTimeout(`${base}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: 'owner@example.com', password: 'admin123' }).toString(),
      redirect: 'manual'
    });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/admin');
    const adminCookie = firstCookie(res.headers.get('set-cookie'));
    log.pass('POST /admin/login authenticates default test owner', '302 → /admin, session cookie issued');

    res = await get('/admin', { headers: { Cookie: adminCookie } });
    assert.equal(res.status, 200);
    const adminHtml = await res.text();
    assertHtml(adminHtml, 'Beta SaaS dashboard', 'Admin dashboard opens with authenticated session');

    res = await get('/admin/projects/new', { headers: { Cookie: adminCookie } });
    assert.equal(res.status, 200);
    const newProjectHtml = await res.text();
    const csrf = extractCsrf(newProjectHtml);
    log.pass('GET /admin/projects/new returns project form and CSRF token', `csrf=${mask(csrf, 10)}`);

    res = await fetchWithTimeout(`${base}/admin/backup-now`, {
      method: 'POST',
      headers: { Cookie: adminCookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({}).toString(),
      redirect: 'manual'
    });
    assert.equal(res.status, 403, 'POST admin actions must reject missing CSRF');
    log.pass('Admin POST action rejects missing CSRF token', 'POST /admin/backup-now → 403');

    res = await fetchWithTimeout(`${base}/admin/projects/create`, {
      method: 'POST',
      headers: { Cookie: adminCookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        csrf,
        companyName: 'Autotest Publisher',
        contactEmail: 'qa@example.com',
        projectName: 'Autotest Project',
        mode: 'server-gate',
        allowedDomains: 'localhost\n127.0.0.1',
        protectedSelector: '#protected-content',
        adContainerSelector: '#ad-slot',
        marketBenchmarkPercent: '33',
        strictness: 'balanced'
      }).toString(),
      redirect: 'manual'
    });
    assert.equal(res.status, 302);
    assert.match(res.headers.get('location') || '', /^\/admin\/projects\/prj_/);
    log.pass('POST /admin/projects/create creates server-gate project', `${res.status} → ${res.headers.get('location')}`);

    res = await get('/admin', { headers: { Cookie: adminCookie } });
    assert.equal(res.status, 200);
    assertHtml(await res.text(), 'Autotest Project', 'New project appears on admin dashboard table');

    log.section('Metrics and isolated JSON persistence');
    res = await get('/metrics');
    assert.equal(res.status, 200);
    const metrics = await res.text();
    assertHtml(metrics, 'avp_up 1');
    assertHtml(metrics, 'avp_projects 2');
    log.pass('GET /metrics exposes service health and project count', 'avp_up=1, avp_projects=2');

    await sleep(400);
    const dataFile = server.env.DATA_FILE;
    assert.ok(fs.existsSync(dataFile), 'Expected isolated state file to exist');
    const state = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    assert.equal(state.projects.length, 2);
    assert.ok(state.projects.every(project => project.secretKeyEnc || (project.secrets || []).length), 'Projects should keep server secret encrypted at rest');
    assert.ok(state.globalEvents.length > 0, 'Expected API activity to be recorded in global events');
    log.pass('Isolated state file was written without touching real storage', dataFile);
    log.pass('Project secrets are not stored as plain frontend values', `projects=${state.projects.length}`);
    log.pass('API activity was recorded into globalEvents', `events=${state.globalEvents.length}`);

    log.section('Production guard');
    const prodPort = await getFreePort();
    const prod = childProcess.spawnSync(process.execPath, ['server.js'], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        USE_HTTPS: 'false',
        HOST: '127.0.0.1',
        PORT: String(prodPort),
        PUBLIC_BASE_URL: `http://127.0.0.1:${prodPort}`
      },
      encoding: 'utf8',
      timeout: 5000
    });
    assert.notEqual(prod.status, 0, 'Production guard should reject unsafe defaults');
    assert.ok(`${prod.stdout}\n${prod.stderr}`.includes('[production-guard] Refusing to start'));
    log.pass('Unsafe production config fails loudly before server start', `exit=${prod.status}`);

    log.summary();
  } finally {
    await stopServer(server);
    try { fs.rmSync(server.tmp, { recursive: true, force: true }); } catch {}
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
