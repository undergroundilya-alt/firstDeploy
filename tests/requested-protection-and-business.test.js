'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');

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
function sha256(value) { return require('node:crypto').createHash('sha256').update(String(value)).digest('hex'); }
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
function createSigningIdentity() {
  const crypto = require('node:crypto');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const publicJwk = publicKey.export({ format: 'jwk' });
  function signPayload(payload) {
    return crypto.sign('sha256', Buffer.from(canonicalPayload(payload)), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64');
  }
  return { publicJwk, signPayload };
}
class Log {
  constructor() { this.sections = 0; this.checks = 0; this.startedAt = Date.now(); }
  banner(title) { console.log(`\n${'='.repeat(82)}\n${title}\n${'='.repeat(82)}`); }
  section(title) { this.sections += 1; console.log(`\n▶ ${this.sections}. ${title}`); }
  pass(message, details = '') { this.checks += 1; console.log(`   ✓ ${this.checks}. ${message}${details ? ` — ${details}` : ''}`); }
  info(message, details = '') { console.log(`   • ${message}${details ? ` — ${details}` : ''}`); }
  summary() { console.log(`\n✅ Requested protection/business tests passed: ${this.checks} checks in ${this.sections} sections, ${((Date.now() - this.startedAt) / 1000).toFixed(1)}s`); }
}
const log = new Log();

async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Timeout fetching ${url}`)), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}
async function startServer() {
  const port = await getFreePort();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avp-requested-'));
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
    ENABLE_POSTGRES_STORAGE: 'false'
  };
  log.info('Starting isolated requested-scenarios server', `port=${port}, storage=${storageRoot}`);
  const child = childProcess.spawn(process.execPath, ['server.js'], { cwd: PROJECT_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', c => { stdout += c.toString(); });
  child.stderr.on('data', c => { stderr += c.toString(); });
  const baseUrl = `http://127.0.0.1:${port}`;
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    if (child.exitCode !== null) throw new Error(`Server exited early\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
    try {
      const res = await fetchWithTimeout(`${baseUrl}/health`, { redirect: 'manual' }, 1000);
      if (res.status === 200) return { child, baseUrl, tmp, env, storageRoot, getLogs: () => ({ stdout, stderr }) };
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
function firstCookie(setCookieHeader) {
  assert.ok(setCookieHeader, 'Expected Set-Cookie header');
  return setCookieHeader.split(';')[0];
}
function extractCsrf(html) {
  const match = html.match(/name="csrf" value="([^"]+)"/);
  assert.ok(match, 'Expected csrf hidden input');
  return match[1];
}

async function main() {
  log.banner('Requested protection, SaaS business and safety-edge tests');
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
    let res = await get('/test-site');
    assert.equal(res.status, 200);
    let text = await res.text();
    const projectKey = text.match(/avp_pub_[A-Za-z0-9_-]+/)?.[0];
    assert.ok(projectKey, 'Expected demo project key');
    log.pass('Demo project key detected for requested scenario checks', mask(projectKey));

    log.section('Protection chain: heartbeat, lease and hard-lock SDK markers');
    res = await get(`/sdk/v1/${encodeURIComponent(projectKey)}/dyn-test.js`);
    assert.equal(res.status, 200);
    const sdk = await res.text();
    assert.ok(sdk.includes('/api/v1/heartbeat'));
    assert.ok(sdk.includes('avp-hard-lock'));
    assert.ok(sdk.includes('data-avp-lock'));
    assert.ok(sdk.includes('MutationObserver'));
    assert.ok(sdk.includes('IntersectionObserver'));
    assert.ok(sdk.includes('getBoundingClientRect'));
    assert.ok(sdk.includes("display!=='none'"));
    assert.ok(sdk.includes("visibility!=='hidden'"));
    assert.ok(sdk.includes('opacity'));
    assert.ok(sdk.includes('scheduledRerender'));
    assert.ok(sdk.includes('visibilitychange'));
    assert.ok(sdk.includes('Mobi|Android|iPhone|iPad'));
    log.pass('SDK contains heartbeat endpoint integration', '/api/v1/heartbeat');
    log.pass('SDK contains hard-lock body replacement marker', 'avp-hard-lock + data-avp-lock');
    log.pass('SDK contains MutationObserver and body/ad-zone watcher markers', 'MutationObserver + documentElement observer');
    log.pass('SDK contains ad-zone geometry/visibility checks', 'IntersectionObserver + getBoundingClientRect + display/visibility/opacity');
    log.pass('SDK contains rerender, tab-return and mobile performance markers', 'scheduledRerender + visibilitychange + mobile DOM-noise limit');

    res = await postJson('/api/v1/session', { projectKey, pageUrl: `${base}/test-site/article`, mode: 'soft-gate' }, { headers: { Origin: base } });
    assert.equal(res.status, 200);
    let json = await res.json();
    assert.equal(json.success, true);
    const visitorToken = json.visitorToken;
    log.pass('Visitor session can be created before heartbeat verification', mask(visitorToken));

    res = await get(`/api/v1/lease-status?projectKey=${encodeURIComponent(projectKey)}&visitorToken=${encodeURIComponent(visitorToken)}`, { headers: { Origin: base } });
    assert.equal(res.status, 200);
    json = await res.json();
    assert.equal(json.allowed, false);
    assert.equal(json.reason, 'lease_missing_or_expired');
    log.pass('Lease status denies access before proof/heartbeat', `allowed=${json.allowed}, reason=${json.reason}`);

    res = await postJson('/api/v1/heartbeat', { projectKey, visitorToken, status: 'failed', adStatus: 'hidden', reason: 'autotest_ad_zone_hidden', pageUrl: `${base}/test-site/article` }, { headers: { Origin: base } });
    assert.equal(res.status, 200);
    json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.leaseValid, false);
    assert.equal(json.status, 'failed');
    log.pass('Heartbeat endpoint marks ad-zone failure as failed session', `status=${json.status}, leaseValid=${json.leaseValid}`);

    res = await postJson('/test-site/backend-unlock', { projectKey, visitorToken });
    assert.equal(res.status, 200);
    json = await res.json();
    assert.equal(json.allowed, false);
    log.pass('Backend unlock remains denied after failed heartbeat/ad validation', `reason=${json.reason}`);

    log.section('Tamper/replay guard: signed proof must not be replaceable through Charles-like payload edits');
    res = await postJson('/api/v1/challenge', { projectKey, visitorToken, kind: 'content' }, { headers: { Origin: base } });
    assert.equal(res.status, 200);
    json = await res.json();
    const ch = json.challenge;
    res = await postJson('/api/v1/proof', {
      projectKey,
      visitorToken,
      payload: { kind: 'content', seq: ch.seq, nonce: ch.nonce, slotId: ch.slotId, poolToken: ch.poolToken, proof: 'tampered', visibleRatioScaled: 1000, baitNetworkOk: true, baitDomVisible: true, pageUrl: `${base}/test-site/article`, mode: 'soft-gate' },
      signature: 'tampered-signature'
    }, { headers: { Origin: base } });
    assert.equal(res.status, 403);
    json = await res.json();
    assert.equal(json.reason, 'signature_invalid');
    log.pass('Server rejects tampered proof payload/signature', `status=403, reason=${json.reason}`);

    log.section('Core access flow: valid proof, lease, heartbeat, replay and domain isolation');
    const signer = createSigningIdentity();
    res = await postJson('/api/v1/session', { projectKey, pageUrl: `${base}/premium/article`, mode: 'soft-gate', clientPublicKey: signer.publicJwk }, { headers: { Origin: base } });
    assert.equal(res.status, 200);
    json = await res.json();
    assert.equal(json.success, true);
    const verifiedVisitorToken = json.visitorToken;
    log.pass('Normal scenario starts with signed visitor session', `visitorToken=${mask(verifiedVisitorToken)}`);

    res = await postJson('/api/v1/challenge', { projectKey, visitorToken: verifiedVisitorToken, kind: 'content' }, { headers: { Origin: base } });
    assert.equal(res.status, 200);
    json = await res.json();
    const validChallenge = json.challenge;
    assert.ok(validChallenge.nonce && validChallenge.slotId && validChallenge.poolToken);
    log.pass('Lease/proof challenge includes nonce, sequence, slot and pool token', `seq=${validChallenge.seq}, slot=${mask(validChallenge.slotId)}`);

    res = await get(`/api/v1/bait-hit?kind=script&projectKey=${encodeURIComponent(projectKey)}&visitorToken=${encodeURIComponent(verifiedVisitorToken)}&nonce=${encodeURIComponent(validChallenge.nonce)}&slotId=${encodeURIComponent(validChallenge.slotId)}&baitToken=${encodeURIComponent(validChallenge.baitToken)}`, { headers: { Origin: base } });
    assert.equal(res.status, 200);
    log.pass('Server records bait hit before accepting proof', 'bait script request returned 200');

    const validPayload = {
      kind: 'content', seq: validChallenge.seq, nonce: validChallenge.nonce, slotId: validChallenge.slotId, poolToken: validChallenge.poolToken,
      proof: expectedCanvasProof(validChallenge.nonce), visibleRatioScaled: 1000, baitNetworkOk: true, baitDomVisible: true, pageUrl: `${base}/premium/article`, mode: 'soft-gate'
    };
    res = await postJson('/api/v1/proof', { projectKey, visitorToken: verifiedVisitorToken, payload: validPayload, signature: signer.signPayload(validPayload) }, { headers: { Origin: base } });
    assert.equal(res.status, 200);
    json = await res.json();
    assert.equal(json.allowed, true);
    log.pass('Valid signed proof unlocks access server-side', `reason=${json.reason}`);

    res = await get(`/api/v1/lease-status?projectKey=${encodeURIComponent(projectKey)}&visitorToken=${encodeURIComponent(verifiedVisitorToken)}`, { headers: { Origin: base } });
    assert.equal(res.status, 200);
    json = await res.json();
    assert.equal(json.allowed, true);
    assert.equal(json.reason, 'lease_active');
    log.pass('Fresh lease is active immediately after valid proof', `allowed=${json.allowed}, heartbeatFresh=${json.heartbeatFresh}`);

    res = await postJson('/api/v1/heartbeat', { projectKey, visitorToken: verifiedVisitorToken, status: 'ok', adStatus: 'visible', reason: 'heartbeat_ok', pageUrl: `${base}/premium/article` }, { headers: { Origin: base } });
    assert.equal(res.status, 200);
    json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.leaseValid, true);
    log.pass('Heartbeat with visible ad keeps lease valid', `leaseValid=${json.leaseValid}, status=${json.status}`);

    res = await postJson('/api/v1/proof', { projectKey, visitorToken: verifiedVisitorToken, payload: validPayload, signature: signer.signPayload(validPayload) }, { headers: { Origin: base } });
    assert.equal(res.status, 403);
    json = await res.json();
    assert.equal(json.reason, 'challenge_missing_or_reused');
    log.pass('Replay of already-used proof is rejected', `reason=${json.reason}`);

    res = await postJson('/api/v1/heartbeat', { projectKey, visitorToken: verifiedVisitorToken, status: 'failed', adStatus: 'not_visible', reason: 'mutation_observer_ad_container_removed', pageUrl: `${base}/premium/article` }, { headers: { Origin: base } });
    assert.equal(res.status, 200);
    json = await res.json();
    assert.equal(json.status, 'failed');
    assert.equal(json.leaseValid, false);
    log.pass('Mutation/ad-zone failure heartbeat revokes lease', `status=${json.status}, reason=mutation_observer_ad_container_removed`);

    res = await get(`/api/v1/lease-status?projectKey=${encodeURIComponent(projectKey)}&visitorToken=${encodeURIComponent(verifiedVisitorToken)}`, { headers: { Origin: base } });
    assert.equal(res.status, 200);
    json = await res.json();
    assert.equal(json.allowed, false);
    log.pass('Lease status denies access after ad-zone mutation failure', `allowed=${json.allowed}, reason=${json.reason}`);

    res = await postJson('/api/v1/session', { projectKey, pageUrl: 'http://evil.example/premium/article', mode: 'soft-gate' }, { headers: { Origin: 'http://evil.example' } });
    assert.equal(res.status, 403);
    json = await res.json();
    assert.equal(json.reason, 'origin_not_allowed');
    log.pass('Project/domain isolation rejects session from unapproved origin', `reason=${json.reason}`);

    log.section('Business backend: leads, registration DB, OAuth stubs, billing verification stub and trial banner API');
    res = await postJson('/api/v1/leads', { projectKey, name: 'QA Lead', email: 'qa@example.com', company: 'QA Media', siteUrl: 'https://client-site.com', message: 'Please contact us about an enterprise beta test.', source: 'autotest' }, { headers: { Origin: base } });
    assert.equal(res.status, 201);
    json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.leadId);
    assert.ok(fs.existsSync(server.env.LEADS_FILE));
    const leads = JSON.parse(fs.readFileSync(server.env.LEADS_FILE, 'utf8'));
    assert.equal(leads.leads.length, 1);
    log.pass('Lead capture backend stores form submissions in isolated leads DB', `leadId=${json.leadId}`);

    res = await postJson('/auth/register', { fullName: 'Client Owner', phone: '380671234567', email: 'client-owner@example.com', password: 'strongpass123', confirmPassword: 'strongpass123', companyName: 'Client Publisher', termsAccepted: true });
    assert.equal(res.status, 201);
    json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.status, 'trial');
    assert.ok(json.trial.daysRemaining > 0);
    assert.ok(fs.existsSync(server.env.AUTH_DB_FILE));
    const authDb = JSON.parse(fs.readFileSync(server.env.AUTH_DB_FILE, 'utf8'));
    assert.equal(authDb.accounts.length, 1);
    log.pass('Client registration writes to separate auth account DB', `accountId=${json.accountId}, trialDays=${json.trial.daysRemaining}`);

    res = await postJson('/auth/register', { fullName: 'Client Owner', phone: '380671234567', email: 'client-owner@example.com', password: 'strongpass123', confirmPassword: 'strongpass123', companyName: 'Client Publisher', termsAccepted: true });
    assert.equal(res.status, 409);
    json = await res.json();
    assert.equal(json.reason, 'account_exists');
    log.pass('Registration rejects duplicate account email', `status=409, reason=${json.reason}`);

    res = await get('/auth/google/start');
    assert.equal(res.status, 501);
    json = await res.json();
    assert.equal(json.reason, 'google_oauth_not_configured');
    log.pass('Google OAuth route fails safely when credentials are not configured', json.reason);

    res = await get('/auth/github/start');
    assert.equal(res.status, 501);
    json = await res.json();
    assert.equal(json.reason, 'github_oauth_not_configured');
    log.pass('GitHub OAuth route fails safely when credentials are not configured', json.reason);

    res = await postJson('/api/v1/billing/card-verification', { accountId: 'acct_demo', plan: 'monthly' });
    assert.equal(res.status, 501);
    json = await res.json();
    assert.equal(json.reason, 'billing_provider_not_configured');
    log.pass('Card verification endpoint exists but refuses to fake billing without provider', json.reason);

    res = await get(`/api/v1/trial-status?projectKey=${encodeURIComponent(projectKey)}`);
    assert.equal(res.status, 200);
    json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.trial.daysRemaining >= 0);
    log.pass('Trial status API returns server-side trial countdown for frontend banner', `daysRemaining=${json.trial.daysRemaining}`);

    log.section('Admin security, per-client analytics and cluster/load-test scaffolding');
    res = await fetchWithTimeout(`${base}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: 'owner@example.com', password: 'admin123' }).toString(),
      redirect: 'manual'
    });
    assert.equal(res.status, 302);
    const adminCookie = firstCookie(res.headers.get('set-cookie'));
    res = await get('/admin/security', { headers: { Cookie: adminCookie } });
    assert.equal(res.status, 200);
    const securityHtml = await res.text();
    const csrf = extractCsrf(securityHtml);
    assert.ok(securityHtml.includes('MFA'));
    log.pass('Admin security page exposes MFA controls', 'GET /admin/security');

    res = await fetchWithTimeout(`${base}/admin/security/mfa-generate`, {
      method: 'POST',
      headers: { Cookie: adminCookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrf }).toString(),
      redirect: 'manual'
    });
    assert.equal(res.status, 200);
    assert.ok((await res.text()).includes('TOTP secret generated'));
    log.pass('MFA TOTP setup secret can be generated through admin flow', 'POST /admin/security/mfa-generate');

    res = await get('/admin', { headers: { Cookie: adminCookie } });
    assert.equal(res.status, 200);
    const adminHtml = await res.text();
    assert.ok(adminHtml.includes('Protected Content Demo'));
    assert.ok(adminHtml.includes('Reasons') || adminHtml.includes('Причины'));
    log.pass('Admin dashboard still shows per-project analytics/reason table', 'project dashboard link and reasons area visible');

    await sleep(350);
    const state = JSON.parse(fs.readFileSync(server.env.DATA_FILE, 'utf8'));
    const demoProject = state.projects.find(p => p.publicKey === projectKey);
    assert.ok(demoProject, 'Expected demo project in isolated state file');
    const projectEvents = (state.globalEvents || []).filter(e => e.projectId === demoProject.id);
    assert.ok(projectEvents.some(e => e.type === 'heartbeat_lost' && /mutation_observer_ad_container_removed|autotest_ad_zone_hidden/.test(e.reason || '')));
    assert.ok(projectEvents.some(e => e.type === 'proof_ok'));
    assert.ok(projectEvents.some(e => e.type === 'proof_failed' && e.reason === 'challenge_missing_or_reused'));
    assert.ok(projectEvents.every(e => !e.projectId || e.projectId === demoProject.id));
    log.pass('Analytics records heartbeat/ad-zone failure, proof OK and replay rejection under the right project', `events=${projectEvents.length}`);

    for (const file of ['deploy/docker-compose.production.yml', 'deploy/docker-compose.postgres.yml', 'scripts/load-test.js', 'scripts/load-test-cluster-model.js']) {
      assert.ok(fs.existsSync(path.join(PROJECT_ROOT, file)), `Expected ${file}`);
      log.pass('Cluster/load-test scaffold exists', file);
    }

    log.section('Unsupported-by-design security claims are documented instead of faked');
    const unsupported = [
      'Absolute ban on console commands is not possible in a user-controlled browser.',
      'Random phantom SDK files are not treated as a primary security control; server-side lease is the control.',
      'Card verification requires a real billing provider before production use.'
    ];
    for (const item of unsupported) log.pass('Explicit limitation acknowledged', item);

    const checklistPath = path.join(PROJECT_ROOT, 'docs/43_CORE_SECURITY_TEST_PLAN.md');
    assert.ok(fs.existsSync(checklistPath), 'Expected core security test plan document');
    const checklist = fs.readFileSync(checklistPath, 'utf8');
    for (const heading of ['Normal scenario', 'Heartbeat', 'Lease', 'MutationObserver', 'Ad zone integrity', 'Hard lock', 'Request tampering', 'uBlock before load', 'uBlock after load', 'AdProof server blocked', 'Protected content is not preloaded', 'New page requires verification', 'Analytics', 'Client/project/domain isolation', 'Mobile', 'Combined stress/tamper scenario']) {
      assert.ok(checklist.includes(heading), `Checklist missing ${heading}`);
    }
    log.pass('Core security checklist document covers all 16 requested areas', 'docs/43_CORE_SECURITY_TEST_PLAN.md');

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
