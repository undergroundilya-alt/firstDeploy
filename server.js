'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const childProcess = require('child_process');
const { URL } = require('url');
const { createScalableRuntime } = require('./src/runtime/scalable-runtime');
const { createEmailService } = require('./src/blocks/email-service');
const { portalResponsiveCss } = require('./src/blocks/client-portal-block');
const NODEMAILER_AVAILABLE = (() => { try { require.resolve('nodemailer'); return true; } catch { return false; } })();


function loadLocalEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const eqIndex = trimmed.indexOf('=');
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadLocalEnvFile();

function normalizeConfiguredSecret(value) {
  const v = String(value || '').trim();
  if (!v) return '';
  if (/^(REPLACE|CHANGE|YOUR_|PASTE_)/i.test(v)) return '';
  if (/REPLACE_WITH/i.test(v)) return '';
  return v;
}

// In production hosts like Render, TLS is terminated by the platform.
// Default to HTTP behind the reverse proxy unless USE_HTTPS is explicitly true.
const DEFAULT_USE_HTTPS = String(process.env.NODE_ENV || '').toLowerCase() === 'production' ? 'false' : 'true';
const USE_HTTPS = String(process.env.USE_HTTPS || DEFAULT_USE_HTTPS).toLowerCase() !== 'false';
if (USE_HTTPS) require('./ensure-certs')();

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 3443);
const APP_ENV = process.env.NODE_ENV || 'development';
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || `${USE_HTTPS ? 'https' : 'http'}://localhost:${PORT}`).replace(/\/$/, '');
const CURRENT_VERSION = '2.1.0-cluster-commercial-beta';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'owner@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const STORAGE_ROOT = path.resolve(__dirname, process.env.STORAGE_ROOT || './storage');
const DATA_FILE = path.resolve(__dirname, process.env.DATA_FILE || path.join(STORAGE_ROOT, 'saas-state.json'));
const RUNTIME_FILE = path.resolve(__dirname, process.env.RUNTIME_FILE || path.join(STORAGE_ROOT, 'runtime-sessions.json'));
const CERT_KEY = path.join(__dirname, 'certs', 'localhost-key.pem');
const CERT_CRT = path.join(__dirname, 'certs', 'localhost-cert.pem');
const SESSION_SECRET = process.env.SESSION_SECRET || sha256(`${ADMIN_EMAIL}:${ADMIN_PASSWORD}:dev-session-secret`);
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || sha256(`${ADMIN_EMAIL}:${ADMIN_PASSWORD}:dev-encryption-key`);
const BACKUP_DIR = path.resolve(__dirname, process.env.BACKUP_DIR || path.join(STORAGE_ROOT, 'backups'));
const EVENT_LOG_DIR = path.resolve(__dirname, process.env.EVENT_LOG_DIR || path.join(STORAGE_ROOT, 'events'));
const AUTH_DB_FILE = path.resolve(__dirname, process.env.AUTH_DB_FILE || path.join(STORAGE_ROOT, 'auth-accounts.json'));
const LEADS_FILE = path.resolve(__dirname, process.env.LEADS_FILE || path.join(STORAGE_ROOT, 'leads.json'));
const EMAIL_OUTBOX_FILE = path.resolve(__dirname, process.env.EMAIL_OUTBOX_FILE || path.join(STORAGE_ROOT, 'email-outbox.json'));
const SMTP_HOST = normalizeConfiguredSecret(process.env.SMTP_HOST || '');
const SMTP_PORT = Number(process.env.SMTP_PORT || (String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' ? 465 : 587));
const SMTP_SECURE = String(process.env.SMTP_SECURE || (SMTP_PORT === 465 ? 'true' : 'false')).toLowerCase() === 'true';
const SMTP_USER = normalizeConfiguredSecret(process.env.SMTP_USER || '');
const SMTP_PASS = normalizeConfiguredSecret(process.env.SMTP_PASS || '');
const SMTP_FROM = process.env.SMTP_FROM || (SMTP_USER ? `AdProof <${SMTP_USER}>` : `AdProof <${ADMIN_EMAIL}>`);
const SMTP_REPLY_TO = process.env.SMTP_REPLY_TO || '';
const SMTP_REQUIRE_TLS = String(process.env.SMTP_REQUIRE_TLS || 'true').toLowerCase() !== 'false';
const SMTP_TIMEOUT_MS = Number(process.env.SMTP_TIMEOUT_MS || 15000);
const SMTP_ENABLED = String(process.env.SMTP_ENABLED || (SMTP_HOST ? 'true' : 'false')).toLowerCase() === 'true';
const SMTP_FAIL_BLOCKS_AUTH = String(process.env.SMTP_FAIL_BLOCKS_AUTH || 'false').toLowerCase() === 'true';
const AUTH_DEBUG_LOGS = String(process.env.AUTH_DEBUG_LOGS || (APP_ENV === 'development' ? 'true' : 'false')).toLowerCase() === 'true';
const CLIENT_COOKIE = 'avp_client';
const CLIENT_SESSION_TTL = Number(process.env.CLIENT_SESSION_TTL_MS || 60 * 60 * 1000);
const APP_DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
const APP_DB_ENABLED = String(process.env.ENABLE_APP_DB || process.env.ENABLE_POSTGRES_STORAGE || (APP_DB_URL ? 'true' : 'false')).toLowerCase() === 'true';
const APP_DB_CONFIGURED = Boolean(APP_DB_URL);
const AUTH_REQUIRE_DATABASE_FOR_CLIENT_AUTH = String(process.env.AUTH_REQUIRE_DATABASE_FOR_CLIENT_AUTH || process.env.AUTH_REQUIRE_APP_DB || (APP_ENV === 'production' && APP_DB_ENABLED ? 'true' : 'false')).toLowerCase() === 'true';
const APP_DB_SSL = String(process.env.POSTGRES_SSL || process.env.DATABASE_SSL || '').toLowerCase() === 'true';
const AUDIT_LOG_DIR = path.resolve(__dirname, process.env.AUDIT_LOG_DIR || path.join(STORAGE_ROOT, 'audit'));
const ALERT_LOG_DIR = path.resolve(__dirname, process.env.ALERT_LOG_DIR || path.join(STORAGE_ROOT, 'alerts'));
const DEAD_LETTER_DIR = path.resolve(__dirname, process.env.DEAD_LETTER_DIR || path.join(STORAGE_ROOT, 'dead-letter'));
const CORRUPTED_DIR = path.resolve(__dirname, process.env.CORRUPTED_DIR || path.join(STORAGE_ROOT, 'corrupted'));
const EXTERNAL_BACKUP_DIR = process.env.EXTERNAL_BACKUP_DIR ? path.resolve(__dirname, process.env.EXTERNAL_BACKUP_DIR) : '';
const EXTERNAL_BACKUP_COMMAND = process.env.EXTERNAL_BACKUP_COMMAND || '';
const EVENT_LOG_RETENTION_DAYS = Number(process.env.EVENT_LOG_RETENTION_DAYS || 90);
const OLD_EVENT_LOG_GZIP_AFTER_DAYS = Number(process.env.OLD_EVENT_LOG_GZIP_AFTER_DAYS || 14);
const BACKUP_INTERVAL_MS = Number(process.env.BACKUP_INTERVAL_MS || 6 * 60 * 60 * 1000);
const RESTORE_DRILL_INTERVAL_MS = Number(process.env.RESTORE_DRILL_INTERVAL_MS || 24 * 60 * 60 * 1000);
const BACKUP_RETENTION = Number(process.env.BACKUP_RETENTION || 24);
const DOCS_PRIVATE = String(process.env.DOCS_PRIVATE || (APP_ENV === 'production' ? 'true' : 'false')).toLowerCase() === 'true';
const METRICS_TOKEN = process.env.METRICS_TOKEN || '';
const METRICS_REQUIRE_TOKEN_IN_PRODUCTION = String(process.env.METRICS_REQUIRE_TOKEN_IN_PRODUCTION || 'true').toLowerCase() !== 'false';
const METRICS_ALLOW_IPS = asArrayLines(process.env.METRICS_ALLOW_IPS || '127.0.0.1,::1');
const TRUST_PROXY = String(process.env.TRUST_PROXY || 'false').toLowerCase() === 'true';
const TRUST_PROXY_IPS = asArrayLines(process.env.TRUST_PROXY_IPS || '127.0.0.1,::1');
const STRICT_PRODUCTION_GUARD = String(process.env.STRICT_PRODUCTION_GUARD || 'true').toLowerCase() !== 'false';
const REQUIRE_MFA_IN_PRODUCTION = String(process.env.REQUIRE_MFA_IN_PRODUCTION || (APP_ENV === 'production' ? 'true' : 'false')).toLowerCase() === 'true';
const DEFAULT_SDK_VERSION = process.env.DEFAULT_SDK_VERSION || 'v1';
const DEFAULT_SDK_CHANNEL = process.env.DEFAULT_SDK_CHANNEL || 'stable';
const PUBLIC_SITE_ROOT = path.join(__dirname, 'public-site');
const MARKETING_FRONTEND_FILES = new Set(['index.html','product.html','ai.html','security.html','pricing.html','docs.html','blog.html','about.html','support.html','terms.html','privacy.html','admin.html','style.css','app.js','icon.png']);
const CANARY_PERCENT = Math.max(0, Math.min(100, Number(process.env.CANARY_PERCENT || 0)));
const GLOBAL_KILL_SWITCH = String(process.env.GLOBAL_KILL_SWITCH || 'false').toLowerCase() === 'true';
const MAX_EVENTS_PER_PROJECT_PER_MINUTE = Number(process.env.MAX_EVENTS_PER_PROJECT_PER_MINUTE || 600);
const MAX_SESSIONS_PER_PROJECT_PER_MINUTE = Number(process.env.MAX_SESSIONS_PER_PROJECT_PER_MINUTE || 120);
const MAX_PROOF_ATTEMPTS_PER_VISITOR = Number(process.env.MAX_PROOF_ATTEMPTS_PER_VISITOR || 8);
const MAX_EVENTS_PER_VISITOR_PER_MINUTE = Number(process.env.MAX_EVENTS_PER_VISITOR_PER_MINUTE || 120);
const SIGNED_EVENTS_STRICT = String(process.env.SIGNED_EVENTS_STRICT || 'true').toLowerCase() === 'true';
const EVENT_WRITE_QUEUE_LIMIT = Number(process.env.EVENT_WRITE_QUEUE_LIMIT || 5000);
const GOOGLE_CLIENT_ID = normalizeConfiguredSecret(process.env.GOOGLE_CLIENT_ID || '');
const GOOGLE_CLIENT_SECRET = normalizeConfiguredSecret(process.env.GOOGLE_CLIENT_SECRET || '');
const GOOGLE_OAUTH_REDIRECT_PATH = '/auth/google/callback';
const OAUTH_STATE_TTL = Number(process.env.OAUTH_STATE_TTL_MS || 10 * 60 * 1000);
const oauthStates = new Map();

const ADMIN_COOKIE = 'avp_admin';
const ADMIN_SESSION_TTL = 12 * 60 * 60 * 1000;
const VISITOR_SESSION_TTL = Number(process.env.VISITOR_SESSION_TTL_MS || 2 * 60 * 60 * 1000);
const MAX_GLOBAL_RECENT_EVENTS = Number(process.env.MAX_GLOBAL_RECENT_EVENTS || 1000);
const MAX_RECENT_PROJECT_EVENTS = Number(process.env.MAX_RECENT_PROJECT_EVENTS || 300);
const ADMIN_LOGIN_LIMIT_WINDOW = 15 * 60 * 1000;
const ADMIN_LOGIN_LIMIT_MAX = 12;
const API_LIMIT_WINDOW = 60 * 1000;
const API_LIMIT_MAX = Number(process.env.API_LIMIT_MAX || 240);
const CONTENT_CHALLENGE_TTL = 45 * 1000;
const HEARTBEAT_TTL = 15 * 1000;
const DEFAULT_RERENDER_INTERVAL = Number(process.env.DEFAULT_RERENDER_INTERVAL_MS || 60 * 1000);
const DEFAULT_HEARTBEAT_INTERVAL = Number(process.env.DEFAULT_HEARTBEAT_INTERVAL_MS || 20 * 1000);
const CLUSTER_MODE = String(process.env.CLUSTER_MODE || 'false').toLowerCase() === 'true';
const ENABLE_REDIS_RUNTIME = String(process.env.ENABLE_REDIS_RUNTIME || (CLUSTER_MODE ? 'true' : 'false')).toLowerCase() === 'true';
const ENABLE_REDIS_EVENT_QUEUE = String(process.env.ENABLE_REDIS_EVENT_QUEUE || (CLUSTER_MODE ? 'true' : 'false')).toLowerCase() === 'true';
const ENABLE_POSTGRES_STORAGE = String(process.env.ENABLE_POSTGRES_STORAGE || (CLUSTER_MODE ? 'true' : 'false')).toLowerCase() === 'true';
const QUEUE_ON_EVENT_WRITE_FAILURE = String(process.env.QUEUE_ON_EVENT_WRITE_FAILURE || 'true').toLowerCase() !== 'false';
const POSTGRES_SYNC_CONFIG_INTERVAL_MS = Number(process.env.POSTGRES_SYNC_CONFIG_INTERVAL_MS || 10_000);
const POSTGRES_SYNC_ANALYTICS_INTERVAL_MS = Number(process.env.POSTGRES_SYNC_ANALYTICS_INTERVAL_MS || 15_000);
const POSTGRES_DASHBOARD_DAYS = Number(process.env.POSTGRES_DASHBOARD_DAYS || 30);
const POSTGRES_DASHBOARD_RECENT_LIMIT = Number(process.env.POSTGRES_DASHBOARD_RECENT_LIMIT || 100);
const PERSIST_EVENT_STATS_IN_JSON = String(process.env.PERSIST_EVENT_STATS_IN_JSON || (CLUSTER_MODE ? 'false' : 'true')).toLowerCase() === 'true';
const KEEP_IN_MEMORY_EVENT_STATS = String(process.env.KEEP_IN_MEMORY_EVENT_STATS || 'true').toLowerCase() !== 'false';
const SDK_CACHE_CONTROL = process.env.SDK_CACHE_CONTROL || (APP_ENV === 'production' ? 'public, max-age=60, s-maxage=300, stale-while-revalidate=60' : 'no-store');
const loginAttempts = new Map();
const apiHits = new Map();

function now() { return Date.now(); }
function iso(ts = now()) { return new Date(ts).toISOString(); }
function randomId(prefix = 'id', bytes = 10) { return `${prefix}_${crypto.randomBytes(bytes).toString('hex')}`; }
function randomKey(prefix = 'pk') { return `${prefix}_${crypto.randomBytes(18).toString('base64url')}`; }
function sha256(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function hmac(value, key) { return crypto.createHmac('sha256', key).update(String(value)).digest('hex'); }
function newRequestId() { return `req_${crypto.randomBytes(8).toString('hex')}`; }
function structuredLog(level, message, fields = {}) {
  const row = { time: iso(), level, message, ...fields };
  try { console[level === 'error' ? 'error' : 'log'](JSON.stringify(row)); } catch { console.log(`[${level}] ${message}`); }
}

function isDefaultOrWeak(value, defaults = []) {
  const text = String(value || '');
  return !text || text.length < 32 || defaults.includes(text) || /change-?me|admin123|demo|localhost/i.test(text);
}
function assertProductionGuard() {
  if (APP_ENV !== 'production' || !STRICT_PRODUCTION_GUARD) return;
  const errors = [];
  if (!process.env.ADMIN_EMAIL || /owner@example\.com/i.test(ADMIN_EMAIL)) errors.push('ADMIN_EMAIL must be a real owner email');
  if (!process.env.ADMIN_PASSWORD || ADMIN_PASSWORD === 'admin123' || ADMIN_PASSWORD.length < 14) errors.push('ADMIN_PASSWORD must be changed and be at least 14 characters');
  if (isDefaultOrWeak(process.env.SESSION_SECRET, ['dev-session-secret'])) errors.push('SESSION_SECRET must be a strong random secret, at least 32 chars');
  if (isDefaultOrWeak(process.env.ENCRYPTION_KEY, ['dev-encryption-key'])) errors.push('ENCRYPTION_KEY must be a strong random secret, at least 32 chars');
  if (/localhost|127\.0\.0\.1/i.test(PUBLIC_BASE_URL)) errors.push('PUBLIC_BASE_URL must be your public HTTPS domain');
  if (USE_HTTPS && (!fs.existsSync(CERT_KEY) || !fs.existsSync(CERT_CRT))) errors.push('HTTPS cert/key missing, or set USE_HTTPS=false behind a reverse proxy');
  if (!process.env.STORAGE_ROOT && (!process.env.DATA_FILE || !process.env.BACKUP_DIR || !process.env.EVENT_LOG_DIR)) errors.push('STORAGE_ROOT or explicit DATA_FILE/BACKUP_DIR/EVENT_LOG_DIR must be configured on persistent storage');
  if (!process.env.BACKUP_DIR) errors.push('BACKUP_DIR must be explicitly configured');
  if (!process.env.EVENT_LOG_DIR) errors.push('EVENT_LOG_DIR must be explicitly configured');
  if (METRICS_REQUIRE_TOKEN_IN_PRODUCTION && !METRICS_TOKEN) errors.push('METRICS_TOKEN must be configured in production');
  if (!METRICS_TOKEN && !METRICS_ALLOW_IPS.length) errors.push('METRICS_TOKEN or METRICS_ALLOW_IPS must be configured');
  if (!REQUIRE_MFA_IN_PRODUCTION) errors.push('REQUIRE_MFA_IN_PRODUCTION must stay true for paid production deployments');
  if (CLUSTER_MODE && !process.env.REDIS_URL) errors.push('CLUSTER_MODE requires REDIS_URL for shared sessions, rate limits and event queue');
  if (CLUSTER_MODE && !(process.env.POSTGRES_URL || process.env.DATABASE_URL)) errors.push('CLUSTER_MODE requires POSTGRES_URL or DATABASE_URL for durable shared storage');
  if (CLUSTER_MODE && !ENABLE_REDIS_RUNTIME) errors.push('CLUSTER_MODE requires ENABLE_REDIS_RUNTIME=true');
  if (CLUSTER_MODE && !ENABLE_REDIS_EVENT_QUEUE) errors.push('CLUSTER_MODE requires ENABLE_REDIS_EVENT_QUEUE=true');
  if (CLUSTER_MODE && !ENABLE_POSTGRES_STORAGE) errors.push('CLUSTER_MODE requires ENABLE_POSTGRES_STORAGE=true');
  if (REQUIRE_MFA_IN_PRODUCTION && !process.env.ALLOW_BOOT_WITHOUT_MFA) errors.push('REQUIRE_MFA_IN_PRODUCTION is enabled; make sure admin MFA is configured or set ALLOW_BOOT_WITHOUT_MFA=1 for first setup');
  if (errors.length) {
    const message = '[production-guard] Refusing to start:\n- ' + errors.join('\n- ');
    console.error(message);
    process.exit(1);
  }
}
assertProductionGuard();

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function safeJsonParse(text, fallback = null) { try { return JSON.parse(text); } catch { return fallback; } }
function compactIp(ip) { return String(ip || '').replace(/^::ffff:/, ''); }
function remoteIp(req) { return compactIp(req.socket.remoteAddress || 'unknown'); }
function isTrustedProxyIp(ip) {
  const clean = compactIp(ip);
  return TRUST_PROXY_IPS.some(rule => rule === clean || (rule === '127.0.0.1' && clean === '::1'));
}
function trustedClientIp(req) {
  const remote = remoteIp(req);
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  if (forwarded && (TRUST_PROXY || isTrustedProxyIp(remote))) return compactIp(forwarded);
  return remote;
}
function dayLogFile(dir, prefix, ts = now()) {
  ensureDir(dir);
  return path.join(dir, `${prefix}-${dayKey(ts)}.ndjson`);
}
function appendNdjsonSync(dir, prefix, entry) {
  ensureDir(dir);
  fs.appendFileSync(dayLogFile(dir, prefix, Date.parse(entry.time || iso())), JSON.stringify(entry) + '\n', 'utf8');
}
function appendAudit(req, action, details = {}, user = null) {
  const entry = {
    schema: 'avp.audit.v1', time: iso(), action: clamp(action, 80),
    userId: user?.id || '', userEmail: user?.email || '', ipHash: sha256(trustedClientIp(req || { socket: {}, headers: {} })).slice(0, 16),
    ua: clamp(req?.headers?.['user-agent'] || '', 160), details: sanitizeDetails(details, 240)
  };
  try { appendNdjsonSync(AUDIT_LOG_DIR, 'admin-audit', entry); } catch (err) { console.error('[audit] append failed:', err.message); }
}
function appendAlert(type, severity = 'warning', details = {}) {
  const entry = { schema: 'avp.alert.v1', time: iso(), type: clamp(type, 80), severity: clamp(severity, 20), details: sanitizeDetails(details, 240) };
  try { appendNdjsonSync(ALERT_LOG_DIR, 'alerts', entry); } catch (err) { console.error('[alert] append failed:', err.message); }
}
function sanitizeDetails(details = {}, max = 180) {
  return Object.fromEntries(Object.entries(details || {}).slice(0, 40).map(([k, v]) => [clamp(k, 50), clamp(typeof v === 'object' ? JSON.stringify(v) : v, max)]));
}

function expectedCanvasProof(nonce) {
  const r = parseInt(String(nonce).slice(0, 2), 16) || 0;
  const g = parseInt(String(nonce).slice(2, 4), 16) || 0;
  const b = parseInt(String(nonce).slice(4, 6), 16) || 0;
  const arr = [];
  for (let i = 0; i < 100; i++) arr.push(r, g, b, 255);
  return sha256(arr.join(',') + nonce);
}
function canonicalPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('payload_must_be_object');
  const out = {};
  for (const key of Object.keys(payload).sort()) {
    const value = payload[key];
    const type = typeof value;
    if (!['string', 'number', 'boolean'].includes(type) || value === null || Number.isNaN(value)) throw new Error('payload_value_not_primitive');
    out[key] = value;
  }
  return JSON.stringify(out);
}
function importPublicKeyFromJwk(jwk) {
  if (!jwk || typeof jwk !== 'object') throw new Error('bad_public_key');
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y) throw new Error('bad_public_key');
  return crypto.createPublicKey({ key: jwk, format: 'jwk' });
}
function verifySignedPayload(publicKeyJwk, payload, signatureBase64) {
  if (!signatureBase64 || typeof signatureBase64 !== 'string') return false;
  const publicKey = importPublicKeyFromJwk(publicKeyJwk);
  const canonical = canonicalPayload(payload);
  const signature = Buffer.from(signatureBase64, 'base64');
  if (signature.length < 64 || signature.length > 80) return false;
  return crypto.verify('sha256', Buffer.from(canonical), { key: publicKey, dsaEncoding: 'ieee-p1363' }, signature);
}
function issueChallengeForSession(sess, kind = 'content') {
  const nonce = crypto.randomBytes(32).toString('hex');
  const slotId = `slot_${crypto.randomBytes(10).toString('hex')}`;
  const baitToken = crypto.randomBytes(16).toString('hex');
  const poolToken = crypto.randomBytes(18).toString('base64url');
  const seq = (sess.nextSeq || 1);
  sess.nextSeq = seq + 1;
  sess.challenges = sess.challenges || {};
  sess.challenges[nonce] = {
    ts: now(), ttl: CONTENT_CHALLENGE_TTL, kind, seq, slotId, baitToken,
    poolTokenHash: sha256(poolToken), expectedProof: expectedCanvasProof(nonce), baitHits: 0, used: false
  };
  return { nonce, slotId, baitToken, poolToken, seq, kind, expiresInMs: CONTENT_CHALLENGE_TTL };
}
function takeChallenge(sess, payload, expectedKind = 'content') {
  if (!sess || !payload || typeof payload !== 'object') return { ok: false, reason: 'missing_session_or_payload' };
  const meta = sess.challenges && sess.challenges[payload.nonce];
  if (!meta || meta.used) return { ok: false, reason: 'challenge_missing_or_reused' };
  meta.used = true;
  delete sess.challenges[payload.nonce];
  if (now() - meta.ts > meta.ttl) return { ok: false, reason: 'challenge_expired' };
  if (payload.kind !== expectedKind || meta.kind !== expectedKind) return { ok: false, reason: 'kind_mismatch' };
  if (payload.seq !== meta.seq) return { ok: false, reason: 'seq_mismatch' };
  if (payload.slotId !== meta.slotId) return { ok: false, reason: 'slot_mismatch' };
  if (typeof payload.poolToken !== 'string' || sha256(payload.poolToken) !== meta.poolTokenHash) return { ok: false, reason: 'pool_token_mismatch' };
  return { ok: true, meta, payload };
}
function esc(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function jsonEsc(value) { return JSON.stringify(value).replace(/</g, '\\u003c'); }
function clamp(value, max = 160) { return String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max); }
function normalizeEmail(value) { return String(value || '').trim().toLowerCase(); }
function maskEmail(value) {
  const email = normalizeEmail(value);
  if (!email || !email.includes('@')) return '';
  const [name, domain] = email.split('@');
  const left = name.length <= 4 ? `${name.slice(0, 1)}***` : `${name.slice(0, 2)}***${name.slice(-2)}`;
  return `${left}@${domain}`;
}
function emailHash(value) { return sha256(normalizeEmail(value)).slice(0, 16); }
function accountEmailCandidates(account) {
  const list = [account?.email, account?.googleEmail, account?.oauthEmail, account?.loginEmail, account?.emailAddress];
  if (Array.isArray(account?.emails)) {
    for (const item of account.emails) list.push(typeof item === 'string' ? item : item?.email || item?.value);
  }
  return [...new Set(list.map(normalizeEmail).filter(Boolean))];
}
function accountMatchesEmail(account, normalizedEmail) {
  return accountEmailCandidates(account).includes(normalizedEmail);
}
function accountDebugInfo(account) {
  const email = normalizeEmail(account?.email || accountEmailCandidates(account)[0] || '');
  return {
    id: account?.id || '',
    emailMasked: maskEmail(email),
    emailHash: email ? emailHash(email) : '',
    provider: account?.provider || 'unknown',
    status: account?.status || '',
    planId: account?.planId || '',
    marketingConsent: Boolean(account?.marketingConsent),
    emailVerified: Boolean(account?.emailVerified),
    createdAt: account?.createdAt || '',
    updatedAt: account?.updatedAt || ''
  };
}
function accountLikeFromAnyObject(obj, source = 'unknown') {
  if (!obj || typeof obj !== 'object') return null;
  const email = normalizeEmail(obj.email || obj.googleEmail || obj.oauthEmail || obj.loginEmail || obj.emailAddress || obj.contactEmail || '');
  if (!email || !emailLooksValid(email)) return null;
  const id = obj.id || obj.accountId || obj.userId || randomId('acct');
  return {
    id: String(id),
    email,
    fullName: clamp(obj.fullName || obj.name || obj.displayName || obj.ownerName || email.split('@')[0], 120),
    phone: clamp(obj.phone || obj.phoneNumber || '', 40),
    companyName: clamp(obj.companyName || obj.company || obj.name || obj.company_name || '', 160),
    password: obj.password && obj.password.hash ? obj.password : passwordRecord(randomKey('imported_oauth_pwd')),
    provider: clamp(obj.provider || obj.authProvider || source, 80),
    role: obj.role === 'client_owner' ? 'client_owner' : 'client_owner',
    status: obj.status || 'trial',
    planId: obj.planId || obj.plan_id || 'beta',
    marketingConsent: Boolean(obj.marketingConsent || obj.marketing_consent),
    marketingConsentAt: obj.marketingConsentAt || obj.marketing_consent_at || '',
    emailVerified: Boolean(obj.emailVerified || obj.verifiedEmail || obj.email_verified),
    trialEndsAt: obj.trialEndsAt || obj.trial_ends_at || new Date(now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: obj.createdAt || obj.created_at || iso(),
    updatedAt: obj.updatedAt || obj.updated_at || iso(),
    importedFrom: source
  };
}
function stateAccountCandidatesFromValue(value, source = 'state', depth = 0, out = []) {
  if (!value || depth > 4 || out.length >= 100) return out;
  if (Array.isArray(value)) {
    for (const item of value) stateAccountCandidatesFromValue(item, source, depth + 1, out);
    return out;
  }
  if (typeof value !== 'object') return out;
  const candidate = accountLikeFromAnyObject(value, source);
  if (candidate && !out.some(a => a.email === candidate.email)) out.push(candidate);
  for (const key of ['accounts', 'clientAccounts', 'clients', 'users', 'customers', 'members', 'authAccounts']) {
    if (Array.isArray(value[key])) stateAccountCandidatesFromValue(value[key], `${source}.${key}`, depth + 1, out);
  }
  return out;
}
function jsonFileAccountCandidates(file, sourceLabel) {
  const parsed = readJsonFile(file, null);
  if (!parsed) return [];
  return stateAccountCandidatesFromValue(parsed, sourceLabel);
}
function upsertJsonAuthMirrorAccount(account, reason = 'mirror') {
  if (!account || !account.email || !emailLooksValid(account.email)) return null;
  const normalized = normalizeEmail(account.email);
  const db = readAuthAccounts();
  const idx = db.accounts.findIndex(a => accountMatchesEmail(a, normalized));
  const payload = Object.assign({}, account, { email: normalized, updatedAt: iso() });
  if (!payload.password || !payload.password.hash) payload.password = passwordRecord(randomKey('oauth_mirror_pwd'));
  if (idx >= 0) {
    db.accounts[idx] = Object.assign({}, db.accounts[idx], payload, {
      id: db.accounts[idx].id || payload.id,
      fullName: db.accounts[idx].fullName || payload.fullName || '',
      companyName: db.accounts[idx].companyName || payload.companyName || '',
      provider: db.accounts[idx].provider && String(db.accounts[idx].provider).includes(payload.provider || 'password') ? db.accounts[idx].provider : `${db.accounts[idx].provider || 'password'}+${payload.provider || 'password'}`
    });
  } else {
    db.accounts.push(payload);
  }
  db.updatedAt = iso();
  writeAuthAccounts(db);
  structuredLog('log', 'auth_json_account_mirrored', { reason, emailMasked: maskEmail(normalized), emailHash: emailHash(normalized), authDbFile: AUTH_DB_FILE, accountCount: db.accounts.length });
  return payload;
}
function asArrayLines(value) { return String(value || '').split(/[\n,]+/).map(s => s.trim()).filter(Boolean); }
function dayKey(ts = now()) { return new Date(ts).toISOString().slice(0, 10); }
function percent(part, total) { return total ? Math.round((part / total) * 1000) / 10 : 0; }

function ensureDataDir() { fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true }); }
function readFileSafe(file, fallback = '') { try { return fs.readFileSync(file, 'utf8'); } catch { return fallback; } }
function readJsonFile(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJsonFile(file, value) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}
function readAuthAccounts() {
  const data = readJsonFile(AUTH_DB_FILE, { version: 1, accounts: [], sessions: [], projectLinks: [], resetTokens: [] });
  data.accounts = Array.isArray(data.accounts) ? data.accounts : [];
  data.sessions = Array.isArray(data.sessions) ? data.sessions : [];
  data.projectLinks = Array.isArray(data.projectLinks) ? data.projectLinks : [];
  data.resetTokens = Array.isArray(data.resetTokens) ? data.resetTokens : [];
  return data;
}
function writeAuthAccounts(data) { writeJsonFile(AUTH_DB_FILE, Object.assign({ version: 1, accounts: [], sessions: [], projectLinks: [], resetTokens: [] }, data || {})); }
function readLeads() {
  const data = readJsonFile(LEADS_FILE, { version: 1, leads: [] });
  data.leads = Array.isArray(data.leads) ? data.leads : [];
  return data;
}
function writeLeads(data) { writeJsonFile(LEADS_FILE, Object.assign({ version: 1 }, data || {})); }
function readEmailOutbox() {
  const data = readJsonFile(EMAIL_OUTBOX_FILE, { version: 1, emails: [] });
  data.emails = Array.isArray(data.emails) ? data.emails : [];
  return data;
}
function writeEmailOutbox(data) { writeJsonFile(EMAIL_OUTBOX_FILE, Object.assign({ version: 1, emails: [] }, data || {})); }
function appendEmailOutbox(email) {
  const outbox = readEmailOutbox();
  outbox.emails.push(email);
  outbox.updatedAt = iso();
  outbox.smtp = smtpPublicStatus();
  writeEmailOutbox(outbox);
  return email;
}
function updateEmailOutboxStatus(id, patch = {}) {
  const outbox = readEmailOutbox();
  const email = outbox.emails.find(e => e.id === id);
  if (email) Object.assign(email, patch, { updatedAt: iso() });
  outbox.updatedAt = iso();
  outbox.smtp = smtpPublicStatus();
  writeEmailOutbox(outbox);
  return email || null;
}
function smtpPublicStatus() {
  return {
    enabled: SMTP_ENABLED,
    configured: Boolean(SMTP_HOST),
    host: SMTP_HOST ? SMTP_HOST.replace(/(.{2}).+(.{2})$/, '$1***$2') : '',
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    from: SMTP_FROM,
    hasUser: Boolean(SMTP_USER),
    hasPassword: Boolean(SMTP_PASS),
    nodemailerLoaded: NODEMAILER_AVAILABLE
  };
}
function appDbPublicStatus() {
  return {
    enabled: APP_DB_ENABLED,
    configured: APP_DB_CONFIGURED,
    connected: appDbReady,
    requiredForClientAuth: AUTH_REQUIRE_DATABASE_FOR_CLIENT_AUTH,
    urlSource: process.env.DATABASE_URL ? 'DATABASE_URL' : (process.env.POSTGRES_URL ? 'POSTGRES_URL' : ''),
    ssl: APP_DB_SSL,
    storage: (APP_DB_ENABLED && APP_DB_CONFIGURED && appDbReady) ? 'postgres' : 'json_fallback',
    reason: !APP_DB_ENABLED ? 'ENABLE_APP_DB/ENABLE_POSTGRES_STORAGE/DATABASE_URL is not enabled' : (!APP_DB_CONFIGURED ? 'DATABASE_URL or POSTGRES_URL is missing' : (!appDbReady ? 'Postgres connection has not been established yet' : 'connected'))
  };
}

const emailService = createEmailService({
  getConfig: () => ({ SMTP_ENABLED, SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_REQUIRE_TLS, SMTP_TIMEOUT_MS, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_REPLY_TO, SMTP_FAIL_BLOCKS_AUTH }),
  appendEmailOutbox,
  updateEmailOutboxStatus,
  structuredLog,
  randomId,
  iso,
  clamp,
  sanitizeDetails,
  maskEmail,
  smtpPublicStatus,
  escapeHtml: esc
});
async function sendAppEmail(to, subject, body, meta = {}) { return emailService.sendAppEmail(to, subject, body, meta); }
function emailLooksValid(email) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizeEmail(email)); }

function hasHtmlLikeInput(value) { return /<|>|javascript:|on\w+\s*=/i.test(String(value || '')); }
function cleanClientText(value, max = 255) { return clamp(value, max); }
function normalizePhone(value) { return String(value || '').replace(/\D+/g, '').slice(0, 20); }
function validateClientRegistrationFields(input) {
  const fullName = cleanClientText(input.fullName || input.name || '', 255);
  const companyName = cleanClientText(input.companyName || input.company || '', 255);
  const email = cleanClientText(input.email || '', 255).toLowerCase();
  const countryCodeRaw = cleanClientText(input.countryCode || '+380', 8);
  const countryCode = /^\+\d{1,4}$/.test(countryCodeRaw) ? countryCodeRaw : '';
  const rawLocalPhone = cleanClientText(input.phone || input.phoneNumber || '', 32).trim();
  const localPhone = rawLocalPhone;
  const phone = countryCode && localPhone ? `${countryCode}${localPhone}` : localPhone;
  const password = String(input.password || '');
  const confirmPassword = String(input.confirmPassword || '');
  const termsAccepted = input.termsAccepted === 'on' || input.termsAccepted === 'true' || input.termsAccepted === true;
  const errors = [];
  if (!fullName) errors.push('Full name is required.');
  else if (fullName.length > 255 || hasHtmlLikeInput(fullName)) errors.push('Enter your full name.');
  if (!companyName) errors.push('Company name is required.');
  else if (companyName.length < 2 || companyName.length > 255 || hasHtmlLikeInput(companyName)) errors.push('Company name must be 2–255 characters.');
  if (!countryCode) errors.push('Choose a valid country code.');
  if (!localPhone) errors.push('Phone number is required.');
  else if (/\D/.test(localPhone)) errors.push('Phone number must contain digits only.');
  else if (!/^\d{4,15}$/.test(localPhone)) errors.push('Phone number must contain 4–15 digits after the country code.');
  if (!email) errors.push('Email is required.');
  else if (email.length < 5 || email.length > 255 || hasHtmlLikeInput(email) || !emailLooksValid(email)) errors.push('Enter a valid email address with @.');
  if (!password) errors.push('Password is required.');
  else if (password.length < 8 || password.length > 20 || !/[A-Za-z]/.test(password) || !/\d/.test(password) || hasHtmlLikeInput(password)) errors.push('Password must be 8–20 characters and include at least one letter and one number.');
  if (password !== confirmPassword) errors.push('Passwords do not match.');
  if (!termsAccepted) errors.push('You must accept the Terms of Use.');
  return { ok: errors.length === 0, errors, fullName, companyName, email, countryCode, localPhone, phone, password, confirmPassword, termsAccepted };
}
function clientValidationMessage(errors) { return Array.isArray(errors) && errors.length ? errors[0] : 'Please check the form fields.'; }
function trialEndsAtFor(entity) {
  const source = entity || {};
  if (source.trialEndsAt) return source.trialEndsAt;
  const start = Date.parse(source.createdAt || iso()) || now();
  return new Date(start + 30 * 24 * 60 * 60 * 1000).toISOString();
}
function trialSnapshot(entity) {
  const endsAt = trialEndsAtFor(entity);
  const remainingMs = Math.max(0, Date.parse(endsAt) - now());
  return { trialEndsAt: endsAt, secondsRemaining: Math.ceil(remainingMs / 1000), daysRemaining: Math.ceil(remainingMs / (24 * 60 * 60 * 1000)), active: remainingMs > 0 };
}

function passwordRecord(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const iterations = 310000;
  const hash = crypto.pbkdf2Sync(String(password || ''), salt, iterations, 32, 'sha256').toString('hex');
  return { algo: 'pbkdf2-sha256', iterations, salt, hash };
}
function safeEqualHex(a, b) {
  try {
    const ba = Buffer.from(String(a || ''), 'hex');
    const bb = Buffer.from(String(b || ''), 'hex');
    return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
  } catch { return false; }
}
function passwordOk(password, rec) {
  if (!rec || !rec.salt || !rec.hash) return false;
  if (rec.algo === 'pbkdf2-sha256') {
    const iterations = Number(rec.iterations || 310000);
    const hash = crypto.pbkdf2Sync(String(password || ''), rec.salt, iterations, 32, 'sha256').toString('hex');
    return safeEqualHex(hash, rec.hash);
  }
  // Legacy v15 hash compatibility. On successful login it is upgraded to PBKDF2.
  return sha256(`${rec.salt}:${password}`) === rec.hash;
}

let appDbPool = null;
let appDbReady = false;
let appDbUnavailableLogged = false;

async function ensureAppDbReady() {
  if (!APP_DB_ENABLED) return false;
  if (!APP_DB_URL) {
    if (!appDbUnavailableLogged) {
      structuredLog('warn', 'app_db_not_configured_json_fallback', {
        appDbEnabled: APP_DB_ENABLED,
        configured: false,
        requiredForClientAuth: AUTH_REQUIRE_DATABASE_FOR_CLIENT_AUTH,
        message: 'DATABASE_URL or POSTGRES_URL is missing. Client accounts cannot be stored in Postgres until it is configured.'
      });
      appDbUnavailableLogged = true;
    }
    return false;
  }
  if (appDbReady && appDbPool) return true;
  try {
    const { Pool } = require('pg');
    appDbPool = appDbPool || new Pool({ connectionString: APP_DB_URL, ssl: APP_DB_SSL ? { rejectUnauthorized: false } : undefined, max: Number(process.env.APP_DB_POOL_MAX || 5) });
    await appDbPool.query('select 1');
    await appDbPool.query(`
      CREATE TABLE IF NOT EXISTS avp_client_accounts (
        id text PRIMARY KEY,
        email text UNIQUE NOT NULL,
        full_name text,
        phone text,
        company_name text,
        password_algo text NOT NULL,
        password_iterations integer,
        password_salt text NOT NULL,
        password_hash text NOT NULL,
        provider text NOT NULL DEFAULT 'password',
        role text NOT NULL DEFAULT 'client_owner',
        status text NOT NULL DEFAULT 'trial',
        plan_id text NOT NULL DEFAULT 'beta',
        marketing_consent boolean NOT NULL DEFAULT false,
        marketing_consent_at timestamptz,
        trial_ends_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS avp_client_sessions (
        sid_hash text PRIMARY KEY,
        account_id text NOT NULL REFERENCES avp_client_accounts(id) ON DELETE CASCADE,
        csrf_token text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_seen_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL
      );
      CREATE TABLE IF NOT EXISTS avp_client_project_links (
        account_id text NOT NULL REFERENCES avp_client_accounts(id) ON DELETE CASCADE,
        project_id text NOT NULL,
        role text NOT NULL DEFAULT 'owner',
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY(account_id, project_id)
      );
      CREATE TABLE IF NOT EXISTS avp_password_reset_tokens (
        token_hash text PRIMARY KEY,
        account_id text NOT NULL REFERENCES avp_client_accounts(id) ON DELETE CASCADE,
        email text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL,
        used_at timestamptz
      );
      CREATE TABLE IF NOT EXISTS avp_marketing_consents (
        id text PRIMARY KEY,
        account_id text REFERENCES avp_client_accounts(id) ON DELETE SET NULL,
        email text NOT NULL,
        consented boolean NOT NULL DEFAULT true,
        source text,
        ip_hash text,
        user_agent text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS avp_leads (
        id text PRIMARY KEY,
        time timestamptz NOT NULL DEFAULT now(),
        project_id text,
        project_key text,
        name text,
        email text NOT NULL,
        company text,
        site_url text,
        message text,
        source text,
        ip_hash text,
        user_agent text
      );
      CREATE TABLE IF NOT EXISTS avp_subscription_cancellations (
        id text PRIMARY KEY,
        account_id text,
        email text NOT NULL,
        full_name text,
        company_name text,
        plan_id text,
        project_ids text[] NOT NULL DEFAULT '{}',
        reason text,
        mail_status text,
        ip_hash text,
        user_agent text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_avp_subscription_cancellations_email ON avp_subscription_cancellations(email);
      CREATE INDEX IF NOT EXISTS idx_avp_subscription_cancellations_created ON avp_subscription_cancellations(created_at DESC);
      ALTER TABLE avp_client_accounts ADD COLUMN IF NOT EXISTS full_name text;
      ALTER TABLE avp_client_accounts ADD COLUMN IF NOT EXISTS phone text;
      ALTER TABLE avp_client_accounts ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;
      ALTER TABLE avp_client_accounts ADD COLUMN IF NOT EXISTS plan_id text NOT NULL DEFAULT 'beta';
      ALTER TABLE avp_client_accounts ADD COLUMN IF NOT EXISTS marketing_consent boolean NOT NULL DEFAULT false;
      ALTER TABLE avp_client_accounts ADD COLUMN IF NOT EXISTS marketing_consent_at timestamptz;
      CREATE INDEX IF NOT EXISTS idx_avp_marketing_consents_email ON avp_marketing_consents(email);
      CREATE INDEX IF NOT EXISTS idx_avp_client_sessions_account ON avp_client_sessions(account_id);
      CREATE INDEX IF NOT EXISTS idx_avp_client_project_links_account ON avp_client_project_links(account_id);
    `);
    appDbReady = true;
    return true;
  } catch (err) {
    if (!appDbUnavailableLogged) {
      structuredLog('error', 'app_db_unavailable_json_fallback', { message: err.message, requiredForClientAuth: AUTH_REQUIRE_DATABASE_FOR_CLIENT_AUTH, configured: APP_DB_CONFIGURED });
      appDbUnavailableLogged = true;
    }
    return false;
  }
}

function accountFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name || '',
    phone: row.phone || '',
    companyName: row.company_name || '',
    password: { algo: row.password_algo, iterations: row.password_iterations, salt: row.password_salt, hash: row.password_hash },
    provider: row.provider || 'password',
    role: row.role || 'client_owner',
    status: row.status || 'trial',
    planId: row.plan_id || 'beta',
    marketingConsent: row.marketing_consent === true,
    marketingConsentAt: row.marketing_consent_at ? new Date(row.marketing_consent_at).toISOString() : '',
    emailVerified: row.email_verified === true,
    trialEndsAt: row.trial_ends_at ? new Date(row.trial_ends_at).toISOString() : '',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : ''
  };
}
async function findClientAccountByEmailDetailed(email) {
  const normalized = normalizeEmail(email);
  const base = {
    requestedEmailMasked: maskEmail(normalized),
    requestedEmailHash: normalized ? emailHash(normalized) : '',
    normalizedEmail: normalized,
    source: 'none',
    account: null,
    authDbFile: AUTH_DB_FILE,
    authDbExists: fs.existsSync(AUTH_DB_FILE),
    dataFile: DATA_FILE,
    dataFileExists: fs.existsSync(DATA_FILE),
    accountCount: 0,
    knownAccounts: [],
    stateCandidateCount: 0,
    stateCandidates: []
  };
  if (!normalized) return base;
  if (await ensureAppDbReady()) {
    const r = await appDbPool.query('SELECT * FROM avp_client_accounts WHERE lower(trim(email))=$1 LIMIT 1', [normalized]);
    base.account = accountFromRow(r.rows[0]);
    base.source = base.account ? 'postgres' : 'postgres_miss';
    if (AUTH_DEBUG_LOGS) {
      const debugRows = await appDbPool.query('SELECT id,email,provider,status,email_verified,created_at,updated_at FROM avp_client_accounts ORDER BY created_at DESC LIMIT 20');
      base.accountCount = debugRows.rowCount || 0;
      base.knownAccounts = debugRows.rows.map(row => accountDebugInfo(accountFromRow(row)));
    }
    return base;
  }
  if (AUTH_REQUIRE_DATABASE_FOR_CLIENT_AUTH) {
    base.source = APP_DB_CONFIGURED ? 'postgres_required_not_connected' : 'postgres_required_missing_database_url';
    base.accountCount = 0;
    base.knownAccounts = [];
    return base;
  }

  const db = readAuthAccounts();
  base.accountCount = db.accounts.length;
  base.knownAccounts = db.accounts.slice(-20).map(accountDebugInfo);
  base.account = db.accounts.find(a => accountMatchesEmail(a, normalized)) || null;
  if (base.account) {
    base.source = 'json_auth_db';
    return base;
  }

  // Fallback for older/local builds: some OAuth/customer records may have been written
  // into the main SaaS state file instead of storage/auth-accounts.json.
  const stateCandidates = jsonFileAccountCandidates(DATA_FILE, 'saas-state');
  base.stateCandidateCount = stateCandidates.length;
  base.stateCandidates = stateCandidates.slice(-20).map(accountDebugInfo);
  const stateMatch = stateCandidates.find(a => accountMatchesEmail(a, normalized)) || null;
  if (stateMatch) {
    const mirrored = upsertJsonAuthMirrorAccount(stateMatch, 'reset_lookup_from_saas_state');
    base.account = mirrored || stateMatch;
    base.source = 'saas_state_mirrored_to_json_auth_db';
    base.authDbExists = fs.existsSync(AUTH_DB_FILE);
    const freshDb = readAuthAccounts();
    base.accountCount = freshDb.accounts.length;
    base.knownAccounts = freshDb.accounts.slice(-20).map(accountDebugInfo);
    return base;
  }

  base.source = 'json_auth_db_and_saas_state_miss';
  return base;
}
async function findClientAccountByEmail(email) {
  const result = await findClientAccountByEmailDetailed(email);
  return result.account || null;
}
async function authDebugSnapshot(req = null) {
  let currentClient = null;
  if (req) {
    const sid = parseCookies(req.headers.cookie || '')[CLIENT_COOKIE];
    const sess = await loadClientSession(sid);
    const account = sess ? await findClientAccountById(sess.accountId) : null;
    currentClient = account ? accountDebugInfo(account) : null;
  }
  const stateCandidates = jsonFileAccountCandidates(DATA_FILE, 'saas-state');
  if (await ensureAppDbReady()) {
    const r = await appDbPool.query('SELECT id,email,provider,status,email_verified,created_at,updated_at FROM avp_client_accounts ORDER BY created_at DESC LIMIT 50');
    return {
      storage: 'postgres',
      appDbEnabled: APP_DB_ENABLED,
      appDbConnected: appDbReady,
      appDbConfigured: APP_DB_CONFIGURED,
      authRequireDatabaseForClientAuth: AUTH_REQUIRE_DATABASE_FOR_CLIENT_AUTH,
      appDbStatus: appDbPublicStatus(),
      authDbFile: AUTH_DB_FILE,
      dataFile: DATA_FILE,
      dataFileExists: fs.existsSync(DATA_FILE),
      accountCount: r.rowCount || 0,
      currentClient,
      accounts: r.rows.map(row => accountDebugInfo(accountFromRow(row))),
      stateCandidateCount: stateCandidates.length,
      stateCandidates: stateCandidates.map(accountDebugInfo)
    };
  }
  const db = readAuthAccounts();
  return {
    storage: 'json_auth_db',
    appDbEnabled: APP_DB_ENABLED,
    appDbConnected: appDbReady,
    appDbConfigured: APP_DB_CONFIGURED,
    authRequireDatabaseForClientAuth: AUTH_REQUIRE_DATABASE_FOR_CLIENT_AUTH,
    appDbStatus: appDbPublicStatus(),
    authDbFile: AUTH_DB_FILE,
    authDbExists: fs.existsSync(AUTH_DB_FILE),
    dataFile: DATA_FILE,
    dataFileExists: fs.existsSync(DATA_FILE),
    accountCount: db.accounts.length,
    sessionCount: db.sessions.length,
    resetTokenCount: (db.resetTokens || []).length,
    currentClient,
    accounts: db.accounts.map(accountDebugInfo),
    stateCandidateCount: stateCandidates.length,
    stateCandidates: stateCandidates.map(accountDebugInfo)
  };
}
async function findClientAccountById(id) {
  if (await ensureAppDbReady()) {
    const r = await appDbPool.query('SELECT * FROM avp_client_accounts WHERE id=$1', [id]);
    return accountFromRow(r.rows[0]);
  }
  if (AUTH_REQUIRE_DATABASE_FOR_CLIENT_AUTH) return null;
  const db = readAuthAccounts();
  return db.accounts.find(a => a.id === id) || null;
}
async function createClientAccount(account) {
  account.email = normalizeEmail(account.email);
  const existing = await findClientAccountByEmail(account.email);
  if (existing) return existing;
  if (await ensureAppDbReady()) {
    await appDbPool.query(`INSERT INTO avp_client_accounts(id,email,full_name,phone,company_name,password_algo,password_iterations,password_salt,password_hash,provider,role,status,plan_id,marketing_consent,marketing_consent_at,email_verified,trial_ends_at,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      ON CONFLICT (email) DO UPDATE SET
        full_name=COALESCE(NULLIF(EXCLUDED.full_name,''), avp_client_accounts.full_name),
        phone=COALESCE(NULLIF(EXCLUDED.phone,''), avp_client_accounts.phone),
        company_name=COALESCE(NULLIF(EXCLUDED.company_name,''), avp_client_accounts.company_name),
        plan_id=COALESCE(NULLIF(EXCLUDED.plan_id,''), avp_client_accounts.plan_id),
        marketing_consent=avp_client_accounts.marketing_consent OR EXCLUDED.marketing_consent,
        marketing_consent_at=COALESCE(avp_client_accounts.marketing_consent_at, EXCLUDED.marketing_consent_at),
        provider=CASE
          WHEN avp_client_accounts.provider = EXCLUDED.provider THEN avp_client_accounts.provider
          WHEN avp_client_accounts.provider LIKE '%' || EXCLUDED.provider || '%' THEN avp_client_accounts.provider
          ELSE avp_client_accounts.provider || '+' || EXCLUDED.provider
        END,
        email_verified=avp_client_accounts.email_verified OR EXCLUDED.email_verified,
        updated_at=now()`, [account.id, account.email, account.fullName || '', account.phone || '', account.companyName || '', account.password.algo, account.password.iterations || null, account.password.salt, account.password.hash, account.provider || 'password', account.role || 'client_owner', account.status || 'trial', account.planId || 'beta', account.marketingConsent === true, account.marketingConsent ? new Date(account.marketingConsentAt || account.createdAt || iso()) : null, account.emailVerified === true, account.trialEndsAt || null, account.createdAt, account.updatedAt]);
    const saved = await findClientAccountByEmail(account.email);
    structuredLog('log', 'client_account_saved_postgres', { emailMasked: maskEmail(account.email), emailHash: emailHash(account.email), accountId: saved?.id || account.id, provider: saved?.provider || account.provider || 'password', appDb: appDbPublicStatus() });
    return saved;
  }
  if (AUTH_REQUIRE_DATABASE_FOR_CLIENT_AUTH) throw new Error(APP_DB_CONFIGURED ? 'app_db_required_but_not_connected' : 'app_db_required_missing_database_url');
  const db = readAuthAccounts();
  const idx = db.accounts.findIndex(a => normalizeEmail(a.email) === account.email);
  if (idx >= 0) {
    db.accounts[idx] = Object.assign({}, db.accounts[idx], {
      email: account.email,
      fullName: db.accounts[idx].fullName || account.fullName || '',
      companyName: db.accounts[idx].companyName || account.companyName || '',
      provider: db.accounts[idx].provider && String(db.accounts[idx].provider).includes(account.provider || 'password') ? db.accounts[idx].provider : `${db.accounts[idx].provider || 'password'}+${account.provider || 'password'}`,
      emailVerified: Boolean(db.accounts[idx].emailVerified || account.emailVerified),
      updatedAt: iso()
    });
    db.updatedAt = iso(); writeAuthAccounts(db);
    structuredLog('log', 'client_account_updated_json_auth_db', { emailMasked: maskEmail(account.email), emailHash: emailHash(account.email), accountId: db.accounts[idx].id, provider: db.accounts[idx].provider || 'password', authDbFile: AUTH_DB_FILE, accountCount: db.accounts.length });
    return db.accounts[idx];
  }
  db.accounts.push(account); db.updatedAt = iso(); writeAuthAccounts(db);
  structuredLog('log', 'client_account_saved_json_auth_db', { emailMasked: maskEmail(account.email), emailHash: emailHash(account.email), accountId: account.id, provider: account.provider || 'password', authDbFile: AUTH_DB_FILE, accountCount: db.accounts.length });
  return account;
}
async function saveClientSessionRecord(rawSid, session) {
  const sidHash = sha256(rawSid);
  if (await ensureAppDbReady()) {
    await appDbPool.query(`INSERT INTO avp_client_sessions(sid_hash,account_id,csrf_token,created_at,last_seen_at,expires_at)
      VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT(sid_hash) DO UPDATE SET last_seen_at=EXCLUDED.last_seen_at, expires_at=EXCLUDED.expires_at`, [sidHash, session.accountId, session.csrfToken, new Date(session.createdAt), new Date(session.lastSeen), new Date(session.expiresAt)]);
    return;
  }
  if (AUTH_REQUIRE_DATABASE_FOR_CLIENT_AUTH) throw new Error(APP_DB_CONFIGURED ? 'app_db_required_but_not_connected' : 'app_db_required_missing_database_url');
  const db = readAuthAccounts();
  db.sessions = db.sessions.filter(s => s.sidHash !== sidHash);
  db.sessions.push(Object.assign({}, session, { sidHash })); db.updatedAt = iso(); writeAuthAccounts(db);
}
async function loadClientSession(rawSid) {
  const sidHash = sha256(rawSid || '');
  if (!rawSid) return null;
  if (await ensureAppDbReady()) {
    const r = await appDbPool.query('SELECT * FROM avp_client_sessions WHERE sid_hash=$1', [sidHash]);
    const row = r.rows[0];
    if (!row) return null;
    return { sidHash, accountId: row.account_id, csrfToken: row.csrf_token, createdAt: Date.parse(row.created_at), lastSeen: Date.parse(row.last_seen_at), expiresAt: Date.parse(row.expires_at) };
  }
  if (AUTH_REQUIRE_DATABASE_FOR_CLIENT_AUTH) return null;
  const db = readAuthAccounts();
  return db.sessions.find(s => s.sidHash === sidHash) || null;
}
async function touchClientSession(rawSid, session) {
  session.lastSeen = now();
  if (await ensureAppDbReady()) {
    await appDbPool.query('UPDATE avp_client_sessions SET last_seen_at=now() WHERE sid_hash=$1', [sha256(rawSid)]);
  } else {
    const db = readAuthAccounts();
    const idx = db.sessions.findIndex(s => s.sidHash === sha256(rawSid));
    if (idx >= 0) db.sessions[idx] = session;
    db.updatedAt = iso(); writeAuthAccounts(db);
  }
}
async function deleteClientSession(rawSid) {
  const sidHash = sha256(rawSid || '');
  if (await ensureAppDbReady()) await appDbPool.query('DELETE FROM avp_client_sessions WHERE sid_hash=$1', [sidHash]);
  else if (!AUTH_REQUIRE_DATABASE_FOR_CLIENT_AUTH) { const db = readAuthAccounts(); db.sessions = db.sessions.filter(s => s.sidHash !== sidHash); db.updatedAt = iso(); writeAuthAccounts(db); }
}
async function linkProjectToClient(accountId, projectId) {
  if (await ensureAppDbReady()) {
    await appDbPool.query('INSERT INTO avp_client_project_links(account_id,project_id,role) VALUES($1,$2,$3) ON CONFLICT(account_id,project_id) DO NOTHING', [accountId, projectId, 'owner']);
    return;
  }
  if (AUTH_REQUIRE_DATABASE_FOR_CLIENT_AUTH) throw new Error(APP_DB_CONFIGURED ? 'app_db_required_but_not_connected' : 'app_db_required_missing_database_url');
  const db = readAuthAccounts();
  if (!db.projectLinks.some(x => x.accountId === accountId && x.projectId === projectId)) db.projectLinks.push({ accountId, projectId, role: 'owner', createdAt: iso() });
  db.updatedAt = iso(); writeAuthAccounts(db);
}
async function clientProjectIds(accountId) {
  if (await ensureAppDbReady()) {
    const r = await appDbPool.query('SELECT project_id FROM avp_client_project_links WHERE account_id=$1', [accountId]);
    return r.rows.map(x => x.project_id);
  }
  if (AUTH_REQUIRE_DATABASE_FOR_CLIENT_AUTH) return [];
  const db = readAuthAccounts();
  return db.projectLinks.filter(x => x.accountId === accountId).map(x => x.projectId);
}
async function persistLeadToAppDb(lead) {
  if (!(await ensureAppDbReady())) return false;
  await appDbPool.query(`INSERT INTO avp_leads(id,time,project_id,project_key,name,email,company,site_url,message,source,ip_hash,user_agent)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [lead.id, new Date(lead.time), lead.projectId, lead.projectKey, lead.name, lead.email, lead.company, lead.siteUrl, lead.message, lead.source, lead.ipHash, lead.ua]);
  return true;
}

async function persistMarketingConsentToAppDb(account, req, source = 'signup') {
  if (!account || !account.marketingConsent) return false;
  if (!(await ensureAppDbReady())) return false;
  await appDbPool.query(`INSERT INTO avp_marketing_consents(id,account_id,email,consented,source,ip_hash,user_agent,created_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (id) DO NOTHING`, [randomId('mkt'), account.id, normalizeEmail(account.email), true, source, req ? clientFingerprint(req) : '', req ? clamp(req.headers['user-agent'] || '', 150) : '', new Date(account.marketingConsentAt || iso())]);
  return true;
}

async function cancelClientSubscriptionAndDeleteData(account, req, reason = 'client_cancel_subscription') {
  const normalizedEmail = normalizeEmail(account?.email || '');
  const result = { accountId: account?.id || '', email: normalizedEmail, projectIds: [], deletedProjects: 0, storage: 'none' };
  if (!account || !account.id || !normalizedEmail) return result;

  if (await ensureAppDbReady()) {
    const projectIds = await clientProjectIds(account.id);
    result.projectIds = projectIds;
    result.deletedProjects = projectIds.length;
    result.storage = 'postgres';
    await appDbPool.query('BEGIN');
    try {
      await appDbPool.query(`INSERT INTO avp_subscription_cancellations(id,account_id,email,full_name,company_name,plan_id,project_ids,reason,mail_status,ip_hash,user_agent,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())`, [
        randomId('sub_cancel'), account.id, normalizedEmail, account.fullName || '', account.companyName || '', account.planId || 'beta', projectIds, reason,
        'pending_email', req ? clientFingerprint(req) : '', req ? clamp(req.headers['user-agent'] || '', 180) : ''
      ]);
      if (projectIds.length) {
        await appDbPool.query('DELETE FROM avp_events WHERE project_id = ANY($1::text[])', [projectIds]);
        await appDbPool.query('DELETE FROM avp_daily_stats WHERE project_id = ANY($1::text[])', [projectIds]);
        await appDbPool.query('DELETE FROM avp_usage_counters WHERE project_id = ANY($1::text[])', [projectIds]);
        await appDbPool.query('DELETE FROM avp_project_secrets WHERE project_id = ANY($1::text[])', [projectIds]);
        await appDbPool.query('DELETE FROM avp_projects WHERE id = ANY($1::text[])', [projectIds]);
      }
      await appDbPool.query('DELETE FROM avp_client_project_links WHERE account_id=$1', [account.id]);
      await appDbPool.query('DELETE FROM avp_client_sessions WHERE account_id=$1', [account.id]);
      await appDbPool.query('DELETE FROM avp_password_reset_tokens WHERE account_id=$1', [account.id]);
      await appDbPool.query(`UPDATE avp_marketing_consents
        SET consented=false, source=COALESCE(source,'') || ';cancel_subscription', account_id=NULL
        WHERE account_id=$1 OR lower(trim(email))=$2`, [account.id, normalizedEmail]);
      await appDbPool.query('DELETE FROM avp_client_accounts WHERE id=$1', [account.id]);
      await appDbPool.query('COMMIT');
    } catch (err) {
      await appDbPool.query('ROLLBACK');
      throw err;
    }
  } else {
    if (AUTH_REQUIRE_DATABASE_FOR_CLIENT_AUTH) throw new Error(APP_DB_CONFIGURED ? 'app_db_required_but_not_connected' : 'app_db_required_missing_database_url');
    const db = readAuthAccounts();
    const projectIds = db.projectLinks.filter(x => x.accountId === account.id).map(x => x.projectId);
    result.projectIds = projectIds;
    result.deletedProjects = projectIds.length;
    result.storage = 'json_auth_db';
    db.accounts = db.accounts.filter(a => a.id !== account.id);
    db.sessions = db.sessions.filter(s => s.accountId !== account.id);
    db.projectLinks = db.projectLinks.filter(x => x.accountId !== account.id);
    db.resetTokens = (db.resetTokens || []).filter(t => t.accountId !== account.id);
    db.subscriptionCancellations = db.subscriptionCancellations || [];
    db.subscriptionCancellations.push({ id: randomId('sub_cancel'), accountId: account.id, email: normalizedEmail, fullName: account.fullName || '', companyName: account.companyName || '', planId: account.planId || 'beta', projectIds, reason, createdAt: iso(), ipHash: req ? clientFingerprint(req) : '' });
    db.updatedAt = iso();
    writeAuthAccounts(db);
    state.projects = state.projects.filter(p => !projectIds.includes(p.id));
    for (const id of projectIds) delete state.projectStats[id];
  }

  state.projects = state.projects.filter(p => !result.projectIds.includes(p.id));
  for (const id of result.projectIds) delete state.projectStats[id];
  state.globalEvents = (state.globalEvents || []).filter(e => !result.projectIds.includes(e.projectId));
  scheduleSave();
  structuredLog('warn', 'client_subscription_cancelled_data_deleted', {
    accountId: account.id,
    emailMasked: maskEmail(normalizedEmail),
    emailHash: emailHash(normalizedEmail),
    projectCount: result.deletedProjects,
    storage: result.storage
  });
  return result;
}

async function markSubscriptionCancellationEmail(account, status) {
  if (!account || !(await ensureAppDbReady())) return;
  await appDbPool.query(`UPDATE avp_subscription_cancellations
    SET mail_status=$1
    WHERE ctid IN (
      SELECT ctid FROM avp_subscription_cancellations
      WHERE email=$2
      ORDER BY created_at DESC
      LIMIT 1
    )`, [clamp(status || 'unknown', 80), normalizeEmail(account.email)]).catch(() => {});
}
async function savePasswordResetToken(account, rawToken) {
  const tokenHash = sha256(rawToken);
  const rec = { tokenHash, accountId: account.id, email: account.email, createdAt: iso(), expiresAt: new Date(now() + 60 * 60 * 1000).toISOString(), usedAt: '' };
  if (await ensureAppDbReady()) {
    await appDbPool.query('INSERT INTO avp_password_reset_tokens(token_hash,account_id,email,created_at,expires_at,used_at) VALUES($1,$2,$3,$4,$5,$6)', [rec.tokenHash, rec.accountId, rec.email, new Date(rec.createdAt), new Date(rec.expiresAt), null]);
    return rec;
  }
  if (AUTH_REQUIRE_DATABASE_FOR_CLIENT_AUTH) throw new Error(APP_DB_CONFIGURED ? 'app_db_required_but_not_connected' : 'app_db_required_missing_database_url');
  const db = readAuthAccounts();
  db.resetTokens = (db.resetTokens || []).filter(t => Date.parse(t.expiresAt || 0) > now() && !t.usedAt);
  db.resetTokens.push(rec); db.updatedAt = iso(); writeAuthAccounts(db);
  return rec;
}
async function loadPasswordResetToken(rawToken) {
  const tokenHash = sha256(rawToken || '');
  if (!rawToken) return null;
  if (await ensureAppDbReady()) {
    const r = await appDbPool.query('SELECT * FROM avp_password_reset_tokens WHERE token_hash=$1', [tokenHash]);
    const row = r.rows[0];
    if (!row) return null;
    return { tokenHash, accountId: row.account_id, email: row.email, createdAt: row.created_at ? new Date(row.created_at).toISOString() : '', expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : '', usedAt: row.used_at ? new Date(row.used_at).toISOString() : '' };
  }
  if (AUTH_REQUIRE_DATABASE_FOR_CLIENT_AUTH) return null;
  const db = readAuthAccounts();
  return (db.resetTokens || []).find(t => t.tokenHash === tokenHash) || null;
}
async function consumePasswordResetToken(rawToken) {
  const tokenHash = sha256(rawToken || '');
  if (await ensureAppDbReady()) await appDbPool.query('UPDATE avp_password_reset_tokens SET used_at=now() WHERE token_hash=$1', [tokenHash]);
  else if (!AUTH_REQUIRE_DATABASE_FOR_CLIENT_AUTH) { const db = readAuthAccounts(); const t = (db.resetTokens || []).find(x => x.tokenHash === tokenHash); if (t) t.usedAt = iso(); db.updatedAt = iso(); writeAuthAccounts(db); }
}
async function updateClientPassword(accountId, password) {
  const rec = passwordRecord(password);
  if (await ensureAppDbReady()) {
    await appDbPool.query('UPDATE avp_client_accounts SET password_algo=$1,password_iterations=$2,password_salt=$3,password_hash=$4,updated_at=now() WHERE id=$5', [rec.algo, rec.iterations || null, rec.salt, rec.hash, accountId]);
    return;
  }
  if (AUTH_REQUIRE_DATABASE_FOR_CLIENT_AUTH) throw new Error(APP_DB_CONFIGURED ? 'app_db_required_but_not_connected' : 'app_db_required_missing_database_url');
  const db = readAuthAccounts();
  const account = db.accounts.find(a => a.id === accountId);
  if (account) { account.password = rec; account.updatedAt = iso(); }
  db.updatedAt = iso(); writeAuthAccounts(db);
}
function resetTokenIsValid(rec) { return Boolean(rec && !rec.usedAt && Date.parse(rec.expiresAt || '') > now()); }
function validateNewPasswordFields(input) {
  const password = String(input.password || '');
  const confirmPassword = String(input.confirmPassword || '');
  const errors = [];
  if (!password) errors.push('New password is required.');
  else if (password.length < 8 || password.length > 20 || !/[A-Za-z]/.test(password) || !/\d/.test(password) || hasHtmlLikeInput(password)) errors.push('Password must be 8–20 characters and include at least one letter and one number.');
  if (password !== confirmPassword) errors.push('Passwords do not match.');
  return { ok: errors.length === 0, errors, password, confirmPassword };
}

function base32Encode(buf) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0, output = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { output += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}
function base32Decode(str) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0; const out = [];
  for (const ch of String(str || '').toUpperCase().replace(/=|\s/g, '')) {
    const idx = alphabet.indexOf(ch); if (idx < 0) continue;
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
function hotp(secret, counter) {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', key).update(buf).digest();
  const o = h[h.length - 1] & 15;
  const code = ((h[o] & 127) << 24) | ((h[o + 1] & 255) << 16) | ((h[o + 2] & 255) << 8) | (h[o + 3] & 255);
  return String(code % 1000000).padStart(6, '0');
}
function verifyTotp(secret, code, windowSteps = 1) {
  const c = String(code || '').replace(/\s/g, ''); if (!/^\d{6}$/.test(c)) return false;
  const counter = Math.floor(now() / 30000);
  for (let i = -windowSteps; i <= windowSteps; i++) if (hotp(secret, counter + i) === c) return true;
  return false;
}
function newTotpSecret() { return base32Encode(crypto.randomBytes(20)); }
function otpAuthUrl(user, secret) { return `otpauth://totp/AVP:${encodeURIComponent(user.email)}?secret=${secret}&issuer=AVP&algorithm=SHA1&digits=6&period=30`; }
function roleCan(user, action) {
  const role = user?.role || 'owner';
  if (role === 'owner') return true;
  if (role === 'admin') return !['manage_owner'].includes(action);
  if (role === 'analyst') return ['read','export'].includes(action);
  if (role === 'support') return ['read'].includes(action);
  return false;
}

function encryptionKeyBuffer() {
  return crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest();
}
function encryptSecret(plain) {
  const value = String(plain || '');
  if (!value || value.startsWith('enc:v1:')) return value;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKeyBuffer(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}
function decryptSecret(value) {
  const text = String(value || '');
  if (!text.startsWith('enc:v1:')) return text;
  const [, , iv64, tag64, data64] = text.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKeyBuffer(), Buffer.from(iv64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag64, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data64, 'base64url')), decipher.final()]).toString('utf8');
}
function secretRecord(secret, kind = 'server_verify', label = 'Primary server verify key') {
  return { id: randomId('sec'), kind, label: clamp(label, 80), secretKeyEnc: encryptSecret(secret), createdAt: iso(), lastUsedAt: '', revokedAt: '' };
}
function normalizeProjectSecrets(project) {
  project.secrets = Array.isArray(project.secrets) ? project.secrets : [];
  if (!project.secrets.length) {
    const legacySecret = project.secretKeyEnc || project.secretKey;
    if (legacySecret) {
      project.secrets.push({ id: randomId('sec'), kind: 'server_verify', label: 'Migrated server verify key', secretKeyEnc: String(legacySecret).startsWith('enc:v1:') ? legacySecret : encryptSecret(legacySecret), createdAt: project.createdAt || iso(), lastUsedAt: '', revokedAt: '' });
    }
  }
  if (!project.secrets.some(s => s.kind === 'events_ingest' && !s.revokedAt)) project.secrets.push(secretRecord(randomKey('avp_evt'), 'events_ingest', 'Events ingest key'));
  if (!project.secrets.some(s => s.kind === 'analytics_readonly' && !s.revokedAt)) project.secrets.push(secretRecord(randomKey('avp_ro'), 'analytics_readonly', 'Readonly analytics key'));
  const active = project.secrets.find(s => s.kind === 'server_verify' && !isSecretRevoked(s));
  if (active) project.secretKeyEnc = active.secretKeyEnc;
  delete project.secretKey;
}
function isSecretRevoked(rec) {
  if (!rec) return true;
  if (!rec.revokedAt) return false;
  const ts = Date.parse(rec.revokedAt);
  return !Number.isFinite(ts) || ts <= now();
}
function setProjectSecret(project, secret) {
  project.secrets = [secretRecord(secret, 'server_verify', 'Primary server verify key')];
  project.secretKeyEnc = project.secrets[0].secretKeyEnc;
  delete project.secretKey;
}
function projectSecret(project) {
  normalizeProjectSecrets(project || {});
  const rec = (project.secrets || []).find(s => s.kind === 'server_verify' && !isSecretRevoked(s));
  return decryptSecret(rec?.secretKeyEnc || project?.secretKeyEnc || '');
}
function projectSecretPreview(project) {
  const secret = projectSecret(project);
  if (!secret) return '';
  return `${secret.slice(0, 12)}…${secret.slice(-8)}`;
}
function verifyProjectCredential(project, secret, kind = 'server_verify') {
  const value = String(secret || '');
  if (!project || !value) return false;
  normalizeProjectSecrets(project);
  for (const rec of project.secrets || []) {
    if (rec.kind !== kind || isSecretRevoked(rec)) continue;
    const plain = decryptSecret(rec.secretKeyEnc || '');
    if (plain === value) { rec.lastUsedAt = iso(); return true; }
  }
  return false;
}
function projectBySecret(secretKey, kind = 'server_verify') { return state.projects.find(p => verifyProjectCredential(p, secretKey, kind)); }
function rotateProjectSecret(project, graceDays = 7) {
  normalizeProjectSecrets(project);
  const until = new Date(now() + Math.max(0, Number(graceDays || 0)) * 24 * 60 * 60 * 1000).toISOString();
  for (const rec of project.secrets || []) if (rec.kind === 'server_verify' && !rec.revokedAt) rec.revokedAt = until;
  const newSecret = randomKey('avp_sec');
  const rec = secretRecord(newSecret, 'server_verify', 'Rotated server verify key');
  project.secrets.unshift(rec);
  project.secretKeyEnc = rec.secretKeyEnc;
  project.updatedAt = iso();
  return { newSecret, graceUntil: until };
}
function createProjectApiKey(project, kind = 'events_ingest', label = '') {
  normalizeProjectSecrets(project);
  const key = randomKey(kind === 'analytics_readonly' ? 'avp_ro' : kind === 'server_verify' ? 'avp_sec' : 'avp_evt');
  const rec = secretRecord(key, kind, label || `${kind} key`);
  project.secrets.unshift(rec);
  project.updatedAt = iso();
  return { key, record: rec };
}


const PLAN_LIMITS = {
  // Free month while the product is getting validated. Practical cap: enough for real beta testing,
  // but not enough for a very large publisher to burn infrastructure as 10+ commercial projects.
  beta: { label: 'Beta', monthlyEvents: 3000000, dailyVisits: 100000, monthlyServerVerifications: 600000, eventsPerMinute: 900, sessionsPerMinute: 180, eventsPerVisitorPerMinute: 120, maxDomains: 2, maxProjects: 1 },
  // Normal monthly subscription. Projects are limited, but usage is still the main resource cap.
  classic: { label: 'Classic', monthlyEvents: 30000000, dailyVisits: 1000000, monthlyServerVerifications: 6000000, eventsPerMinute: 3000, sessionsPerMinute: 900, eventsPerVisitorPerMinute: 180, maxDomains: 8, maxProjects: 3 },
  enterprise: { label: 'Enterprise', monthlyEvents: 250000000, dailyVisits: 10000000, monthlyServerVerifications: 50000000, eventsPerMinute: 12000, sessionsPerMinute: 4000, eventsPerVisitorPerMinute: 240, maxDomains: 50, maxProjects: 25 },
  // Legacy aliases kept so older rows do not break.
  pilot: { label: 'Beta', monthlyEvents: 3000000, dailyVisits: 100000, monthlyServerVerifications: 600000, eventsPerMinute: 900, sessionsPerMinute: 180, eventsPerVisitorPerMinute: 120, maxDomains: 2, maxProjects: 1 },
  growth: { label: 'Enterprise', monthlyEvents: 250000000, dailyVisits: 10000000, monthlyServerVerifications: 50000000, eventsPerMinute: 12000, sessionsPerMinute: 4000, eventsPerVisitorPerMinute: 240, maxDomains: 50, maxProjects: 25 }
};
function planFor(project) { return PLAN_LIMITS[project?.planId || 'beta'] || PLAN_LIMITS.beta; }
function planLabel(planId) { return (PLAN_LIMITS[planId || 'beta'] || PLAN_LIMITS.beta).label || String(planId || 'beta'); }
function currentMonthKey(ts = now()) { return new Date(ts).toISOString().slice(0, 7); }
function monthlyStatCount(st, field, month = currentMonthKey()) {
  let total = 0;
  for (const [day, row] of Object.entries(st?.daily || {})) if (String(day).startsWith(month)) total += Number(row?.[field] || 0);
  return total;
}
function projectQuota(project) { return Object.assign({}, planFor(project), project?.quota || {}); }
function checkMonthlyQuota(project, metric) {
  const st = statsFor(project.id);
  const quota = projectQuota(project);
  if (metric === 'events') return monthlyStatCount(st, 'events') < Number(quota.monthlyEvents || Infinity);
  if (metric === 'serverVerifications') return monthlyStatCount(st, 'serverVerifications') < Number(quota.monthlyServerVerifications || Infinity);
  return true;
}
function sanitizeDomain(domain) { return String(domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^\*\./, ''); }
function uniqueDomainList(domains = []) {
  const out = [];
  const seen = new Set();
  for (const item of domains || []) {
    const d = sanitizeDomain(item);
    if (!d || seen.has(d)) continue;
    seen.add(d);
    out.push(d);
  }
  return out;
}
function projectDomainsFromInput(domain) {
  const d = sanitizeDomain(domain);
  if (!d) return [];
  if (d === 'localhost' || d === '127.0.0.1') return [d];
  const pair = d.startsWith('www.') ? [d.slice(4), d] : [d, `www.${d}`];
  return uniqueDomainList(pair);
}
function formatProjectDomains(domains = []) {
  const list = uniqueDomainList(domains);
  if (!list.length) return 'domain not set';
  return list.join(', ');
}
function defaultDomainVerification(domains = []) {
  const verified = domains.filter(d => ['localhost','127.0.0.1'].includes(d));
  return { requiredInProduction: true, tokens: {}, verifiedDomains: verified, lastCheckedAt: '', lastError: '' };
}
function pathList(value) { return String(value || '').split(/\n|,+/).map(s => s.trim()).filter(Boolean); }
function pathMatchesRule(pathname, rule) {
  const p = String(pathname || '/'); const r = String(rule || '').trim();
  if (!r) return false;
  if (r.endsWith('*')) return p.startsWith(r.slice(0, -1));
  return p === r || p.startsWith(r + '/');
}

function defaultProjectStats() {
  return {
    visits: 0,
    uniqueVisitors: 0,
    adFragmentsDelivered: 0,
    contentUnlocked: 0,
    overlayShown: 0,
    adRestores: 0,
    connectionIssues: 0,
    clientErrors: 0,
    serverVerifications: 0,
    successfulServerVerifications: 0,
    webCryptoProofOk: 0,
    webCryptoProofFailed: 0,
    canvasProofOk: 0,
    heartbeatLost: 0,
    scheduledRerenders: 0,
    events: 0,
    abuseEvents: 0,
    droppedEvents: 0,
    reasons: {},
    domains: {},
    browsers: {},
    daily: {},
    recentEvents: []
  };
}

function defaultState() {
  const pass = passwordRecord(ADMIN_PASSWORD);
  const companyId = randomId('cmp');
  const projectId = randomId('prj');
  const publicKey = randomKey('avp_pub');
  const secretKey = randomKey('avp_sec');
  return {
    version: CURRENT_VERSION,
    createdAt: iso(),
    updatedAt: iso(),
    users: [{ id: randomId('usr'), email: ADMIN_EMAIL, password: pass, role: 'owner', createdAt: iso() }],
    adminSessions: {},
    companies: [{ id: companyId, name: 'Demo Publisher', contactEmail: 'publisher@example.com', notes: 'Demo client for beta SaaS checks.', createdAt: iso() }],
    projects: [{
      id: projectId,
      companyId,
      name: 'Protected Content Demo',
      publicKey,
      secretKeyEnc: encryptSecret(secretKey),
      allowedDomains: ['localhost', '127.0.0.1'],
      mode: 'soft-gate',
      protectedSelector: '#protected-content',
      adContainerSelector: '#ad-slot',
      marketBenchmarkPercent: 33,
      loaderEnabled: true,
      enabled: true,
      killSwitch: false,
      sdkVersion: DEFAULT_SDK_VERSION,
      sdkChannel: DEFAULT_SDK_CHANNEL,
      canaryPercent: CANARY_PERCENT,
      fallbackPolicy: 'balanced',
      planId: 'pilot',
      trialEndsAt: new Date(now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      quota: { monthlyEvents: PLAN_LIMITS.beta.monthlyEvents, monthlyServerVerifications: PLAN_LIMITS.beta.monthlyServerVerifications, maxDomains: PLAN_LIMITS.beta.maxDomains },
      pathRules: { allow: [], deny: [] },
      overlayCopy: { blockTitle: 'Ad visibility could not be verified', blockMessage: 'The ad area is blocked, hidden, removed, or unavailable. Please allow the ad area and refresh the page to continue.', softTitle: 'Connection issue detected', softMessage: 'Some page resources did not load. Please refresh the page after the connection is restored.' },
      domainVerification: defaultDomainVerification(['localhost', '127.0.0.1']),
      limits: { eventsPerMinute: MAX_EVENTS_PER_PROJECT_PER_MINUTE, sessionsPerMinute: MAX_SESSIONS_PER_PROJECT_PER_MINUTE, proofAttemptsPerVisitor: MAX_PROOF_ATTEMPTS_PER_VISITOR, eventsPerVisitorPerMinute: MAX_EVENTS_PER_VISITOR_PER_MINUTE },
      autoCreateAdContainer: true,
      strictness: 'balanced',
      ui: { color: 'violet', gradient: 'violet' }, hardening: { webCryptoProof: true, canvasProof: true, signedEvents: true, signedEventsStrict: true, eventBatching: true, domNoise: true, domNoiseMin: 500, domNoiseMax: 700, heartbeat: true, heartbeatIntervalMs: DEFAULT_HEARTBEAT_INTERVAL, scheduledRerender: true, rerenderIntervalMs: DEFAULT_RERENDER_INTERVAL, maxRestores: 4, hardLockOnBlock: true, dynamicSdkUrl: true, polymorphicWrapper: true, encryptedSecrets: true },
      createdAt: iso(),
      updatedAt: iso()
    }],
    visitorSessions: {},
    projectStats: { [projectId]: defaultProjectStats() },
    settings: { killSwitch: GLOBAL_KILL_SWITCH, docsPrivate: DOCS_PRIVATE, sdkDefaultVersion: DEFAULT_SDK_VERSION, sdkChannel: DEFAULT_SDK_CHANNEL, canaryPercent: CANARY_PERCENT, createdAt: iso(), updatedAt: iso() },
    globalEvents: []
  };
}

function normalizeState(input) {
  const base = defaultState();
  const state = input && typeof input === 'object' ? input : base;
  state.version = CURRENT_VERSION;
  state.users = Array.isArray(state.users) && state.users.length ? state.users : base.users;
  state.adminSessions = state.adminSessions || {};
  state.companies = Array.isArray(state.companies) ? state.companies : [];
  state.projects = Array.isArray(state.projects) ? state.projects : [];
  state.visitorSessions = state.visitorSessions || {};
  state.settings = Object.assign({ killSwitch: GLOBAL_KILL_SWITCH, docsPrivate: DOCS_PRIVATE, sdkDefaultVersion: DEFAULT_SDK_VERSION, sdkChannel: DEFAULT_SDK_CHANNEL, canaryPercent: CANARY_PERCENT, createdAt: iso(), updatedAt: iso() }, state.settings || {});
  state.projectStats = state.projectStats || {};
  state.globalEvents = Array.isArray(state.globalEvents) ? state.globalEvents.slice(-MAX_GLOBAL_RECENT_EVENTS) : [];
  for (const u of state.users) { if (!u.role) u.role = 'owner'; if (!u.mfa) u.mfa = { enabled: false, secret: '', backupCodes: [] }; }
  for (const project of state.projects) {
    project.enabled = project.enabled !== false;
    project.killSwitch = Boolean(project.killSwitch);
    project.sdkVersion = project.sdkVersion || DEFAULT_SDK_VERSION;
    project.sdkChannel = project.sdkChannel || DEFAULT_SDK_CHANNEL;
    project.canaryPercent = Number.isFinite(Number(project.canaryPercent)) ? Number(project.canaryPercent) : CANARY_PERCENT;
    project.fallbackPolicy = project.fallbackPolicy || 'balanced';
    project.planId = PLAN_LIMITS[project.planId] ? project.planId : 'beta';
    project.quota = Object.assign({ monthlyEvents: planFor(project).monthlyEvents, monthlyServerVerifications: planFor(project).monthlyServerVerifications, maxDomains: planFor(project).maxDomains }, project.quota || {});
    project.pathRules = Object.assign({ allow: [], deny: [] }, project.pathRules || {});
    project.pathRules.allow = Array.isArray(project.pathRules.allow) ? project.pathRules.allow : pathList(project.pathRules.allow);
    project.pathRules.deny = Array.isArray(project.pathRules.deny) ? project.pathRules.deny : pathList(project.pathRules.deny);
    project.overlayCopy = Object.assign({ blockTitle: 'Ad visibility could not be verified', blockMessage: 'The ad area is blocked, hidden, removed, or unavailable. Please allow the ad area and refresh the page to continue.', softTitle: 'Connection issue detected', softMessage: 'Some page resources did not load. Please refresh the page after the connection is restored.' }, project.overlayCopy || {});
    project.trialEndsAt = project.trialEndsAt || trialEndsAtFor(project);
    project.allowedDomains = uniqueDomainList(project.allowedDomains || []);
    project.domainVerification = Object.assign(defaultDomainVerification(project.allowedDomains || []), project.domainVerification || {});
    project.domainVerification.tokens = project.domainVerification.tokens || {};
    project.domainVerification.verifiedDomains = Array.isArray(project.domainVerification.verifiedDomains) ? project.domainVerification.verifiedDomains : [];
    project.limits = Object.assign({ eventsPerMinute: planFor(project).eventsPerMinute || MAX_EVENTS_PER_PROJECT_PER_MINUTE, sessionsPerMinute: planFor(project).sessionsPerMinute || MAX_SESSIONS_PER_PROJECT_PER_MINUTE, proofAttemptsPerVisitor: MAX_PROOF_ATTEMPTS_PER_VISITOR, eventsPerVisitorPerMinute: MAX_EVENTS_PER_VISITOR_PER_MINUTE }, project.limits || {});
    normalizeProjectSecrets(project);
    project.hardening = Object.assign({ webCryptoProof: true, canvasProof: true, domNoise: true, domNoiseMin: 500, domNoiseMax: 700, heartbeat: true, heartbeatIntervalMs: DEFAULT_HEARTBEAT_INTERVAL, scheduledRerender: true, rerenderIntervalMs: DEFAULT_RERENDER_INTERVAL, maxRestores: 4, hardLockOnBlock: true, dynamicSdkUrl: true, polymorphicWrapper: true, encryptedSecrets: true, adaptivePerformance: true, pauseWhenHidden: true, mobileDomNoiseMax: 160, signedEvents: true, signedEventsStrict: true, eventBatching: true }, project.hardening || {});
    if (!state.projectStats[project.id]) state.projectStats[project.id] = defaultProjectStats();
    state.projectStats[project.id] = Object.assign(defaultProjectStats(), state.projectStats[project.id]);
    state.projectStats[project.id].reasons = state.projectStats[project.id].reasons || {};
    state.projectStats[project.id].domains = state.projectStats[project.id].domains || {};
    state.projectStats[project.id].browsers = state.projectStats[project.id].browsers || {};
    state.projectStats[project.id].daily = state.projectStats[project.id].daily || {};
    state.projectStats[project.id].recentEvents = Array.isArray(state.projectStats[project.id].recentEvents) ? state.projectStats[project.id].recentEvents.slice(-MAX_RECENT_PROJECT_EVENTS) : [];
  }
  return state;
}

function migrateEncryptedSecrets(state) {
  let changed = false;
  for (const project of state.projects || []) {
    if (project.secretKey && !project.secretKeyEnc) {
      setProjectSecret(project, project.secretKey);
      changed = true;
    }
  }
  return changed;
}


function safeReasonSegment(reason) {
  return clamp(reason || 'manual', 40).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'manual';
}

function atomicWriteFile(file, content) {
  ensureDataDir();
  const dir = path.dirname(file);
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  let fd = null;
  try {
    fd = fs.openSync(tmp, 'w');
    fs.writeFileSync(fd, content, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmp, file);
    try {
      const dirFd = fs.openSync(dir, 'r');
      try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
    } catch {}
  } catch (err) {
    if (fd !== null) { try { fs.closeSync(fd); } catch {} }
    try { fs.unlinkSync(tmp); } catch {}
    throw err;
  }
}

function atomicWriteJson(file, data) {
  atomicWriteFile(file, JSON.stringify(data, null, 2));
}

function validateStateShape(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('state_is_not_object');
  if (!Array.isArray(value.users)) throw new Error('state_users_missing');
  if (!Array.isArray(value.companies)) throw new Error('state_companies_missing');
  if (!Array.isArray(value.projects)) throw new Error('state_projects_missing');
  if (!value.projectStats || typeof value.projectStats !== 'object' || Array.isArray(value.projectStats)) throw new Error('state_projectStats_missing');
  if (value.globalEvents && !Array.isArray(value.globalEvents)) throw new Error('state_globalEvents_not_array');
  if (value.globalEvents && value.globalEvents.length > MAX_GLOBAL_RECENT_EVENTS * 2) throw new Error('state_globalEvents_too_large');
  for (const u of value.users) {
    if (!u || typeof u !== 'object') throw new Error('state_user_invalid');
    if (!u.email || !u.password) throw new Error('state_user_missing_email_or_password');
    if (u.role && !['owner','admin','analyst','support','client_readonly'].includes(u.role)) throw new Error('state_user_role_invalid');
  }
  for (const p of value.projects) {
    if (!p || typeof p !== 'object') throw new Error('state_project_invalid');
    if (!p.id || !p.publicKey) throw new Error('state_project_missing_id_or_public_key');
    if (p.mode && !['observe-only','soft-gate','server-gate'].includes(p.mode)) throw new Error('state_project_mode_invalid');
    if (p.allowedDomains && (!Array.isArray(p.allowedDomains) || p.allowedDomains.length > 250)) throw new Error('state_allowedDomains_invalid');
    if (p.domainVerification && !Array.isArray(p.domainVerification.verifiedDomains || [])) throw new Error('state_domainVerification_invalid');
  }
  return true;
}

function verifyStateFile(file) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  validateStateShape(parsed);
  return { ok: true, users: parsed.users.length, companies: parsed.companies.length, projects: parsed.projects.length, events: Array.isArray(parsed.globalEvents) ? parsed.globalEvents.length : 0 };
}

function eventLogFileForDay(day = dayKey()) {
  fs.mkdirSync(EVENT_LOG_DIR, { recursive: true });
  return path.join(EVENT_LOG_DIR, `events-${day}.ndjson`);
}

const eventWriteQueue = [];
let eventWriteFlushing = false;
function writeDeadLetterEvent(reason, event, err = null) {
  try {
    ensureDir(DEAD_LETTER_DIR);
    fs.appendFileSync(path.join(DEAD_LETTER_DIR, `events-${reason}-${dayKey()}.ndjson`), JSON.stringify({ schema: 'avp.event.dead_letter.v1', time: iso(), reason, error: err ? err.message : '', event }) + '\n', 'utf8');
  } catch {}
}
function appendEventLog(event) {
  if (scalableRuntime && scalableRuntime.isRedisQueueEnabled()) {
    scalableRuntime.publishEvent(event).catch(err => {
      appendAlert('redis_event_publish_failed', 'critical', { message: err.message, projectId: event.projectId || '', type: event.type || '' });
      if (QUEUE_ON_EVENT_WRITE_FAILURE) writeDeadLetterEvent('redis-publish-failed', event, err);
    });
    return true;
  }
  if (scalableRuntime && scalableRuntime.isPostgresDirectEventWriteEnabled()) {
    scalableRuntime.publishEvent(event).catch(err => {
      appendAlert('postgres_direct_event_write_failed', 'critical', { message: err.message, projectId: event.projectId || '', type: event.type || '' });
      if (QUEUE_ON_EVENT_WRITE_FAILURE) writeDeadLetterEvent('postgres-direct-failed', event, err);
    });
    return true;
  }
  if (eventWriteQueue.length >= EVENT_WRITE_QUEUE_LIMIT) {
    writeDeadLetterEvent('queue-overflow', event);
    appendAlert('event_queue_overflow', 'critical', { projectId: event.projectId || '', type: event.type || '' });
    return false;
  }
  eventWriteQueue.push(event);
  flushEventLogQueue();
  return true;
}

function flushEventLogQueue() {
  if (eventWriteFlushing) return;
  eventWriteFlushing = true;
  setImmediate(() => {
    try {
      while (eventWriteQueue.length) {
        const event = eventWriteQueue.shift();
        const line = JSON.stringify({ schema: 'avp.event.v1', ...event }) + '\n';
        fs.appendFileSync(eventLogFileForDay(String(event.time || iso()).slice(0, 10)), line, 'utf8');
      }
    } catch (err) {
      console.error('[event-log] flush failed:', err.message);
      appendAlert('event_log_flush_failed', 'critical', { message: err.message, queued: eventWriteQueue.length });
      try {
        ensureDir(DEAD_LETTER_DIR);
        const file = path.join(DEAD_LETTER_DIR, `events-failed-${dayKey()}.ndjson`);
        while (eventWriteQueue.length) fs.appendFileSync(file, JSON.stringify(eventWriteQueue.shift()) + '\n', 'utf8');
      } catch {}
    } finally {
      eventWriteFlushing = false;
      if (eventWriteQueue.length) flushEventLogQueue();
    }
  });
}

function rotateEventLogs() {
  fs.mkdirSync(EVENT_LOG_DIR, { recursive: true });
  const retentionCutoff = now() - EVENT_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const gzipCutoff = now() - OLD_EVENT_LOG_GZIP_AFTER_DAYS * 24 * 60 * 60 * 1000;
  for (const file of fs.readdirSync(EVENT_LOG_DIR)) {
    const m = /^events-(\d{4}-\d{2}-\d{2})\.ndjson(\.gz)?$/.exec(file);
    if (!m) continue;
    const ts = Date.parse(`${m[1]}T00:00:00.000Z`);
    const full = path.join(EVENT_LOG_DIR, file);
    if (Number.isFinite(ts) && ts < retentionCutoff) { try { fs.unlinkSync(full); } catch {} continue; }
    if (!file.endsWith('.gz') && Number.isFinite(ts) && ts < gzipCutoff) {
      try { const gz = zlib.gzipSync(fs.readFileSync(full)); fs.writeFileSync(full + '.gz', gz); fs.unlinkSync(full); appendAlert('event_log_compressed', 'info', { file }); } catch (err) { appendAlert('event_log_compress_failed', 'warning', { file, message: err.message }); }
    }
  }
}

function assertEncryptionReady() {
  if (APP_ENV === 'production' && (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length < 32)) {
    console.warn('[security] Production mode should set ENCRYPTION_KEY with at least 32 random characters. Current run uses derived development key.');
  }
  if (APP_ENV === 'production' && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
    console.warn('[security] Production mode should set SESSION_SECRET with at least 32 random characters. Current run uses derived development key.');
  }
}

function persistentStateSnapshot() {
  const copy = JSON.parse(JSON.stringify(state));
  copy.adminSessions = {};
  copy.visitorSessions = {};
  if (!PERSIST_EVENT_STATS_IN_JSON) {
    copy.projectStats = {};
    copy.globalEvents = [];
    copy.analyticsNote = 'Cluster mode: event counters and recent events are intentionally not persisted to JSON. Redis Streams and PostgreSQL are the source of truth for event analytics.';
  }
  copy.runtimeNote = scalableRuntime && scalableRuntime.isRedisRuntimeEnabled()
    ? 'Cluster mode: visitor sessions are stored in Redis. Admin sessions stay local runtime-only.'
    : 'Admin and visitor sessions are stored in runtime-sessions.json and intentionally excluded from persistent config backup.';
  return copy;
}
function loadRuntimeSessions() {
  try {
    if (!fs.existsSync(RUNTIME_FILE)) return { adminSessions: {}, visitorSessions: {}, loadedAt: iso() };
    const parsed = JSON.parse(fs.readFileSync(RUNTIME_FILE, 'utf8'));
    return { adminSessions: parsed.adminSessions || {}, visitorSessions: parsed.visitorSessions || {}, loadedAt: iso() };
  } catch (err) {
    appendAlert('runtime_sessions_load_failed', 'warning', { message: err.message });
    return { adminSessions: {}, visitorSessions: {}, loadedAt: iso() };
  }
}
let runtimeSaveTimer = null;
function saveRuntimeNow() {
  ensureDir(path.dirname(RUNTIME_FILE));
  atomicWriteJson(RUNTIME_FILE, {
    schema: 'avp.runtime.v1',
    version: CURRENT_VERSION,
    updatedAt: iso(),
    adminSessions: state.adminSessions || {},
    visitorSessions: scalableRuntime && scalableRuntime.isRedisRuntimeEnabled() ? {} : (state.visitorSessions || {}),
    runtimeNote: scalableRuntime && scalableRuntime.isRedisRuntimeEnabled() ? 'Visitor sessions are stored in Redis in cluster mode.' : 'Visitor sessions are stored locally only outside cluster mode.'
  });
}
function scheduleRuntimeSave() {
  if (runtimeSaveTimer) return;
  runtimeSaveTimer = setTimeout(() => {
    runtimeSaveTimer = null;
    try { saveRuntimeNow(); } catch (err) { console.error('[runtime] save failed:', err.message); appendAlert('runtime_sessions_save_failed', 'critical', { message: err.message }); }
  }, 200);
}
function latestValidBackup() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return '';
    const files = fs.readdirSync(BACKUP_DIR).filter(f => /^saas-state-.*\.json$/.test(f)).map(f => path.join(BACKUP_DIR, f)).sort((a,b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    for (const file of files) { try { verifyStateFile(file); return file; } catch {} }
  } catch {}
  return '';
}
function loadState() {
  ensureDataDir();
  fs.mkdirSync(EVENT_LOG_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    const fresh = normalizeState(defaultState());
    atomicWriteJson(DATA_FILE, fresh);
    return fresh;
  }
  try {
    const loaded = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    validateStateShape(loaded);
    return normalizeState(loaded);
  } catch (err) {
    ensureDir(CORRUPTED_DIR);
    const bad = path.join(CORRUPTED_DIR, `saas-state-${Date.now()}.broken.json`);
    try { fs.renameSync(DATA_FILE, bad); } catch {}
    console.error(`[state] bad state moved to ${bad}:`, err.message);
    appendAlert('state_corruption_detected', 'critical', { badFile: bad, message: err.message });
    const backup = latestValidBackup();
    if (backup) {
      console.error(`[state] restoring from latest valid backup: ${backup}`);
      fs.copyFileSync(backup, DATA_FILE);
      return normalizeState(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
    }
    if (APP_ENV === 'production') throw new Error(`Production state is corrupted and no valid backup was found. Broken file: ${bad}`);
    const fresh = normalizeState(defaultState());
    atomicWriteJson(DATA_FILE, fresh);
    return fresh;
  }
}

let state = loadState();
const runtimeSessions = loadRuntimeSessions();
state.adminSessions = runtimeSessions.adminSessions || {};
state.visitorSessions = runtimeSessions.visitorSessions || {};

const scalableRuntime = createScalableRuntime({ visitorSessionTtlMs: VISITOR_SESSION_TTL, state, logger: console });
const scalableRuntimeReady = scalableRuntime.connect().catch(err => {
  structuredLog('error', 'scalable_runtime_connect_failed', { error: err.message });
  if (CLUSTER_MODE) {
    console.error('[cluster] CLUSTER_MODE requires working Redis and PostgreSQL. Refusing to continue.');
    process.exit(1);
  }
});

async function ensureScalableRuntimeReady() {
  try { await scalableRuntimeReady; } catch {}
}
async function loadVisitorSession(token) {
  if (!token) return null;
  if (scalableRuntime.isRedisRuntimeEnabled()) {
    const remote = await scalableRuntime.getVisitorSession(token);
    if (remote) return remote;
  }
  return state.visitorSessions[token] || null;
}
async function storeVisitorSession(token, sess) {
  if (!token || !sess) return;
  if (scalableRuntime.isRedisRuntimeEnabled()) {
    await scalableRuntime.setVisitorSession(token, sess);
    return;
  }
  state.visitorSessions[token] = sess;
  scheduleRuntimeSave();
}
async function removeVisitorSession(token) {
  if (!token) return;
  if (scalableRuntime.isRedisRuntimeEnabled()) {
    await scalableRuntime.deleteVisitorSession(token);
    return;
  }
  delete state.visitorSessions[token];
  scheduleRuntimeSave();
}
async function sharedProjectRateLimit(project, bucket, limit, windowMs = 60 * 1000) {
  if (!project || !scalableRuntime.isRedisRuntimeEnabled()) return { ok: true, localOnly: true };
  return scalableRuntime.sharedRateLimit(`project:${project.id}:${bucket}`, limit, windowMs);
}
async function sharedVisitorRateLimit(project, visitorToken, bucket, limit, windowMs = 60 * 1000) {
  if (!project || !visitorToken || !scalableRuntime.isRedisRuntimeEnabled()) return { ok: true, localOnly: true };
  const v = sha256(visitorToken).slice(0, 24);
  return scalableRuntime.sharedRateLimit(`project:${project.id}:visitor:${v}:${bucket}`, limit, windowMs);
}
async function persistProjectConfigToPostgres(project) {
  if (!project) return;
  try {
    await ensureScalableRuntimeReady();
    if (!scalableRuntime.isPostgresEnabled()) {
      structuredLog('warn', 'postgres_project_config_persist_skipped', { projectId: project.id, reason: 'postgres_not_enabled_or_not_connected', runtime: scalableRuntime.health ? await scalableRuntime.health() : {} });
      return;
    }
    const company = state.companies.find(c => c.id === project.companyId);
    if (company) await scalableRuntime.pg.upsertCompany(company);
    await scalableRuntime.pg.upsertProject(project);
    structuredLog('log', 'postgres_project_config_persisted', { projectId: project.id, publicKey: project.publicKey, companyId: project.companyId });
  } catch (err) {
    structuredLog('error', 'postgres_project_config_persist_failed', { projectId: project.id, error: err.message });
    appendAlert('postgres_project_config_persist_failed', 'critical', { projectId: project.id, message: err.message });
  }
}
async function syncProjectConfigFromPostgres() {
  if (!scalableRuntime.isPostgresEnabled() || !scalableRuntime.pg.listProjects) return;
  try {
    const [companies, projects] = await Promise.all([scalableRuntime.pg.listCompanies(), scalableRuntime.pg.listProjects()]);
    if (Array.isArray(companies) && companies.length) state.companies = companies;
    if (Array.isArray(projects) && projects.length) {
      for (const project of projects) {
        const idx = state.projects.findIndex(p => p.id === project.id || p.publicKey === project.publicKey);
        if (idx >= 0) state.projects[idx] = Object.assign({}, state.projects[idx], project);
        else state.projects.push(project);
        if (!state.projectStats[project.id]) state.projectStats[project.id] = defaultProjectStats();
      }
      state = normalizeState(state);
    }
  } catch (err) {
    structuredLog('error', 'postgres_project_config_sync_failed', { error: err.message });
  }
}

function countFromRow(row, key) { return Number(row && row[key] || 0); }
function mapPostgresEventRow(row = {}) {
  return {
    time: row.time ? new Date(row.time).toISOString() : iso(),
    projectId: row.project_id || row.projectId || '',
    projectName: row.project_name || row.projectName || '',
    type: row.type || '',
    reason: row.reason || '',
    visitor: row.visitor_hash || row.visitor || '',
    origin: row.origin || '',
    page: row.page || '',
    domain: row.domain || '',
    ipHash: row.ip_hash || row.ipHash || '',
    ua: row.user_agent || row.ua || '',
    browser: row.browser || '',
    details: row.details || {}
  };
}
async function syncAnalyticsFromPostgres() {
  if (!scalableRuntime.isPostgresEnabled() || !scalableRuntime.pg.getDashboardStats) return;
  try {
    const snap = await scalableRuntime.pg.getDashboardStats({ days: POSTGRES_DASHBOARD_DAYS, recentLimit: POSTGRES_DASHBOARD_RECENT_LIMIT });
    for (const row of snap.summary || []) {
      const id = row.project_id;
      if (!id) continue;
      const st = Object.assign(defaultProjectStats(), state.projectStats[id] || {});
      st.events = countFromRow(row, 'events');
      st.visits = countFromRow(row, 'visits');
      st.uniqueVisitors = countFromRow(row, 'unique_visitors');
      st.adFragmentsDelivered = countFromRow(row, 'ad_fragments_delivered');
      st.contentUnlocked = countFromRow(row, 'content_unlocked');
      st.overlayShown = countFromRow(row, 'overlay_shown');
      st.adRestores = countFromRow(row, 'ad_restores');
      st.connectionIssues = countFromRow(row, 'connection_issues');
      st.clientErrors = countFromRow(row, 'client_errors');
      st.serverVerifications = countFromRow(row, 'server_verifications');
      st.successfulServerVerifications = countFromRow(row, 'successful_server_verifications');
      st.webCryptoProofOk = countFromRow(row, 'proof_ok');
      st.canvasProofOk = countFromRow(row, 'proof_ok');
      st.webCryptoProofFailed = countFromRow(row, 'proof_failed');
      st.heartbeatLost = countFromRow(row, 'heartbeat_lost');
      st.scheduledRerenders = countFromRow(row, 'scheduled_rerenders');
      st.abuseEvents = countFromRow(row, 'abuse_events');
      st.reasons = {};
      st.domains = {};
      st.browsers = {};
      st.daily = {};
      state.projectStats[id] = st;
    }
    for (const row of snap.reasons || []) if (state.projectStats[row.project_id]) state.projectStats[row.project_id].reasons[row.reason || 'none'] = Number(row.count || 0);
    for (const row of snap.domains || []) if (state.projectStats[row.project_id]) state.projectStats[row.project_id].domains[row.domain || 'unknown'] = Number(row.count || 0);
    for (const row of snap.browsers || []) if (state.projectStats[row.project_id]) state.projectStats[row.project_id].browsers[row.browser || 'other'] = Number(row.count || 0);
    for (const row of snap.daily || []) {
      const id = row.project_id;
      if (!state.projectStats[id]) continue;
      const day = row.day ? new Date(row.day).toISOString().slice(0, 10) : '';
      if (!day) continue;
      state.projectStats[id].daily[day] = {
        events: Number(row.events || 0),
        visits: Number(row.visits || 0),
        uniqueVisitors: Number(row.unique_visitors || 0),
        contentUnlocked: Number(row.content_unlocked || 0),
        overlayShown: Number(row.overlay_shown || 0),
        adRestores: Number(row.ad_restores || 0),
        connectionIssues: Number(row.connection_issues || 0),
        clientErrors: Number(row.client_errors || 0),
        proofFailed: Number(row.proof_failed || 0),
        serverVerifications: Number(row.server_verifications || 0),
        successfulServerVerifications: Number(row.successful_server_verifications || 0),
        abuseEvents: Number(row.abuse_events || 0),
        droppedEvents: Number(row.dropped_events || 0)
      };
    }
    const recent = (snap.recent || []).map(mapPostgresEventRow);
    state.globalEvents = recent.slice(0, MAX_GLOBAL_RECENT_EVENTS).reverse();
    for (const project of state.projects) state.projectStats[project.id].recentEvents = [];
    for (const event of state.globalEvents) {
      const st = statsFor(event.projectId);
      st.recentEvents.push(event);
      if (st.recentEvents.length > MAX_RECENT_PROJECT_EVENTS) st.recentEvents = st.recentEvents.slice(-MAX_RECENT_PROJECT_EVENTS);
    }
  } catch (err) {
    structuredLog('error', 'postgres_analytics_sync_failed', { error: err.message });
  }
}
if (CLUSTER_MODE || String(process.env.POSTGRES_SYNC_CONFIG || '').toLowerCase() === 'true') {
  scalableRuntimeReady.then(() => syncProjectConfigFromPostgres()).catch(() => {});
  setInterval(() => { syncProjectConfigFromPostgres().catch(() => {}); }, POSTGRES_SYNC_CONFIG_INTERVAL_MS).unref();
}

if (CLUSTER_MODE || String(process.env.POSTGRES_SYNC_ANALYTICS || '').toLowerCase() === 'true') {
  scalableRuntimeReady.then(() => syncAnalyticsFromPostgres()).catch(() => {});
  setInterval(() => { syncAnalyticsFromPostgres().catch(() => {}); }, POSTGRES_SYNC_ANALYTICS_INTERVAL_MS).unref();
}

assertEncryptionReady();
if (migrateEncryptedSecrets(state) || state.version !== CURRENT_VERSION) {
  try { saveNow(); } catch {}
}
let saveTimer = null;
function saveNow() {
  ensureDataDir();
  state.updatedAt = iso();
  state.version = CURRENT_VERSION;
  state.globalEvents = Array.isArray(state.globalEvents) ? state.globalEvents.slice(-MAX_GLOBAL_RECENT_EVENTS) : [];
  for (const st of Object.values(state.projectStats || {})) {
    if (st && Array.isArray(st.recentEvents)) st.recentEvents = st.recentEvents.slice(-MAX_RECENT_PROJECT_EVENTS);
  }
  atomicWriteJson(DATA_FILE, persistentStateSnapshot());
  scheduleRuntimeSave();
}
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { saveNow(); } catch (err) { console.error('[state] save failed:', err.message); }
  }, 200);
}
function backupNow(reason = 'manual') {
  ensureDataDir();
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) saveNow();
  verifyStateFile(DATA_FILE);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(BACKUP_DIR, `saas-state-${stamp}-${safeReasonSegment(reason)}.json`);
  fs.copyFileSync(DATA_FILE, file);
  verifyStateFile(file);
  const backups = fs.readdirSync(BACKUP_DIR)
    .filter(f => /^saas-state-.*\.json$/.test(f))
    .map(f => ({ f, t: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const old of backups.slice(BACKUP_RETENTION)) {
    try { fs.unlinkSync(path.join(BACKUP_DIR, old.f)); } catch {}
  }
  if (EXTERNAL_BACKUP_DIR) {
    try { ensureDir(EXTERNAL_BACKUP_DIR); fs.copyFileSync(file, path.join(EXTERNAL_BACKUP_DIR, path.basename(file))); appendAlert('external_backup_copied', 'info', { file: path.basename(file) }); } catch (err) { appendAlert('external_backup_copy_failed', 'critical', { message: err.message }); }
  }
  if (EXTERNAL_BACKUP_COMMAND) {
    try { childProcess.execFileSync(EXTERNAL_BACKUP_COMMAND, [file], { stdio: 'ignore', timeout: 120000 }); appendAlert('external_backup_command_ok', 'info', { file: path.basename(file) }); } catch (err) { appendAlert('external_backup_command_failed', 'critical', { message: err.message }); }
  }
  return file;
}
function runRestoreDrill(reason = 'scheduled') {
  const backup = latestValidBackup() || backupNow('restore-drill-source');
  const result = verifyStateFile(backup);
  appendAlert('restore_drill_ok', 'info', { reason, backup: path.basename(backup), projects: result.projects, users: result.users });
  return result;
}
setInterval(() => {
  try { backupNow('auto'); rotateEventLogs(); } catch (err) { console.error('[backup] failed:', err.message); appendAlert('backup_failed', 'critical', { message: err.message }); }
}, BACKUP_INTERVAL_MS).unref();
setInterval(() => {
  try { runRestoreDrill('scheduled'); } catch (err) { appendAlert('restore_drill_failed', 'critical', { message: err.message }); }
}, RESTORE_DRILL_INTERVAL_MS).unref();
try { rotateEventLogs(); } catch (err) { console.error('[event-log] rotation failed:', err.message); }

function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const s = part.trim();
    if (!s) continue;
    const i = s.indexOf('=');
    if (i === -1) out[s] = '';
    else out[s.slice(0, i)] = decodeURIComponent(s.slice(i + 1));
  }
  return out;
}

function getRequestBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > limit) {
        reject(new Error('body_too_large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
async function readJson(req) {
  const raw = await getRequestBody(req);
  if (!raw) return {};
  return JSON.parse(raw);
}
async function readForm(req) {
  const raw = await getRequestBody(req);
  return Object.fromEntries(new URLSearchParams(raw));
}

function send(res, status, body, headers = {}) {
  if (res._requestId) headers['X-Request-Id'] = res._requestId;
  if (status >= 500) appendAlert('http_5xx', 'critical', { requestId: res._requestId || '', status });
  res.writeHead(status, securityHeaders(Object.assign({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store'
  }, headers)));
  res.end(body);
}
function sendJson(res, status, data, headers = {}) {
  if (res._requestId) { headers['X-Request-Id'] = res._requestId; if (data && typeof data === 'object' && !Array.isArray(data)) data.requestId = res._requestId; }
  if (status === 429) appendAlert('http_429_rate_limited', 'warning', { requestId: res._requestId || '' });
  if (status >= 500) appendAlert('http_5xx', 'critical', { requestId: res._requestId || '', status });
  res.writeHead(status, securityHeaders(Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }, headers)));
  res.end(JSON.stringify(data));
}
function redirect(res, location) { res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' }); res.end(); }

function staticContentType(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.js') return 'application/javascript; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml; charset=utf-8';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}
function sendStaticFile(res, file, cache = 'no-store') {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  res.writeHead(200, securityHeaders({ 'Content-Type': staticContentType(file), 'Cache-Control': cache }));
  res.end(fs.readFileSync(file));
  return true;
}
function marketingFrontendFile(pathname) {
  if (pathname === '/' || pathname === '/index.html') return 'index.html';
  if (pathname === '/site' || pathname === '/site/') return 'index.html';
  if (pathname.startsWith('/site/')) {
    const file = path.basename(decodeURIComponent(pathname.slice('/site/'.length)) || 'index.html');
    return MARKETING_FRONTEND_FILES.has(file) ? file : '';
  }
  const file = path.basename(decodeURIComponent(pathname.slice(1)));
  return MARKETING_FRONTEND_FILES.has(file) ? file : '';
}
function serveMarketingFrontend(res, pathname) {
  const file = marketingFrontendFile(pathname);
  if (!file) return false;
  return sendStaticFile(res, path.join(PUBLIC_SITE_ROOT, file), file.endsWith('.html') ? 'no-store' : 'public, max-age=300');
}


function mergeProjectIntoState(project) {
  if (!project || !project.id) return null;
  const idx = state.projects.findIndex(p => p.id === project.id || (project.publicKey && p.publicKey === project.publicKey));
  if (idx >= 0) state.projects[idx] = Object.assign({}, state.projects[idx], project);
  else state.projects.push(project);
  if (!state.projectStats[project.id]) state.projectStats[project.id] = defaultProjectStats();
  return state.projects.find(p => p.id === project.id) || project;
}
async function ensureProjectAvailable(projectId) {
  let project = state.projects.find(p => p.id === projectId);
  if (project) return project;
  try {
    await ensureScalableRuntimeReady();
    if (scalableRuntime.isPostgresEnabled() && scalableRuntime.pg?.getProjectById) {
      const remote = await scalableRuntime.pg.getProjectById(projectId);
      if (remote) {
        project = mergeProjectIntoState(remote);
        structuredLog('log', 'project_loaded_from_postgres', { projectId: project.id, publicKey: project.publicKey });
        return project;
      }
    }
  } catch (err) {
    structuredLog('error', 'project_load_from_postgres_failed', { projectId, error: err.message });
  }
  return null;
}
async function ensureClientProjects(accountId) {
  const ids = await clientProjectIds(accountId);
  const projects = [];
  for (const id of ids) {
    const project = await ensureProjectAvailable(id);
    if (project) projects.push(project);
  }
  return projects;
}
function projectByPublicKey(publicKey) { return state.projects.find(p => p.publicKey === publicKey); }
function projectById(id) { return state.projects.find(p => p.id === id); }
function stableSdkScriptUrl(project) {
  if (!project) return '';
  return `${PUBLIC_BASE_URL}/sdk/${project.sdkVersion || DEFAULT_SDK_VERSION}/${project.publicKey}.js`;
}
function dynamicBootSdkScriptUrl(project) {
  if (!project) return '';
  const version = project.sdkVersion || DEFAULT_SDK_VERSION;
  const bootId = `boot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${PUBLIC_BASE_URL}/sdk/${version}/${project.publicKey}/${bootId}.js`;
}
function testSdkMode(url) {
  const mode = url?.searchParams?.get('sdkMode');
  return mode === 'stable' ? 'stable' : 'boot';
}
function testSdkScriptUrl(project, url) {
  if (!project) return '';
  if (testSdkMode(url) !== 'stable') return dynamicBootSdkScriptUrl(project);
  // Test pages intentionally add a cache-buster to the otherwise stable customer tag.
  // Without it, a browser can reuse an older allowed SDK response and hide a domain-guard failure.
  return `${stableSdkScriptUrl(project)}?avp_test=${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function stableSdkScriptTag(project, attrs = '') {
  if (!project) return '';
  const extra = attrs ? ` ${attrs}` : '';
  return `<script src="${stableSdkScriptUrl(project)}" async data-project-key="${project.publicKey}"${extra}></script>`;
}
function dynamicBootSdkScriptTag(project, attrs = '') {
  if (!project) return '';
  const extra = attrs ? ` ${attrs}` : '';
  return `<script src="${dynamicBootSdkScriptUrl(project)}" async data-project-key="${project.publicKey}" data-sdk-mode="boot"${extra}></script>`;
}
function testSdkScriptTag(project, url, attrs = '') {
  if (!project) return '';
  const extra = attrs ? ` ${attrs}` : '';
  const mode = testSdkMode(url);
  return `<script src="${testSdkScriptUrl(project, url)}" async data-project-key="${project.publicKey}" data-sdk-mode="${mode}"${extra}></script>`;
}
function testSiteScriptDebug(project) {
  if (!project) return null;
  const version = project.sdkVersion || DEFAULT_SDK_VERSION;
  const stableUrl = stableSdkScriptUrl(project);
  const bootUrl = dynamicBootSdkScriptUrl(project);
  return {
    projectId: project.id,
    projectName: project.name,
    publicKey: project.publicKey,
    sdkVersion: version,
    allowedDomains: project.allowedDomains || [],
    customerStableScriptUrl: stableUrl,
    customerStableScriptTag: stableSdkScriptTag(project),
    testBootScriptUrlExample: bootUrl,
    testBootScriptTagExample: `<script src="${bootUrl}" async data-project-key="${project.publicKey}" data-sdk-mode="boot"></script>`,
    siteAAllowedUrl: `${PUBLIC_BASE_URL}/test-site/article?projectKey=${encodeURIComponent(project.publicKey)}&sdkMode=boot`,
    siteAAllowedStableUrl: `${PUBLIC_BASE_URL}/test-site/article?projectKey=${encodeURIComponent(project.publicKey)}&sdkMode=stable`,
    siteBForeignUrl: `${PUBLIC_BASE_URL.replace('localhost', '127.0.0.2')}/foreign-test-site?projectKey=${encodeURIComponent(project.publicKey)}&sdkMode=boot`,
    siteBForeignStableUrl: `${PUBLIC_BASE_URL.replace('localhost', '127.0.0.2')}/foreign-test-site?projectKey=${encodeURIComponent(project.publicKey)}&sdkMode=stable`,
    expected: 'Customer integration uses the stable /sdk/v1/<publicKey>.js tag. Test pages default to boot-xxxx.js so the dynamic bootstrap/chunk flow is also covered. Site A passes only when its host is in allowedDomains; Site B blocks unless 127.0.0.2 is allowed.'
  };
}
async function currentProjectScriptDebugList(limit = 10) {
  try {
    await ensureScalableRuntimeReady();
    await syncProjectConfigFromPostgres();
  } catch {}
  const seen = new Set();
  const projects = [];
  for (const p of state.projects || []) {
    if (!p || !p.publicKey || seen.has(p.publicKey)) continue;
    seen.add(p.publicKey);
    projects.push(p);
    if (projects.length >= limit) break;
  }
  return projects.map(testSiteScriptDebug).filter(Boolean);
}
function logStaticTestSiteScripts() {
  currentProjectScriptDebugList(6).then(rows => {
    console.log('[beta] Customer SDK tag stays static: /sdk/v1/<publicKey>.js');
    console.log('[beta] Test pages default to dynamic boot: /sdk/v1/<publicKey>/boot-xxxx.js');
    console.log(`[beta] Test launcher: ${PUBLIC_BASE_URL}/test-site`);
    console.log(`[beta] Site A allowed host: ${PUBLIC_BASE_URL}/test-site/article?projectKey=<publicKey>&sdkMode=boot`);
    console.log(`[beta] Site B foreign host: ${PUBLIC_BASE_URL.replace('localhost', '127.0.0.2')}/foreign-test-site?projectKey=<publicKey>&sdkMode=boot`);
    console.log(`[beta] Debug script map: ${PUBLIC_BASE_URL}/debug/test-site-scripts`);
    for (const row of rows) {
      console.log(`[beta] Project ${row.projectName} (${row.publicKey})`);
      console.log(`[beta]   Customer stable tag: ${row.customerStableScriptTag}`);
      console.log(`[beta]   Test boot tag example: ${row.testBootScriptTagExample}`);
      console.log(`[beta]   Site A boot: ${row.siteAAllowedUrl}`);
      console.log(`[beta]   Site A stable: ${row.siteAAllowedStableUrl}`);
      console.log(`[beta]   Site B boot: ${row.siteBForeignUrl}`);
      console.log(`[beta]   Site B stable: ${row.siteBForeignStableUrl}`);
      console.log(`[beta]   allowedDomains: ${(row.allowedDomains || []).join(', ') || '(none)'}`);
    }
  }).catch(err => console.log(`[beta] Test-site script log unavailable: ${err.message}`));
}
function companyById(id) { return state.companies.find(c => c.id === id); }
function statsFor(projectId) { if (!state.projectStats[projectId]) state.projectStats[projectId] = defaultProjectStats(); return state.projectStats[projectId]; }

function originHost(origin) {
  try { return new URL(origin).hostname.toLowerCase(); } catch { return ''; }
}
function requestHost(req) { return String(req.headers.host || '').split(':')[0].toLowerCase(); }
function isOriginAllowed(project, origin) {
  if (!project) return false;
  if (!origin || origin === 'null') return false;
  let parsed;
  try { parsed = new URL(origin); } catch { return false; }
  if (APP_ENV === 'production' && parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  const domains = (project.allowedDomains || []).map(sanitizeDomain).filter(Boolean);
  if (!domains.length) return APP_ENV !== 'production';
  if (APP_ENV === 'production' && domains.some(d => d === '*' || d.includes('*'))) return false;
  const domainAllowed = domains.some(d => host === d || host.endsWith(`.${d}`));
  if (!domainAllowed) return false;
  if (APP_ENV === 'production' && project.domainVerification?.requiredInProduction !== false) {
    const verified = (project.domainVerification?.verifiedDomains || []).map(sanitizeDomain).filter(Boolean);
    return verified.some(d => host === d || host.endsWith(`.${d}`));
  }
  return true;
}
function corsHeaders(req, project) {
  const origin = req.headers.origin;
  const allowed = origin && isOriginAllowed(project, origin) ? origin : 'null';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-AVP-Request, X-AVP-Event-Signature, Authorization',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin'
  };
}
function requestRefererOrigin(req) {
  const ref = String(req.headers.referer || '');
  if (!ref) return '';
  try { return new URL(ref).origin; } catch { return ''; }
}
function sdkDomainGuard(project, req, kind = 'sdk') {
  const referer = String(req.headers.referer || '');
  const origin = requestRefererOrigin(req);
  // Direct script fetches have no Referer. Keep them available for diagnostics/tests,
  // but real browser integrations are guarded by the page Referer + API Origin checks.
  if (!referer || !origin) return { ok: true, reason: 'no_referer_diagnostic_fetch', origin: '', referer };
  if (isOriginAllowed(project, origin)) return { ok: true, reason: 'allowed', origin, referer };
  const host = originHost(origin);
  recordEvent(req, project, 'abuse', 'sdk_domain_not_allowed', { kind, origin, host, referer, allowedDomains: project.allowedDomains || [] }, '');
  appendAlert('sdk_domain_not_allowed', 'warning', { projectId: project.id, publicKey: project.publicKey, origin, referer });
  return { ok: false, reason: 'sdk_domain_not_allowed', origin, referer, host };
}
function blockedSdkStub(project, guard) {
  const payload = {
    success: false,
    reason: guard.reason || 'sdk_domain_not_allowed',
    projectKey: project?.publicKey || '',
    origin: guard.origin || '',
    host: guard.host || '',
    allowedDomains: project?.allowedDomains || []
  };
  return `/* AVP SDK hard-blocked by allowed-domain guard. Real SDK was not delivered. */
(function(){
  var payload=${jsonEsc(payload)};
  window.__AVP_DOMAIN_BLOCKED__=payload;
  try{console.warn('AdProof SDK blocked:', payload);}catch(e){}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function paint(){
    try{
      document.documentElement.setAttribute('data-avp-domain-blocked', payload.reason||'blocked');
      document.documentElement.setAttribute('data-avp-lock', 'domain_guard');
      document.body.innerHTML='<div id="avp-domain-block-lock" style="position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:rgba(0,0,0,.84);font-family:Inter,Arial,sans-serif;color:#fff;padding:24px"><div style="width:min(560px,calc(100vw - 40px));border:1px solid rgba(255,255,255,.22);border-radius:24px;background:rgba(18,18,18,.96);box-shadow:0 30px 90px rgba(0,0,0,.45);padding:28px"><div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#9cc7ff;margin-bottom:10px">AdProof verification</div><h1 style="margin:0 0 12px;font-size:30px;line-height:1.1">Access is locked</h1><p style="margin:0 0 14px;color:#d7d7d7;line-height:1.6">This domain is not authorized for this AdProof project. The real SDK was not delivered and protected content remains unavailable.</p><pre style="white-space:pre-wrap;word-break:break-word;background:#070707;border-radius:14px;padding:14px;color:#e9f3ff;font-size:13px;line-height:1.45">'+esc(JSON.stringify(payload,null,2))+'</pre></div></div>';
    }catch(e){}
  }
  if(document.body) paint(); else document.addEventListener('DOMContentLoaded',paint,{once:true});
  try{window.dispatchEvent(new CustomEvent('avp:domain-blocked',{detail:payload}));}catch(e){}
})();
`;
}
function projectIsOperational(project) {
  if (!project) return { ok: false, reason: 'project_not_found' };
  if (state.settings?.killSwitch || GLOBAL_KILL_SWITCH) return { ok: false, reason: 'global_kill_switch_enabled' };
  if (project.enabled === false || project.killSwitch) return { ok: false, reason: 'project_disabled_or_kill_switch' };
  return { ok: true };
}
const projectRateBuckets = new Map();
const visitorEventBuckets = new Map();
function checkProjectLimit(project, bucketName, maxHits) {
  const key = `${project.id}|${bucketName}`;
  return rateLimitBucket(projectRateBuckets, key, 60 * 1000, Number(maxHits || 1));
}
function checkVisitorEventLimit(project, visitorToken) {
  const key = `${project.id}|${sha256(visitorToken || 'anonymous').slice(0, 16)}|events`;
  return rateLimitBucket(visitorEventBuckets, key, 60 * 1000, Number(project.limits?.eventsPerVisitorPerMinute || MAX_EVENTS_PER_VISITOR_PER_MINUTE));
}
function verifyClientEventEnvelope(project, body, sessionOverride = null) {
  const token = body?.visitorToken || '';
  const sess = sessionOverride || (token && !scalableRuntime.isRedisRuntimeEnabled() ? state.visitorSessions[token] : null);
  if (!sess || sess.projectId !== project.id) return { ok: !SIGNED_EVENTS_STRICT && !project.hardening?.signedEventsStrict, reason: 'missing_event_session' };
  if (!body.eventEnvelope || !body.eventSignature) return { ok: !SIGNED_EVENTS_STRICT && !project.hardening?.signedEventsStrict, reason: 'unsigned_event' };
  try {
    const env = body.eventEnvelope;
    if (env.projectKey !== project.publicKey || env.visitorToken !== token) return { ok: false, reason: 'event_envelope_mismatch' };
    if (env.detailsHash !== sha256(JSON.stringify(body.details || {}))) return { ok: false, reason: 'event_details_hash_mismatch' };
    const ok = verifySignedPayload(sess.clientPublicKey, env, body.eventSignature);
    return { ok, reason: ok ? 'event_signature_ok' : 'event_signature_invalid' };
  } catch { return { ok: false, reason: 'event_signature_invalid' }; }
}
function rejectIfProjectClosed(req, res, project) {
  const op = projectIsOperational(project);
  if (!op.ok) { recordEvent(req, project || state.projects[0], 'abuse', op.reason, {}, ''); sendJson(res, 503, { success: false, reason: op.reason }, corsHeaders(req, project || state.projects[0])); return true; }
  return false;
}


function rateLimitBucket(map, key, windowMs, maxHits) {
  const t = now();
  const rec = map.get(key) || { start: t, count: 0 };
  if (t - rec.start > windowMs) { rec.start = t; rec.count = 0; }
  rec.count += 1;
  map.set(key, rec);
  return rec.count <= maxHits;
}
function requestIpKey(req) { return trustedClientIp(req); }
function isMetricsAllowed(req, url) {
  if (METRICS_TOKEN && (url.searchParams.get('token') === METRICS_TOKEN || req.headers.authorization === `Bearer ${METRICS_TOKEN}`)) return true;
  if (APP_ENV === 'production' && METRICS_REQUIRE_TOKEN_IN_PRODUCTION) return false;
  const ip = trustedClientIp(req);
  return METRICS_ALLOW_IPS.some(x => x === ip || (x === '127.0.0.1' && ip === '::1'));
}
function securityHeaders(extra = {}) {
  return Object.assign({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'interest-cohort=(), camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'"
  }, extra);
}

function userFromAdminSession(req) {
  const sid = parseCookies(req.headers.cookie || '')[ADMIN_COOKIE];
  if (!sid || !state.adminSessions[sid]) return null;
  const sess = state.adminSessions[sid];
  if (now() - sess.lastSeen > ADMIN_SESSION_TTL) {
    delete state.adminSessions[sid];
    scheduleSave();
    return null;
  }
  sess.lastSeen = now();
  if (!sess.csrfToken) sess.csrfToken = hmac(`${sess.userId}:${sess.createdAt}:${SESSION_SECRET}`, SESSION_SECRET).slice(0, 48);
  const user = state.users.find(u => u.id === sess.userId);
  return user ? Object.assign({}, user, { csrfToken: sess.csrfToken }) : null;
}
function requireAdmin(req, res) {
  const user = userFromAdminSession(req);
  if (!user) { redirect(res, '/admin/login'); return null; }
  return user;
}
function adminSession(req) {
  const sid = parseCookies(req.headers.cookie || '')[ADMIN_COOKIE];
  return sid ? state.adminSessions[sid] : null;
}
function csrfInput(user) {
  return user && user.csrfToken ? `<input type="hidden" name="csrf" value="${esc(user.csrfToken)}">` : '';
}
function checkAdminCsrf(req, form) {
  const sess = adminSession(req);
  return Boolean(sess && sess.csrfToken && form && form.csrf === sess.csrfToken);
}
function denyBadCsrf(res, user) {
  return send(res, 403, appShell('Bad request', '<section class="card"><h1>403</h1><p>Admin CSRF token is missing or expired. Please reload the dashboard and try again.</p></section>', user));
}

function inc(obj, key, by = 1) { obj[key] = (obj[key] || 0) + by; }
function clientFingerprint(req) { return sha256(`${trustedClientIp(req)}|${req.headers['user-agent'] || ''}`).slice(0, 16); }
function browserLabel(ua = '') { const t = String(ua); if (/Edg\//.test(t)) return 'edge'; if (/OPR\//.test(t)) return 'opera'; if (/SamsungBrowser\//.test(t)) return 'samsung_internet'; if (/Brave\//.test(t)) return 'brave'; if (/Firefox\//.test(t)) return 'firefox'; if (/Chrome\//.test(t)) return 'chrome'; if (/Safari\//.test(t)) return 'safari'; return 'other'; }
function eventDomain(origin = '', page = '') { try { return new URL(origin || page).hostname.toLowerCase(); } catch { return ''; } }
function recordEvent(req, project, type, reason = 'none', details = {}, visitorToken = '') {
  if (!project) return;
  const st = statsFor(project.id);
  const ts = now();
  const day = dayKey(ts);
  if (!st.daily[day]) st.daily[day] = { visits: 0, uniqueVisitors: 0, events: 0, contentUnlocked: 0, overlayShown: 0, adRestores: 0, connectionIssues: 0, clientErrors: 0, proofFailed: 0, serverVerifications: 0, abuseEvents: 0, droppedEvents: 0 };
  const daily = st.daily[day];
  st.events += 1; daily.events = (daily.events || 0) + 1;

  if (type === 'visit') { st.visits += 1; daily.visits += 1; }
  if (type === 'unique_visitor') { st.uniqueVisitors += 1; daily.uniqueVisitors += 1; }
  if (type === 'ad_fragment_delivered') st.adFragmentsDelivered += 1;
  if (type === 'content_unlocked') { st.contentUnlocked += 1; daily.contentUnlocked += 1; }
  if (type === 'overlay_shown') { st.overlayShown += 1; daily.overlayShown += 1; inc(st.reasons, reason); }
  if (type === 'ad_restore') { st.adRestores += 1; daily.adRestores += 1; inc(st.reasons, reason); }
  if (type === 'connection_issue') { st.connectionIssues += 1; daily.connectionIssues += 1; inc(st.reasons, reason); }
  if (type === 'client_error') { st.clientErrors += 1; daily.clientErrors += 1; inc(st.reasons, reason); }
  if (type === 'server_verification') { st.serverVerifications += 1; daily.serverVerifications = (daily.serverVerifications || 0) + 1; }
  if (type === 'server_verification_ok') st.successfulServerVerifications += 1;
  if (type === 'proof_ok') { st.webCryptoProofOk += 1; st.canvasProofOk += 1; }
  if (type === 'proof_failed') { st.webCryptoProofFailed += 1; daily.proofFailed += 1; inc(st.reasons, reason); }
  if (type === 'heartbeat_lost') { st.heartbeatLost += 1; inc(st.reasons, reason); }
  if (type === 'scheduled_rerender') st.scheduledRerenders += 1;

  const event = {
    time: iso(ts),
    projectId: project.id,
    projectName: project.name,
    type: clamp(type, 60),
    reason: clamp(reason, 90),
    visitor: visitorToken ? sha256(visitorToken).slice(0, 12) : '',
    origin: clamp(req.headers.origin || '', 120),
    page: clamp(details.pageUrl || details.page || '', 180),
    domain: clamp(eventDomain(req.headers.origin || '', details.pageUrl || details.page || ''), 100),
    ipHash: clientFingerprint(req),
    ua: clamp(req.headers['user-agent'] || '', 150),
    browser: browserLabel(req.headers['user-agent'] || ''),
    details: sanitizeDetails(details || {})
  };
  if (event.domain) inc(st.domains, event.domain);
  if (event.browser) inc(st.browsers, event.browser);
  if (/bad_project_or_secret|origin_not_allowed|signature_invalid|challenge_missing|canvas_proof_invalid|excessive|rate_limited|bad_visitor_token/.test(reason) || type === 'abuse') {
    st.abuseEvents += 1; daily.abuseEvents += 1;
  }
  if (type === 'proof_failed' && (st.webCryptoProofFailed % 25 === 0)) appendAlert('proof_failed_spike', 'warning', { projectId: project.id, count: st.webCryptoProofFailed, reason });
  if (type === 'heartbeat_lost' && (st.heartbeatLost % 25 === 0)) appendAlert('heartbeat_lost_spike', 'warning', { projectId: project.id, count: st.heartbeatLost });
  if (reason === 'server_did_not_see_bait_hit') appendAlert('bait_hit_missing', 'warning', { projectId: project.id, page: event.page });
  if (type === 'proof_failed' && reason === 'server_did_not_see_bait_hit' && st.webCryptoProofFailed >= 10) appendAlert('bait_hit_success_rate_drop', 'warning', { projectId: project.id, proofFailed: st.webCryptoProofFailed });
  try { if (appendEventLog(event) === false) { st.droppedEvents += 1; daily.droppedEvents = (daily.droppedEvents || 0) + 1; } } catch (err) { console.error('[event-log] append failed:', err.message); appendAlert('event_log_append_failed', 'critical', { message: err.message }); }
  if (KEEP_IN_MEMORY_EVENT_STATS) {
    st.recentEvents.push(event);
    if (st.recentEvents.length > MAX_RECENT_PROJECT_EVENTS) st.recentEvents = st.recentEvents.slice(-MAX_RECENT_PROJECT_EVENTS);
    state.globalEvents.push(event);
    if (state.globalEvents.length > MAX_GLOBAL_RECENT_EVENTS) state.globalEvents = state.globalEvents.slice(-MAX_GLOBAL_RECENT_EVENTS);
  }
  if (PERSIST_EVENT_STATS_IN_JSON) scheduleSave();
}

function cleanupSessions() {
  if (!scalableRuntime.isRedisRuntimeEnabled()) {
    const cutoff = now() - VISITOR_SESSION_TTL;
    for (const [token, sess] of Object.entries(state.visitorSessions)) {
      if ((sess.lastSeen || sess.createdAt || 0) < cutoff) delete state.visitorSessions[token];
    }
  }
  const adminCutoff = now() - ADMIN_SESSION_TTL;
  for (const [sid, sess] of Object.entries(state.adminSessions)) {
    if ((sess.lastSeen || sess.createdAt || 0) < adminCutoff) delete state.adminSessions[sid];
  }
  if (!scalableRuntime.isRedisRuntimeEnabled()) scheduleSave(); else scheduleRuntimeSave();
}
setInterval(cleanupSessions, 5 * 60 * 1000).unref();

function makeAdHtml(project, reason = 'initial', opts = {}) {
  const a = crypto.randomBytes(4).toString('hex');
  const b = crypto.randomBytes(4).toString('hex');
  const slot = opts.slotId || `slot_${crypto.randomBytes(10).toString('hex')}`;
  const nonce = opts.nonce || crypto.randomBytes(16).toString('hex');
  const baitToken = opts.baitToken || crypto.randomBytes(10).toString('hex');
  const px = crypto.randomBytes(4).toString('hex');
  const baitUrl = `${PUBLIC_BASE_URL}/api/v1/bait-hit?projectKey=${encodeURIComponent(project.publicKey)}&visitorToken=${encodeURIComponent(opts.visitorToken || '')}&nonce=${encodeURIComponent(nonce)}&slotId=${encodeURIComponent(slot)}&baitToken=${encodeURIComponent(baitToken)}&r=${Date.now()}${px}`;
  return `
    <div class="avp-slot avp-slot-${a}" data-avp-slot="${esc(slot)}" data-avp-nonce="${esc(nonce)}" data-avp-render="${esc(reason)}" style="width:300px;min-height:250px;border-radius:14px;overflow:hidden;background:linear-gradient(135deg,#d9ecff,#f4fbff);border:1px solid rgba(74,144,217,.25);box-shadow:0 18px 48px rgba(47,97,141,.14);position:relative;display:flex;align-items:center;justify-content:center;color:#25577e;font-family:Arial,sans-serif;">
      <img alt="" data-avp-bait-pixel="1" src="${esc(baitUrl)}" style="position:absolute;width:1px;height:1px;opacity:.01;pointer-events:none;left:2px;top:2px;">
      <script data-avp-bait-script="1" src="${esc(baitUrl)}&kind=script" async><\/script>
      <div class="avp-inner-${b}" style="text-align:center;padding:22px;">
        <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:.62;margin-bottom:10px;">Sponsored area</div>
        <div style="font-size:20px;font-weight:700;margin-bottom:8px;">Ad visibility check</div>
        <div style="font-size:13px;line-height:1.5;opacity:.78;">Demo advertising container<br>project: ${esc(project.name)}</div>
      </div>
    </div>
  `;
}

function appShell(title, body, user = null) {
  const isClient = user && user.role === 'client_owner';
  const homeHref = '/';
  const dashboardHref = isClient ? '/account' : '/admin';
  const securityHref = isClient ? '/account#security' : '/admin/security';
  const docsHref = '/docs.html';
  const displayName = user ? esc(user.fullName || user.name || user.email || 'Account') : '';
  const profileMenu = user ? (isClient
    ? `<span class="portal-profile"><button type="button">Profile</button><span class="portal-profile-menu"><a href="/account">${displayName}</a><form method="post" action="/logout" style="margin:0">${clientCsrfInput(user)}<button>Logout</button></form></span></span>`
    : `<span class="portal-profile"><button type="button">Profile</button><span class="portal-profile-menu"><a href="/admin">${displayName}</a><form method="post" action="/admin/logout" style="margin:0">${csrfInput(user)}<button>Logout</button></form></span></span>`)
    : `<a href="/login">Login</a>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--ivory:#fdf9e9;--ivory2:#fffdf4;--ink:#1a1a1a;--muted:#766f66;--blue:#4a90d9;--blue2:#dff0ff;--card:rgba(255,255,255,.72);--line:rgba(20,20,20,.1);--good:#257a50;--bad:#9f3434;--warn:#9b6b1d}*{box-sizing:border-box}body{margin:0;background:rgb(253,249,233);font-family:Inter,Arial,sans-serif;color:var(--ink);min-height:100vh}a{color:#236ca8;text-decoration:none}a:hover{text-decoration:underline}.top{background:rgba(18,18,18,.96);color:#fff;padding:0;box-shadow:0 12px 38px rgba(0,0,0,.13)}.top-inner{width:min(100%,1180px);min-height:72px;margin:0 auto;padding:0 22px;display:flex;justify-content:space-between;align-items:center;gap:18px}.portal-logo{display:flex;align-items:center;gap:12px;color:#fff;text-decoration:none;font-weight:600;letter-spacing:.2px;min-width:230px}.portal-logo:hover{text-decoration:none}.portal-logo img{width:40px;height:40px;object-fit:contain;display:block;filter:brightness(0) invert(1)}.nav{display:flex;gap:5px;align-items:center;justify-content:flex-end;flex-wrap:wrap;font-size:13px}.nav a,.nav button{color:rgba(255,255,255,.78);background:transparent;border:0;font:inherit;font-size:13px;font-weight:600!important;cursor:pointer;border-radius:999px;padding:9px 10px;opacity:1;text-decoration:none}.nav a:hover,.nav button:hover{background:rgba(255,255,255,.09);color:#fff;text-decoration:none}.portal-profile{position:relative;display:inline-flex}.portal-profile-menu{display:none;position:absolute;right:0;top:calc(100% + 10px);min-width:220px;background:#fff;color:#111;border:1px solid var(--line);border-radius:18px;padding:8px;box-shadow:0 24px 70px rgba(0,0,0,.18);z-index:20}.portal-profile:hover .portal-profile-menu,.portal-profile:focus-within .portal-profile-menu{display:block}.portal-profile-menu a,.portal-profile-menu button{display:block;width:100%;text-align:left;color:#111!important;background:transparent!important;border:0;border-radius:12px;padding:10px 12px;font-size:13px;font-weight:600;text-decoration:none}.portal-profile-menu a:hover,.portal-profile-menu button:hover{background:#f3efe6!important;color:#111!important}.wrap{max-width:1180px;margin:32px auto;padding:0 22px}.grid{display:grid;gap:18px}.grid.cols4{grid-template-columns:repeat(4,minmax(0,1fr))}.grid.cols3{grid-template-columns:repeat(3,minmax(0,1fr))}.card{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:22px;box-shadow:0 20px 70px rgba(72,59,39,.08);backdrop-filter:blur(10px)}.kpi .num{font-size:34px;font-weight:600;margin:8px 0 4px}.kpi .label{color:var(--muted);font-size:13px;line-height:1.4}.title{font-size:30px;margin:0 0 8px}.lead{color:var(--muted);line-height:1.7;max-width:850px}.btn{display:inline-flex;align-items:center;gap:8px;background:#121212;color:#fff;border:0;border-radius:14px;padding:11px 15px;font-weight:600;cursor:pointer;text-decoration:none}.btn.blue{background:var(--blue)}.btn.ghost{background:rgba(255,255,255,.7);color:#111;border:1px solid var(--line)}.btn:hover{text-decoration:none;filter:brightness(.98)}input,textarea,select{width:100%;border:1px solid var(--line);border-radius:14px;padding:12px 13px;background:rgba(255,255,255,.82);font:inherit}label{display:block;font-size:13px;font-weight:600;margin:0 0 7px}.field{margin-bottom:15px}.row{display:grid;grid-template-columns:1fr 1fr;gap:16px}.table{width:100%;border-collapse:collapse}.table th,.table td{padding:12px 10px;border-bottom:1px solid var(--line);text-align:left;font-size:14px;vertical-align:top}.table th{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.7px}.pill{display:inline-block;padding:5px 8px;border-radius:999px;background:var(--blue2);color:#245b83;font-size:12px;font-weight:600}.pill.good{background:#e2f5ea;color:var(--good)}.pill.bad{background:#fae9e9;color:var(--bad)}.pill.warn{background:#fff1d5;color:var(--warn)}pre{white-space:pre-wrap;word-break:break-word;background:#111;color:#edf7ff;border-radius:16px;padding:16px;line-height:1.55;font-size:13px}code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.muted{color:var(--muted)}.section{margin-top:22px}.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.split{display:grid;grid-template-columns:1.2fr .8fr;gap:20px}.notice{border-left:4px solid var(--blue);background:rgba(223,240,255,.55);padding:14px 16px;border-radius:14px;color:#244d6b;line-height:1.55}.client-popover{position:fixed;right:24px;top:92px;z-index:1000;max-width:330px;background:rgba(255,255,255,.96);border:1px solid var(--line);border-radius:22px;padding:14px 16px;box-shadow:0 22px 70px rgba(38,28,15,.16);transform:translateY(-4px);animation:clientPopoverIn .28s ease both}.client-popover h3{margin:0 0 5px;font-size:17px;letter-spacing:-.2px}.client-popover p{color:var(--muted);line-height:1.42;margin:0;font-size:13px}.client-popover .x{position:absolute;right:10px;top:8px;border:0;background:transparent;font-size:18px;cursor:pointer}.client-popover.login-popover{max-width:250px;padding:10px 12px;border-radius:18px;animation:clientPopoverIn .24s ease both, clientPopoverOut .42s ease 3s forwards}.client-popover.login-popover h3{font-size:15px;margin-right:18px}.client-popover.login-popover p{font-size:12px}.account-summary{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 16px}.account-chip{display:inline-flex;align-items:center;gap:7px;padding:8px 10px;border:1px solid var(--line);border-radius:999px;background:rgba(255,255,255,.78);color:#2c2a28;font-size:13px;font-weight:600}.account-chip.trial{background:#e2f5ea;color:var(--good);border-color:rgba(37,122,80,.18)}@keyframes clientPopoverIn{from{opacity:0;transform:translateY(-10px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}@keyframes clientPopoverOut{to{opacity:0;transform:translateY(-10px) scale(.98);pointer-events:none}}.project-card{position:relative;overflow:hidden}.project-card:before{content:'';position:absolute;inset:0 0 auto;height:8px;background:var(--project-gradient,linear-gradient(90deg,#111,#4a90d9))}.project-card .card-body{padding-top:8px}.create-project-tile{width:100%;min-height:160px;display:grid;place-items:center;border:1px dashed rgba(20,20,20,.22);background:rgba(255,255,255,.54);border-radius:22px;color:#111;font-size:20px;cursor:pointer}.create-project-tile:hover{background:#fff;text-decoration:none}.project-modal{position:fixed;inset:0;z-index:1200;display:grid;place-items:center;padding:22px;background:rgba(5,5,5,.58);backdrop-filter:blur(8px);opacity:0;pointer-events:none;transition:opacity .2s ease}.project-modal.open{opacity:1;pointer-events:auto}.project-modal-card{position:relative;max-width:860px;width:min(860px,100%);max-height:min(86vh,900px);overflow:auto;background:#fff;border:1px solid var(--line);border-radius:28px;padding:24px;box-shadow:0 30px 100px rgba(0,0,0,.24);transform:translateY(16px) scale(.98);transition:transform .2s ease}.project-modal.open .project-modal-card{transform:none}.modal-close{position:absolute;right:16px;top:14px;border:0;background:#f5f1e9;border-radius:999px;width:34px;height:34px;font-size:21px;cursor:pointer}.mini-chart{display:flex;align-items:end;gap:8px;height:98px;padding:14px;border-radius:18px;background:rgba(255,255,255,.55);border:1px solid var(--line)}.mini-chart span{display:block;flex:1;min-width:10px;border-radius:9px 9px 3px 3px;background:linear-gradient(180deg,#7b5cff,#1f5f94);height:var(--h,12%)}.soft-panel{background:linear-gradient(135deg,rgba(123,92,255,.11),rgba(74,144,217,.12));border:1px solid rgba(88,72,180,.16);border-radius:24px;padding:18px}.swatches{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.swatch{border-radius:14px;padding:10px 8px;background:var(--g);color:#fff;font-size:12px;font-weight:600;text-align:center}.danger{border-left-color:#bd3f3f;background:rgba(255,235,235,.7);color:#713333}.ok{border-left-color:#268454;background:rgba(226,245,234,.7);color:#225c3d}@media(max-width:900px){.grid.cols4,.grid.cols3,.split,.row{grid-template-columns:1fr}.top-inner{align-items:flex-start;flex-direction:column;padding-top:14px;padding-bottom:14px}.portal-logo{min-width:auto}.wrap{margin:22px auto}.title{font-size:24px}}.top :where(.brand,.nav a,.nav button),.btn,label,.pill,.swatch,.table th,.kpi .num,.client-popover h3,.notice,strong,b{font-weight:600!important}.title,h1,h2,h3{font-weight:700}
${portalResponsiveCss()}
</style></head><body>
<header class="top"><div class="top-inner"><a class="portal-logo" href="/"><img src="/icon.png" alt="" aria-hidden="true"><span>AdProof</span></a><nav class="nav"><a href="${homeHref}">Home</a><a href="${dashboardHref}">Dashboard</a><a href="${securityHref}">Security</a><a href="${docsHref}">Docs</a>${profileMenu}</nav></div></header>
<main class="wrap">${body}</main></body></html>`;
}

function loginPage(message = '') {
  return appShell('Admin login', `<div class="split"><section class="card"><h1 class="title">Owner dashboard login</h1><p class="lead">This is the private owner dashboard for companies, projects, integration keys, events and analytics.</p>${message ? `<p class="notice danger">${esc(message)}</p>` : ''}<form method="post" action="/admin/login"><div class="field"><label>Email</label><input name="email" value="${esc(ADMIN_EMAIL)}" autocomplete="username"></div><div class="field"><label>Password</label><input name="password" type="password" autocomplete="current-password" placeholder="${ADMIN_PASSWORD === 'admin123' ? 'admin123' : 'Your password'}"></div><div class="field"><label>TOTP MFA code, if enabled</label><input name="mfaCode" inputmode="numeric" autocomplete="one-time-code" placeholder="123456"></div><button class="btn blue">Login</button></form></section><aside class="card"><h2>For beta testing</h2><p class="muted">A demo project is created by default. After login, the owner can create projects for beta companies, issue install snippets and review events.</p><pre>ADMIN_EMAIL=${esc(ADMIN_EMAIL)}\nADMIN_PASSWORD=${ADMIN_PASSWORD === 'admin123' ? 'admin123' : 'from environment variable'}</pre></aside></div>`);
}

function clientCookieAttrs() { return `Path=/; HttpOnly; SameSite=Lax${(USE_HTTPS || APP_ENV === 'production') ? '; Secure' : ''}`; }
function clientCsrfInput(client) { return client?.csrfToken ? `<input type="hidden" name="csrf" value="${esc(client.csrfToken)}">` : ''; }
async function clientFromSession(req) {
  const sid = parseCookies(req.headers.cookie || '')[CLIENT_COOKIE];
  const sess = await loadClientSession(sid);
  if (!sid || !sess || now() > Number(sess.expiresAt || 0)) { if (sid) await deleteClientSession(sid); return null; }
  await touchClientSession(sid, sess);
  const account = await findClientAccountById(sess.accountId);
  return account ? Object.assign({}, account, { csrfToken: sess.csrfToken, clientSessionId: sid }) : null;
}
async function requireClient(req, res) {
  const client = await clientFromSession(req);
  if (!client) { redirect(res, '/login'); return null; }
  return client;
}
async function checkClientCsrf(req, form) {
  const client = await clientFromSession(req);
  return Boolean(client && form && form.csrf === client.csrfToken);
}

function cleanExpiredOauthStates() {
  const ts = now();
  for (const [key, val] of oauthStates.entries()) if (!val || val.expiresAt < ts) oauthStates.delete(key);
}
function oauthRedirectUri(provider = 'google') { return `${PUBLIC_BASE_URL}/auth/${provider}/callback`; }
function googleAuthUrl(state) {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  u.searchParams.set('redirect_uri', oauthRedirectUri('google'));
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', 'openid email profile');
  u.searchParams.set('state', state);
  u.searchParams.set('prompt', 'select_account');
  return u.toString();
}
function httpsFormPost(url, fields) {
  return new Promise((resolve, reject) => {
    const data = new URLSearchParams(fields).toString();
    const target = new URL(url);
    const req = https.request({ method: 'POST', hostname: target.hostname, path: target.pathname + target.search, headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode || 0, body: JSON.parse(body || '{}') }); }
        catch { resolve({ status: res.statusCode || 0, body: { raw: body } }); }
      });
    });
    req.on('error', reject); req.write(data); req.end();
  });
}
function httpsJsonGet(url, bearerToken) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = https.request({ method: 'GET', hostname: target.hostname, path: target.pathname + target.search, headers: bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {} }, (res) => {
      let body = '';
      res.setEncoding('utf8'); res.on('data', chunk => body += chunk);
      res.on('end', () => { try { resolve({ status: res.statusCode || 0, body: JSON.parse(body || '{}') }); } catch { resolve({ status: res.statusCode || 0, body: { raw: body } }); } });
    });
    req.on('error', reject); req.end();
  });
}
async function findOrCreateGoogleAccount(profile) {
  const email = normalizeEmail(profile.email || '').slice(0, 160);
  if (!emailLooksValid(email)) throw new Error('google_email_missing');
  const lookup = await findClientAccountByEmailDetailed(email);
  if (AUTH_DEBUG_LOGS) {
    structuredLog('log', 'google_oauth_account_lookup', {
      emailMasked: maskEmail(email),
      emailHash: emailHash(email),
      found: Boolean(lookup.account),
      source: lookup.source,
      authDbFile: lookup.authDbFile,
      authDbExists: lookup.authDbExists,
      accountCount: lookup.accountCount,
      knownAccounts: lookup.knownAccounts,
      appDb: appDbPublicStatus()
    });
  }
  if (lookup.account) {
    if (appDbReady && appDbPool && !String(lookup.account.provider || '').includes('google')) {
      try {
        await appDbPool.query(`UPDATE avp_client_accounts
          SET provider = CASE WHEN provider LIKE '%google%' THEN provider ELSE provider || '+google' END,
              full_name = COALESCE(NULLIF($2,''), full_name),
              email_verified = true,
              updated_at = now()
          WHERE id=$1`, [lookup.account.id, clamp(profile.name || profile.given_name || '', 120)]);
        const refreshed = await findClientAccountByEmail(email);
        if (refreshed) return refreshed;
      } catch (err) {
        structuredLog('warn', 'google_oauth_existing_account_update_failed', { emailMasked: maskEmail(email), emailHash: emailHash(email), accountId: lookup.account.id, error: err.message });
      }
    }
    return lookup.account;
  }
  const name = clamp(profile.name || profile.given_name || email.split('@')[0], 120);
  const account = { id: randomId('acct'), email, fullName: name, phone: '', companyName: name, password: passwordRecord(randomKey('oauth_pwd')), provider: 'google', role: 'client_owner', status: 'trial', planId: 'beta', marketingConsent: false, marketingConsentAt: '', emailVerified: profile.verified_email !== false, trialEndsAt: new Date(now() + 30 * 24 * 60 * 60 * 1000).toISOString(), createdAt: iso(), updatedAt: iso() };
  const saved = await createClientAccount(account);
  if (!APP_DB_ENABLED) upsertJsonAuthMirrorAccount(saved || account, 'google_oauth_after_create');
  if (AUTH_DEBUG_LOGS) {
    const verify = await findClientAccountByEmailDetailed(email);
    structuredLog('log', 'google_oauth_account_saved', {
      emailMasked: maskEmail(email),
      emailHash: emailHash(email),
      accountId: saved.id,
      provider: saved.provider,
      storage: verify.source,
      foundAfterSave: Boolean(verify.account),
      authDbFile: verify.authDbFile,
      authDbExists: verify.authDbExists,
      accountCount: verify.accountCount,
      appDb: appDbPublicStatus()
    });
  }
  return saved;
}
function publicHeader(active = '') {
  const nav = [
    ['Home','/'], ['Product','/product.html'], ['AI','/ai.html'], ['Security','/security.html'], ['Pricing','/pricing.html'], ['Docs','/docs.html'], ['Blog','/blog.html']
  ].map(([label, href]) => `<a href="${href}" class="${active === label.toLowerCase() ? 'active' : ''}">${label}</a>`).join('');
  return `<header class="site-header topbar"><div class="container nav-wrap"><a class="logo" href="/" aria-label="AdProof home"><img class="logo-icon" src="/icon.png" alt="" aria-hidden="true"><span class="logo-text">AdProof</span></a><button class="menu-toggle" type="button" data-menu-toggle aria-label="Open menu" aria-expanded="false"><span></span><span></span><span></span></button><nav class="nav" data-nav aria-label="Main navigation">${nav}<a href="/login" class="${active === 'login' ? 'active' : ''}">Login</a><a class="nav-cta" href="/register">Get access</a></nav></div></header>`;
}
function publicAuthPage(title, body, active = 'login') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} — AdProof</title><link rel="stylesheet" href="/style.css"><style>
  .auth-main{min-height:calc(100vh - 72px);padding:42px 0 58px;display:flex;align-items:center}.auth-shell{width:100%;display:flex;justify-content:center;align-items:center;padding:0 22px}.auth-single{width:100%;max-width:520px;margin:0 auto}.auth-card{background:rgba(255,255,255,.82);border:1px solid rgba(20,20,20,.1);border-radius:30px;padding:26px;box-shadow:0 24px 72px rgba(72,59,39,.12);backdrop-filter:blur(10px)}.auth-field{margin-bottom:15px}.auth-field label{display:block;font-size:13px;font-weight:600;margin:0 0 7px;color:#1a1a1a}.auth-field input{width:100%;border:1px solid rgba(20,20,20,.1);border-radius:16px;padding:12px 13px;background:rgba(255,255,255,.88);font:inherit}.auth-help{display:block;margin-top:6px;color:#766f66;font-size:12px;line-height:1.45}.notice{border-left:4px solid #4a90d9;background:rgba(223,240,255,.55);padding:13px 15px;border-radius:14px;color:#244d6b;line-height:1.55}.notice.danger{border-left-color:#bd3f3f;background:rgba(255,235,235,.75);color:#713333}.google-btn{width:100%;min-height:46px;justify-content:center;margin-top:0}.Button-content{display:inline-flex;align-items:center;justify-content:center;gap:10px}.Button-visual{display:inline-grid;place-items:center;width:18px;height:18px}.Button-label{line-height:1}.auth-divider{display:flex;align-items:center;gap:12px;margin:12px 0;color:#766f66;font-size:12px}.auth-divider:before,.auth-divider:after{content:"";height:1px;flex:1;background:rgba(20,20,20,.1)}.auth-centered-note{text-align:center;margin:18px 0 0}.auth-card :where(p,a,span,label,input,button,small,strong,b,li,pre,code){font-weight:600}.auth-card h1,.auth-card h2,.auth-card h3{font-weight:700}.auth-card .title{margin-bottom:10px}.auth-lead{line-height:1.3}.auth-forgot{text-align:center;margin:10px 0 0}.auth-forgot a{font-size:13px;color:#236ca8}.auth-card .lead{margin-bottom:18px}.auth-check{display:flex;align-items:flex-start;gap:10px;margin:0 0 16px;font-size:13px;line-height:1.45;color:#504942}.auth-check input{width:auto;margin-top:3px;accent-color:var(--blue)}@media(max-width:900px){.auth-main{min-height:calc(100vh - 66px);padding:30px 0 48px}}
  </style></head><body>${publicHeader(active)}<main class="site-main auth-main"><div class="auth-shell">${body}</div></main><script src="/app.js"></script></body></html>`;
}
function googleButton(label = 'Continue with Google') {
  return `<a class="btn ghost google-btn" href="/auth/google/start" aria-label="${esc(label)}"><span class="Button-content"><span class="Button-visual Button-leadingVisual"><svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16"><g clip-path="url(#google-g)"><path d="M8.00018 3.16667C9.18018 3.16667 10.2368 3.57333 11.0702 4.36667L13.3535 2.08333C11.9668 0.793333 10.1568 0 8.00018 0C4.87352 0 2.17018 1.79333 0.853516 4.40667L3.51352 6.47C4.14352 4.57333 5.91352 3.16667 8.00018 3.16667Z" fill="#EA4335"/><path d="M15.66 8.18335C15.66 7.66002 15.61 7.15335 15.5333 6.66669H8V9.67335H12.3133C12.12 10.66 11.56 11.5 10.72 12.0667L13.2967 14.0667C14.8 12.6734 15.66 10.6134 15.66 8.18335Z" fill="#4285F4"/><path d="M3.51 9.53001C3.35 9.04668 3.25667 8.53334 3.25667 8.00001C3.25667 7.46668 3.34667 6.95334 3.51 6.47001L0.85 4.40668C0.306667 5.48668 0 6.70668 0 8.00001C0 9.29334 0.306667 10.5133 0.853333 11.5933L3.51 9.53001Z" fill="#FBBC05"/><path d="M8.0001 16C10.1601 16 11.9768 15.29 13.2968 14.0633L10.7201 12.0633C10.0034 12.5467 9.0801 12.83 8.0001 12.83C5.91343 12.83 4.14343 11.4233 3.5101 9.52667L0.850098 11.59C2.1701 14.2067 4.87343 16 8.0001 16Z" fill="#34A853"/></g><defs><clipPath id="google-g"><rect width="16" height="16" fill="white"/></clipPath></defs></svg></span><span class="Button-label">${esc(label)}</span></span></a>`;
}

const COUNTRY_CALLING_CODES = [
  ['Ukraine','+380'],
  ['Afghanistan','+93'],
  ['Albania','+355'],
  ['Algeria','+213'],
  ['American Samoa','+1684'],
  ['Angola','+244'],
  ['Anguilla','+1264'],
  ['Antigua and Barbuda','+1268'],
  ['Argentina','+54'],
  ['Armenia','+374'],
  ['Aruba','+297'],
  ['Australia','+61'],
  ['Austria','+43'],
  ['Azerbaijan','+994'],
  ['Bahrain','+973'],
  ['Bangladesh','+880'],
  ['Barbados','+1246'],
  ['Belarus','+375'],
  ['Belgium','+32'],
  ['Belize','+501'],
  ['Benin','+229'],
  ['Bermuda','+1441'],
  ['Bhutan','+975'],
  ['Bolivia','+591'],
  ['Bosnia and Herzegovina','+387'],
  ['Botswana','+267'],
  ['Brazil','+55'],
  ['British Indian Ocean Territory','+246'],
  ['Brunei','+673'],
  ['Bulgaria','+359'],
  ['Burkina Faso','+226'],
  ['Burundi','+257'],
  ['Cambodia','+855'],
  ['Cameroon','+237'],
  ['Canada','+1'],
  ['Cape Verde','+238'],
  ['Cayman Islands','+1345'],
  ['Central African Republic','+236'],
  ['Chad','+235'],
  ['Chile','+56'],
  ['China','+86'],
  ['Christmas Island','+61'],
  ['Cocos (Keeling) Islands','+61'],
  ['Colombia','+57'],
  ['Comoros','+269'],
  ['Cook Islands','+682'],
  ['Costa Rica','+506'],
  ['Croatia','+385'],
  ['Cuba','+53'],
  ['Cyprus','+357'],
  ['Czech Republic','+420'],
  ['Democratic Republic of the Congo','+243'],
  ['Denmark','+45'],
  ['Djibouti','+253'],
  ['Dominica','+1767'],
  ['Dominican Republic','+1809'],
  ['East Timor','+670'],
  ['Ecuador','+593'],
  ['Egypt','+20'],
  ['El Salvador','+503'],
  ['Equatorial Guinea','+240'],
  ['Eritrea','+291'],
  ['Estonia','+372'],
  ['Ethiopia','+251'],
  ['Falkland Islands','+500'],
  ['Faroe Islands','+298'],
  ['Federated States of Micronesia','+691'],
  ['Fiji','+679'],
  ['Finland','+358'],
  ['France','+33'],
  ['French Guiana','+594'],
  ['French Polynesia','+689'],
  ['Gabon','+241'],
  ['Georgia','+995'],
  ['Germany','+49'],
  ['Ghana','+233'],
  ['Gibraltar','+350'],
  ['Greece','+30'],
  ['Greenland','+299'],
  ['Grenada','+1473'],
  ['Guadeloupe','+590'],
  ['Guam','+1671'],
  ['Guatemala','+502'],
  ['Guernsey','+44'],
  ['Guinea','+224'],
  ['Guinea-Bissau','+245'],
  ['Guyana','+592'],
  ['Haiti','+509'],
  ['Honduras','+504'],
  ['Hong Kong','+852'],
  ['Hungary','+36'],
  ['Iceland','+354'],
  ['India','+91'],
  ['Indonesia','+62'],
  ['Iran','+98'],
  ['Iraq','+964'],
  ['Ireland','+353'],
  ['Isle of Man','+44'],
  ['Israel','+972'],
  ['Italy','+39'],
  ['Ivory Coast','+225'],
  ['Jamaica','+1876'],
  ['Japan','+81'],
  ['Jersey','+44'],
  ['Jordan','+962'],
  ['Kazakhstan','+76'],
  ['Kenya','+254'],
  ['Kiribati','+686'],
  ['Kuwait','+965'],
  ['Kyrgyzstan','+996'],
  ['Laos','+856'],
  ['Latvia','+371'],
  ['Lebanon','+961'],
  ['Lesotho','+266'],
  ['Liberia','+231'],
  ['Libya','+218'],
  ['Liechtenstein','+423'],
  ['Lithuania','+370'],
  ['Luxembourg','+352'],
  ['Macau','+853'],
  ['Madagascar','+261'],
  ['Malawi','+265'],
  ['Malaysia','+60'],
  ['Maldives','+960'],
  ['Mali','+223'],
  ['Malta','+356'],
  ['Marshall Islands','+692'],
  ['Martinique','+596'],
  ['Mauritania','+222'],
  ['Mauritius','+230'],
  ['Mayotte','+262'],
  ['Mexico','+52'],
  ['Moldova','+373'],
  ['Monaco','+377'],
  ['Mongolia','+976'],
  ['Montserrat','+1664'],
  ['Morocco','+212'],
  ['Mozambique','+258'],
  ['Namibia','+264'],
  ['Nauru','+674'],
  ['Nepal','+977'],
  ['Netherlands','+31'],
  ['New Caledonia','+687'],
  ['New Zealand','+64'],
  ['Nicaragua','+505'],
  ['Niger','+227'],
  ['Nigeria','+234'],
  ['Niue','+683'],
  ['Norfolk Island','+672'],
  ['North Korea','+850'],
  ['Northern Mariana Islands','+1670'],
  ['Norway','+47'],
  ['Oman','+968'],
  ['Pakistan','+92'],
  ['Palau','+680'],
  ['Panama','+507'],
  ['Papua New Guinea','+675'],
  ['Paraguay','+595'],
  ['Peru','+51'],
  ['Philippines','+63'],
  ['Pitcairn Islands','+64'],
  ['Poland','+48'],
  ['Portugal','+351'],
  ['Puerto Rico','+1787'],
  ['Qatar','+974'],
  ['Republic of Macedonia','+389'],
  ['Republic of the Congo','+242'],
  ['Romania','+40'],
  ['Russia','+7'],
  ['Rwanda','+250'],
  ['Réunion','+262'],
  ['Saint Helena','+290'],
  ['Saint Kitts and Nevis','+1869'],
  ['Saint Lucia','+1758'],
  ['Saint Pierre and Miquelon','+508'],
  ['Saint Vincent and the Grenadines','+1784'],
  ['Samoa','+685'],
  ['San Marino','+378'],
  ['Saudi Arabia','+966'],
  ['Senegal','+221'],
  ['Serbia','+381'],
  ['Seychelles','+248'],
  ['Sierra Leone','+232'],
  ['Singapore','+65'],
  ['Slovakia','+421'],
  ['Slovenia','+386'],
  ['Solomon Islands','+677'],
  ['Somalia','+252'],
  ['South Africa','+27'],
  ['South Georgia','+500'],
  ['South Korea','+82'],
  ['South Sudan','+211'],
  ['Spain','+34'],
  ['Sri Lanka','+94'],
  ['Sudan','+249'],
  ['Suriname','+597'],
  ['Svalbard and Jan Mayen','+4779'],
  ['Swaziland','+268'],
  ['Sweden','+46'],
  ['Switzerland','+41'],
  ['Syria','+963'],
  ['São Tomé and Príncipe','+239'],
  ['Taiwan','+886'],
  ['Tajikistan','+992'],
  ['Tanzania','+255'],
  ['Thailand','+66'],
  ['The Bahamas','+1242'],
  ['The Gambia','+220'],
  ['Togo','+228'],
  ['Tokelau','+690'],
  ['Tonga','+676'],
  ['Trinidad and Tobago','+1868'],
  ['Tunisia','+216'],
  ['Turkey','+90'],
  ['Turkmenistan','+993'],
  ['Tuvalu','+688'],
  ['Uganda','+256'],
  ['United Arab Emirates','+971'],
  ['United Kingdom','+44'],
  ['United States','+1'],
  ['Uruguay','+598'],
  ['Uzbekistan','+998'],
  ['Vanuatu','+678'],
  ['Venezuela','+58'],
  ['Vietnam','+84'],
  ['Wallis and Futuna','+681'],
  ['Western Sahara','+212'],
  ['Yemen','+967'],
  ['Zambia','+260'],
  ['Zimbabwe','+263']
];
function countryCallingOptions(selected = '+380') {
  const current = /^\+\d{1,4}$/.test(String(selected || '')) ? String(selected) : '+380';
  let firstSelected = false;
  return COUNTRY_CALLING_CODES.map(([name, code]) => {
    const isSelected = !firstSelected && code === current;
    if (isSelected) firstSelected = true;
    return `<option value="${esc(code)}"${isSelected ? ' selected' : ''}>${esc(name)} (${esc(code)})</option>`;
  }).join('');
}
function registerPage(message = '', values = {}) {
  const marketingChecked = values.marketingConsent === 'on' || values.marketingConsent === true ? ' checked' : '';
  const termsChecked = values.termsAccepted === 'on' || values.termsAccepted === true ? ' checked' : '';
  const selectedCountry = values.countryCode || '+380';
  return publicAuthPage('Create account', `<section class="auth-card auth-single"><h2 class="title">Create your account</h2>${message ? `<p class="notice danger">${esc(message)}</p>` : ''}<form method="post" action="/register" novalidate data-register-form><div class="auth-field" data-field="fullName"><label>Full name</label><input name="fullName" value="${esc(values.fullName || '')}" autocomplete="name" maxlength="255" required placeholder="Your Name"><small class="auth-help">Enter your first and last name.</small><div class="field-error" aria-live="polite"></div></div><div class="auth-field" data-field="companyName"><label>Company name</label><input name="companyName" value="${esc(values.companyName || '')}" autocomplete="organization" minlength="2" maxlength="255" required placeholder="Example Media LLC"><small class="auth-help">2–255 characters.</small><div class="field-error" aria-live="polite"></div></div><div class="auth-field" data-field="phone"><label>Phone number</label><div class="phone-row"><select name="countryCode" autocomplete="tel-country-code" required>${countryCallingOptions(selectedCountry)}</select><input name="phone" type="tel" value="${esc(values.phone || '')}" autocomplete="tel-national" inputmode="numeric" pattern="[0-9]+" maxlength="15" required placeholder="671234567" title="Digits only" data-digits-only onbeforeinput="if(event.data && /[^0-9]/.test(event.data)) event.preventDefault()" oninput="this.value=this.value.replace(/[^0-9]/g,'').slice(0,15)" onpaste="setTimeout(()=>{this.value=this.value.replace(/[^0-9]/g,'').slice(0,15)},0)"></div><small class="auth-help">Choose the country code and enter digits only.</small><div class="field-error" aria-live="polite"></div></div><div class="auth-field" data-field="email"><label>Email</label><input name="email" value="${esc(values.email || '')}" autocomplete="email" minlength="5" maxlength="255" required placeholder="you@example.com"><small class="auth-help">Use a valid email address with @.</small><div class="field-error" aria-live="polite"></div></div><div class="auth-field" data-field="password"><label>Password</label><input name="password" type="password" autocomplete="new-password" minlength="8" maxlength="20" required placeholder="8–20 characters"><small class="auth-help">8–20 characters, at least one letter and one number.</small><div class="field-error" aria-live="polite"></div></div><div class="auth-field" data-field="confirmPassword"><label>Confirm password</label><input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="20" required placeholder="Repeat password"><div class="field-error" aria-live="polite"></div></div><label class="auth-check" data-field="termsAccepted"><input type="checkbox" name="termsAccepted" required${termsChecked}> <span>I agree to the <a href="/terms.html" target="_blank" rel="noopener">Terms of Use</a>.</span></label><div class="field-error field-error-check" data-error-for="termsAccepted" aria-live="polite"></div><label class="auth-check"><input type="checkbox" name="marketingConsent"${marketingChecked}> <span>I agree to receive product updates and beta onboarding emails.</span></label><button class="btn blue" style="width:100%">Create account</button></form><script>(function(){var form=document.querySelector('[data-register-form]');if(!form)return;var validators={fullName:function(){var v=form.fullName.value.trim();return v?'':'Full name is required.';},companyName:function(){var v=form.companyName.value.trim();if(!v)return 'Company name is required.';return v.length>=2&&v.length<=255?'':'Company name must be 2–255 characters.';},phone:function(){var v=form.phone.value.trim();if(!v)return 'Phone number is required.';if(/[^0-9]/.test(v))return 'Phone number must contain digits only.';return v.length>=4&&v.length<=15?'':'Phone number must contain 4–15 digits after the country code.';},email:function(){var v=form.email.value.trim();if(!v)return 'Email is required.';return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)?'':'Enter a valid email address with @.';},password:function(){var v=form.password.value;if(!v)return 'Password is required.';return v.length>=8&&v.length<=20&&/[A-Za-z]/.test(v)&&/[0-9]/.test(v)?'':'Password must be 8–20 characters and include at least one letter and one number.';},confirmPassword:function(){var v=form.confirmPassword.value;if(!v)return 'Confirm password is required.';return v===form.password.value?'':'Passwords do not match.';},termsAccepted:function(){return form.termsAccepted.checked?'':'You must accept the Terms of Use.';}};function fieldBox(name){return form.querySelector('[data-field="'+name+'"]');}function errorBox(name){return form.querySelector('[data-error-for="'+name+'"]')||(fieldBox(name)&&fieldBox(name).querySelector('.field-error'));}function setState(name,msg){var box=fieldBox(name),err=errorBox(name);if(err)err.textContent=msg||'';if(box){box.classList.toggle('invalid',!!msg);box.classList.toggle('valid',!msg);}return !msg;}function validate(name){return setState(name,validators[name]());}Object.keys(validators).forEach(function(name){var el=form[name];if(!el)return;var ev=el.type==='checkbox'?'change':'input';el.addEventListener(ev,function(){if(name==='phone')el.value=el.value.replace(/[^0-9]/g,'').slice(0,15);validate(name);if(name==='password'&&form.confirmPassword.value)validate('confirmPassword');});el.addEventListener('blur',function(){validate(name);});});form.addEventListener('submit',function(e){var ok=true;Object.keys(validators).forEach(function(name){if(!validate(name))ok=false;});if(!ok){e.preventDefault();var first=form.querySelector('.auth-field.invalid input,.auth-check.invalid input');if(first)first.focus();}});})();</script><div class="auth-divider">or</div>${googleButton('Continue with Google')}<p class="muted auth-centered-note">Already have an account? <a href="/login">Login</a>.</p></section>`, 'login');
}
function clientLoginPage(message = '', values = {}, successMessage = '') {
  return publicAuthPage('Login', `<section class="auth-card auth-single"><h2 class="title">Login</h2><p class="lead">Login to your account.</p>${successMessage ? `<p class="notice">${esc(successMessage)}</p>` : ''}${message ? `<p class="notice danger">${esc(message)}</p>` : ''}<form method="post" action="/login"><div class="auth-field"><label>Email</label><input name="email" value="${esc(values.email || '')}" autocomplete="username" minlength="5" maxlength="255" required placeholder="you@example.com"></div><div class="auth-field"><label>Password</label><input name="password" type="password" autocomplete="current-password" maxlength="20" required placeholder="Your password"></div><button class="btn blue" style="width:100%">Login</button></form><p class="auth-forgot"><a href="/reset-password">Forgot password?</a></p><div class="auth-divider">or</div>${googleButton('Continue with Google')}<p class="muted auth-centered-note">No account yet? <a href="/register">Create account</a>.</p></section>`, 'login');
}

function resetPasswordPage(message = '', values = {}, ok = false) {
  if (ok) {
    const successMessage = message || 'A one-time reset link was sent.';
    return publicAuthPage('Reset link sent', `<section class="auth-card auth-single"><h2 class="title">${esc(successMessage)}</h2><p class="muted auth-centered-note"><a href="/login">Back to login</a></p></section>`, 'login');
  }
  return publicAuthPage('Reset password', `<section class="auth-card auth-single"><h2 class="title">Reset password</h2><p class="lead auth-lead">Enter your account email and we will send a one-time reset link.</p>${message ? `<p class="notice danger">${esc(message)}</p>` : ''}<form method="post" action="/reset-password" novalidate><div class="auth-field"><label>Email</label><input name="email" value="${esc(values.email || '')}" autocomplete="email" minlength="5" maxlength="255" required placeholder="you@example.com"><small class="auth-help">Use a valid email address with @.</small></div><button class="btn blue" style="width:100%">Send reset link</button></form><p class="muted auth-centered-note">Remembered it? <a href="/login">Login</a>.</p></section>`, 'login');
}
function newPasswordPage(token, message = '', values = {}) {
  return publicAuthPage('Create new password', `<section class="auth-card auth-single"><h2 class="title">Create new password</h2><p class="lead auth-lead">Enter and confirm your new account password.</p>${message ? `<p class="notice danger">${esc(message)}</p>` : ''}<form method="post" action="/reset-password/${esc(token)}" novalidate><div class="auth-field"><label>New password</label><input name="password" type="password" autocomplete="new-password" minlength="8" maxlength="20" required placeholder="8–20 characters"><small class="auth-help">8–20 characters, at least one letter and one number.</small></div><div class="auth-field"><label>Confirm password</label><input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="20" required placeholder="Repeat new password"></div><button class="btn blue" style="width:100%">Update password</button></form><p class="muted auth-centered-note"><a href="/login">Back to login</a></p></section>`, 'login');
}

function chartBars(values) {
  const nums = values.length ? values.map(v => Math.max(0, Number(v) || 0)) : [2,4,3,5,4,7,5];
  const max = Math.max(1, ...nums);
  return `<div class="mini-chart" aria-label="Overlay trend chart">${nums.map(v => `<span style="--h:${Math.max(8, Math.round((v/max)*92))}%" title="${esc(String(v))}"></span>`).join('')}</div>`;
}
function analyticsPeriod(raw = 'today') {
  const value = String(raw || 'today').toLowerCase();
  if (['today','day'].includes(value)) return 'today';
  if (value === 'week') return 'week';
  if (value === 'month') return 'month';
  if (value === 'all') return 'all';
  return 'today';
}
function analyticsView(raw = 'count') {
  const value = String(raw || 'count').toLowerCase();
  if (['percent','percentage'].includes(value)) return 'percent';
  if (['standard','count','counts'].includes(value)) return 'count';
  return 'count';
}
function analyticsPeriodLabel(period) {
  return ({ today: 'Today', week: 'Last 7 days', month: 'Last 30 days', all: 'All time' })[analyticsPeriod(period)] || 'Today';
}
function analyticsPeriodWhere(period) {
  const p = analyticsPeriod(period);
  if (p === 'today') return `time >= date_trunc('day', now())`;
  if (p === 'week') return `time >= now() - interval '7 days'`;
  if (p === 'month') return `time >= now() - interval '30 days'`;
  return 'true';
}
function fmtNumber(value) { return Number(value || 0).toLocaleString('en-US'); }
function trendPointLabel(row, period = '') {
  const raw = row && row.bucket ? String(row.bucket) : '';
  if (!raw) return '';
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return raw.slice(0, 10);
  if (analyticsPeriod(period) === 'today') return `${String(d.getHours()).padStart(2, '0')}:00`;
  return d.toISOString().slice(5, 10);
}
function analyticsBucketRows(buckets = [], period = 'week') {
  const rows = Array.isArray(buckets) ? buckets : [];
  if (!rows.length) return '<tr><td colspan="4" class="muted">No trend data yet.</td></tr>';
  const sorted = rows.slice().sort((a, b) => String(a.bucket || '').localeCompare(String(b.bucket || '')));
  const maxRate = Math.max(...sorted.map(row => Number(row.overlayRate || 0)));
  return sorted.map(row => {
    const rate = Number(row.overlayRate || 0);
    const badge = rate === maxRate && maxRate > 0 ? ' <span class="pill warn">highest</span>' : '';
    return `<tr><td>${esc(row.label || trendPointLabel(row, period))}${badge}</td><td>${fmtNumber(row.visits)}</td><td>${fmtNumber(row.overlay)}</td><td>${rate}%</td></tr>`;
  }).join('');
}
function fallbackProjectAnalytics(project, period = 'today') {
  const st = statsFor(project.id);
  const p = analyticsPeriod(period);
  const today = dayKey();
  const daysBack = p === 'week' ? 7 : p === 'month' ? 30 : 0;
  let rows = Object.entries(st.daily || {}).map(([day, row]) => ({ day, row })).sort((a,b) => a.day.localeCompare(b.day));
  if (p === 'today') rows = rows.filter(x => x.day === today);
  else if (p !== 'all') {
    const cutoff = new Date(Date.now() - (daysBack - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    rows = rows.filter(x => x.day >= cutoff);
  }
  const summary = rows.length ? rows.reduce((acc, x) => {
    acc.visits += Number(x.row.visits || 0);
    acc.overlay += Number(x.row.overlayShown || 0);
    acc.events += Number(x.row.events || 0);
    acc.unlocks += Number(x.row.contentUnlocked || 0);
    return acc;
  }, { visits: 0, overlay: 0, events: 0, unlocks: 0 }) : { visits: Number(st.visits || 0), overlay: Number(st.overlayShown || 0), events: Number(st.events || 0), unlocks: Number(st.contentUnlocked || 0) };
  const buckets = (rows.length ? rows : [{ day: today, row: { visits: summary.visits, overlayShown: summary.overlay, events: summary.events } }]).map(x => ({ bucket: `${x.day}T00:00:00.000Z`, label: x.day, visits: Number(x.row.visits || 0), overlay: Number(x.row.overlayShown || 0), events: Number(x.row.events || 0), overlayRate: percent(Number(x.row.overlayShown || 0), Number(x.row.visits || 0)) }));
  const domainRows = Object.entries(st.domains || {}).sort((a,b) => Number(b[1])-Number(a[1])).slice(0, 10).map(([domain, events]) => ({ domain, events: Number(events || 0), visits: 0, overlay: 0, overlayRate: 0 }));
  return { source: 'json_fallback', period: p, summary: Object.assign(summary, { overlayRate: percent(summary.overlay, summary.visits) }), buckets, domains: domainRows, error: '' };
}
async function loadProjectAnalytics(project, period = 'today') {
  const p = analyticsPeriod(period);
  if (await ensureAppDbReady()) {
    try {
      const where = analyticsPeriodWhere(p);
      const bucketExpr = p === 'today' ? `date_trunc('hour', time)` : `date_trunc('day', time)`;
      const summaryRes = await appDbPool.query(`
        SELECT
          count(*)::bigint AS events,
          count(*) FILTER (WHERE type='visit')::bigint AS visits,
          count(*) FILTER (WHERE type='overlay_shown')::bigint AS overlay,
          count(*) FILTER (WHERE type='content_unlocked')::bigint AS unlocks
        FROM avp_events
        WHERE project_id=$1 AND ${where}
      `, [project.id]);
      const bucketRes = await appDbPool.query(`
        SELECT ${bucketExpr} AS bucket,
          count(*)::bigint AS events,
          count(*) FILTER (WHERE type='visit')::bigint AS visits,
          count(*) FILTER (WHERE type='overlay_shown')::bigint AS overlay
        FROM avp_events
        WHERE project_id=$1 AND ${where}
        GROUP BY bucket
        ORDER BY bucket ASC
        LIMIT 180
      `, [project.id]);
      const domainRes = await appDbPool.query(`
        SELECT COALESCE(NULLIF(domain,''),'unknown') AS domain,
          count(*)::bigint AS events,
          count(*) FILTER (WHERE type='visit')::bigint AS visits,
          count(*) FILTER (WHERE type='overlay_shown')::bigint AS overlay
        FROM avp_events
        WHERE project_id=$1 AND ${where}
        GROUP BY domain
        ORDER BY events DESC
        LIMIT 10
      `, [project.id]);
      const sr = summaryRes.rows[0] || {};
      const summary = { events: Number(sr.events || 0), visits: Number(sr.visits || 0), overlay: Number(sr.overlay || 0), unlocks: Number(sr.unlocks || 0) };
      summary.overlayRate = percent(summary.overlay, summary.visits);
      const buckets = bucketRes.rows.map(row => {
        const visits = Number(row.visits || 0);
        const overlay = Number(row.overlay || 0);
        return { bucket: row.bucket ? new Date(row.bucket).toISOString() : '', label: trendPointLabel(row, p), events: Number(row.events || 0), visits, overlay, overlayRate: percent(overlay, visits) };
      });
      const domains = domainRes.rows.map(row => {
        const visits = Number(row.visits || 0);
        const overlay = Number(row.overlay || 0);
        return { domain: row.domain || 'unknown', events: Number(row.events || 0), visits, overlay, overlayRate: percent(overlay, visits) };
      });
      return { source: 'postgres', period: p, summary, buckets, domains, error: '' };
    } catch (err) {
      structuredLog('error', 'project_full_analytics_postgres_failed', { projectId: project.id, period: p, error: err.message, appDb: appDbPublicStatus() });
      const fallback = fallbackProjectAnalytics(project, p);
      fallback.error = err.message;
      return fallback;
    }
  }
  const fallback = fallbackProjectAnalytics(project, p);
  fallback.error = APP_DB_CONFIGURED ? 'postgres_not_connected' : 'database_url_missing';
  return fallback;
}
function fullAnalyticsSvgChart(buckets = [], view = 'count') {
  const rows = Array.isArray(buckets) && buckets.length ? buckets : [{ label: 'No data', visits: 0, overlay: 0, overlayRate: 0 }];
  const w = 920, h = 260, pad = 34;
  const metric = analyticsView(view);
  const maxCount = Math.max(1, ...rows.map(r => Number(r.visits || 0)), ...rows.map(r => Number(r.overlay || 0)));
  const maxPercent = 100;
  const x = i => rows.length === 1 ? w / 2 : pad + (i * (w - pad * 2) / (rows.length - 1));
  const yCount = v => h - pad - (Number(v || 0) / maxCount) * (h - pad * 2);
  const yPercent = v => h - pad - (Number(v || 0) / maxPercent) * (h - pad * 2);
  const points = (field, yFn) => rows.map((r, i) => `${x(i).toFixed(1)},${yFn(r[field]).toFixed(1)}`).join(' ');
  const labelEvery = rows.length <= 8 ? 1 : rows.length <= 16 ? 2 : Math.ceil(rows.length / 8);
  const labels = rows.map((r, i) => {
    if (i !== 0 && i !== rows.length - 1 && i % labelEvery !== 0) return '';
    return `<text x="${x(i).toFixed(1)}" y="248" text-anchor="middle" font-size="11" fill="#766f66">${esc(String(r.label || i + 1))}</text>`;
  }).join('');
  const countDots = rows.map((r,i)=>`<circle cx="${x(i).toFixed(1)}" cy="${yCount(r.visits).toFixed(1)}" r="3.5" fill="#236ca8"><title>${esc(r.label || '')}: visits ${fmtNumber(r.visits)}</title></circle><circle cx="${x(i).toFixed(1)}" cy="${yCount(r.overlay).toFixed(1)}" r="3.5" fill="#7b5cff"><title>${esc(r.label || '')}: overlay ${fmtNumber(r.overlay)} (${r.overlayRate || 0}%)</title></circle>`).join('');
  const percentDots = rows.map((r,i)=>`<circle cx="${x(i).toFixed(1)}" cy="${yPercent(r.overlayRate).toFixed(1)}" r="4" fill="#7b5cff"><title>${esc(r.label || '')}: ${r.overlayRate || 0}% overlay rate</title></circle>`).join('');
  if (metric === 'percent') {
    return `<div class="full-chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Overlay percentage trend"><line x1="${pad}" y1="${yPercent(100).toFixed(1)}" x2="${w-pad}" y2="${yPercent(100).toFixed(1)}" stroke="rgba(20,20,20,.08)"/><line x1="${pad}" y1="${yPercent(50).toFixed(1)}" x2="${w-pad}" y2="${yPercent(50).toFixed(1)}" stroke="rgba(20,20,20,.08)"/><line x1="${pad}" y1="${yPercent(0).toFixed(1)}" x2="${w-pad}" y2="${yPercent(0).toFixed(1)}" stroke="rgba(20,20,20,.12)"/><polyline points="${points('overlayRate', yPercent)}" fill="none" stroke="#7b5cff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${percentDots}${labels}</svg><div class="chart-legend"><span><i class="violet"></i>Overlay rate by selected period</span></div></div>`;
  }
  return `<div class="full-chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Overlay and traffic trend"><line x1="${pad}" y1="${h-pad}" x2="${w-pad}" y2="${h-pad}" stroke="rgba(20,20,20,.12)"/><polyline points="${points('visits', yCount)}" fill="none" stroke="#236ca8" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><polyline points="${points('overlay', yCount)}" fill="none" stroke="#7b5cff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${countDots}${labels}</svg><div class="chart-legend"><span><i></i>Total traffic</span><span><i class="violet"></i>Overlay shown</span></div></div>`;
}
function analyticsControls(action, period, view) {
  const p = analyticsPeriod(period);
  const v = analyticsView(view);
  return `<form method="get" action="${esc(action)}" class="full-controls"><div class="field"><label>View</label><select name="view"><option value="count" ${v==='count'?'selected':''}>Count</option><option value="percent" ${v==='percent'?'selected':''}>Percent</option></select></div><div class="field"><label>Period</label><select name="period"><option value="today" ${p==='today'?'selected':''}>Today</option><option value="week" ${p==='week'?'selected':''}>Week</option><option value="month" ${p==='month'?'selected':''}>Month</option><option value="all" ${p==='all'?'selected':''}>All time</option></select></div><button class="btn blue">Apply</button></form>`;
}
async function clientProjectFullViewPage(client, project, opts = {}) {
  const period = analyticsPeriod(opts.period || 'today');
  const view = analyticsView(opts.view || 'count');
  const analytics = await loadProjectAnalytics(project, period);
  const s = analytics.summary || { visits: 0, overlay: 0, events: 0, overlayRate: 0 };
  const sourceText = analytics.source === 'postgres' ? 'PostgreSQL remote DB' : `Local JSON fallback · ${analytics.error || 'database not connected'}`;
  const overlayMain = view === 'percent' ? `${s.overlayRate}%` : fmtNumber(s.overlay);
  const trafficMain = view === 'percent' ? '100%' : fmtNumber(s.visits);
  const domainRows = (analytics.domains || []).map(row => `<tr><td>${esc(row.domain)}</td><td>${fmtNumber(row.visits)}</td><td>${fmtNumber(row.overlay)}</td><td>${row.overlayRate}%</td></tr>`).join('') || '<tr><td colspan="4">No domain data yet.</td></tr>';
  const bucketRows = analyticsBucketRows(analytics.buckets || [], period);
  const breakdownTitle = period === 'today' ? 'Hourly breakdown' : 'Daily breakdown';
  const analyticsHref = `/account/projects/${encodeURIComponent(project.id)}/analytics`;
  const sourceClass = analytics.source === 'postgres' ? 'ok' : 'muted';
  const sourceNote = analytics.source === 'postgres'
    ? `Source: PostgreSQL · table <code>avp_events</code>`
    : `Source: local fallback · connect DATABASE_URL for remote DB`;
  const dbNotice = `<p class="analytics-source ${sourceClass}">${sourceNote}</p>`;
  const css = `<style>.analytics-page{max-width:1180px;margin:0 auto}.analytics-page-narrow{max-width:1040px}.analytics-hero{position:relative;overflow:hidden;background:linear-gradient(135deg,rgba(255,255,255,.82),rgba(223,240,255,.55));border:1px solid var(--line);border-radius:24px;padding:22px;box-shadow:0 20px 70px rgba(72,59,39,.08)}.analytics-hero .title{font-size:30px;line-height:1.16}.analytics-hero .lead{max-width:760px}.analytics-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}.full-controls{display:grid;grid-template-columns:minmax(0,220px) minmax(0,220px) auto;gap:14px;align-items:end}.analytics-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.analytics-kpi{min-height:132px}.analytics-kpi .label{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.7px}.analytics-kpi .num{font-size:34px;font-weight:600;letter-spacing:-1px;margin:7px 0}.full-chart{padding:16px;border:1px solid var(--line);border-radius:22px;background:rgba(255,255,255,.7);overflow:hidden}.full-chart svg{width:100%;height:auto;display:block}.chart-legend{display:flex;gap:18px;flex-wrap:wrap;color:var(--muted);font-size:13px;margin:8px 0 0}.chart-legend span{display:inline-flex;align-items:center;gap:7px}.chart-legend i{width:26px;height:4px;border-radius:99px;background:#236ca8;display:inline-block}.chart-legend i.violet{background:#7b5cff}.analytics-source{display:inline-flex;align-items:center;gap:8px;font-size:13px;line-height:1.5;margin:12px 0 0;padding:8px 10px;border-radius:999px;background:rgba(255,255,255,.62);border:1px solid var(--line)}.analytics-source.ok{color:var(--good);background:rgba(226,245,234,.72)}.analytics-source.muted{color:var(--muted)}.analytics-source code{font-size:12px}.domain-card table td:nth-child(n+2),.domain-card table th:nth-child(n+2),.breakdown-card table td:nth-child(n+2),.breakdown-card table th:nth-child(n+2){text-align:right}.project-code{font-size:12px}.analytics-page p,.analytics-page td{font-weight:400}.analytics-page a,.analytics-page label,.analytics-page button,.analytics-page .pill,.analytics-page .account-chip,.analytics-page .num{font-weight:600}.analytics-page h1,.analytics-page h2,.analytics-page h3{font-weight:700}@media(max-width:900px){.analytics-page{max-width:100%}.full-controls,.analytics-kpis{grid-template-columns:1fr}.analytics-kpi .num{font-size:30px}}</style>`;
  return appShell('Analytics', `${css}<div class="analytics-page"><section class="analytics-hero"><p><a href="/account">← Back to account</a></p><h1 class="title">Analytics</h1><p class="lead muted">${esc(project.name)} · overlay traffic, total visits, domain breakdown and project connection details.</p><div class="account-summary"><span class="account-chip">${esc(formatProjectDomains(project.allowedDomains || []))}</span><span class="account-chip">${esc(analyticsPeriodLabel(period))}</span><span class="account-chip">${view === 'percent' ? 'Percent view' : 'Count view'}</span></div><div class="analytics-actions"><a class="btn blue" href="/docs.html">Open integration docs</a></div>${dbNotice}</section><section class="card section">${analyticsControls(analyticsHref, period, view)}</section><section class="grid analytics-kpis section"><div class="card analytics-kpi"><div class="label">Overlay shown</div><div class="num">${overlayMain}</div><p class="muted">${fmtNumber(s.overlay)} overlay events · ${s.overlayRate}% of visits</p></div><div class="card analytics-kpi"><div class="label">Total traffic</div><div class="num">${trafficMain}</div><p class="muted">${fmtNumber(s.visits)} visits for ${esc(analyticsPeriodLabel(period).toLowerCase())}</p></div><div class="card analytics-kpi"><div class="label">Events</div><div class="num">${fmtNumber(s.events)}</div><p class="muted">${fmtNumber(s.unlocks || 0)} unlock events recorded</p></div></section><section class="card section"><h2>Trend</h2><p class="muted">Compare overlay volume with total traffic for the selected period.</p>${fullAnalyticsSvgChart(analytics.buckets, view)}</section><section class="card section breakdown-card"><h2>${breakdownTitle}</h2><p class="muted">The table shows exactly where overlay percentage is higher for the selected period.</p><table class="table"><thead><tr><th>Period</th><th>Visits</th><th>Overlay</th><th>Rate</th></tr></thead><tbody>${bucketRows}</tbody></table></section><section class="split section"><div class="card domain-card"><h2>Domains</h2><table class="table"><thead><tr><th>Domain</th><th>Visits</th><th>Overlay</th><th>Rate</th></tr></thead><tbody>${domainRows}</tbody></table></div><div class="card"><h2>Connection</h2><p><strong>Public key:</strong></p><pre class="project-code">${esc(project.publicKey)}</pre><p><strong>Install snippet:</strong></p><pre class="project-code">${esc(`<script src="${PUBLIC_BASE_URL}/sdk/${project.sdkVersion || DEFAULT_SDK_VERSION}/${project.publicKey}.js" async></script>`)}</pre><p class="muted">Allowed domains: ${esc(formatProjectDomains(project.allowedDomains || []))}</p></div></section></div>`, client);
}
function clientProjectGradient(project) {
  const value = project.ui?.gradient || project.ui?.color || 'violet';
  const map = {
    violet: 'linear-gradient(135deg,#1d102f,#7b5cff,#4a90d9)',
    blue: 'linear-gradient(135deg,#10263f,#3f88c5,#8bd3ff)',
    terra: 'linear-gradient(135deg,#3a1f16,#c98555,#f0c28a)',
    green: 'linear-gradient(135deg,#10291e,#2f8d65,#a8dfbf)'
  };
  return map[value] || map.violet;
}
function modalBlock(kind) {
  if (kind === 'login') return `<div class="client-popover login-popover" data-popover><button class="x" onclick="this.parentElement.remove()" aria-label="Close">×</button><h3>Login successful</h3><p>Client portal is ready.</p></div>`;
  if (kind === 'registered') return `<div class="client-popover" data-popover><button class="x" onclick="this.parentElement.remove()" aria-label="Close">×</button><h3>Beta Trial activated</h3><p>Your free 1-month Beta Trial is active: 1 project and 500k checks included.</p></div>`;
  if (kind === 'passwordReset') return `<div class="client-popover" data-popover><button class="x" onclick="this.parentElement.remove()" aria-label="Close">×</button><h3>Password updated</h3><p>You are logged in.</p></div>`;
  return '';
}
async function projectAccountCard(project) {
  const analytics = await loadProjectAnalytics(project, 'today');
  const st = analytics.summary || { visits: 0, overlay: 0, overlayRate: 0 };
  const statusText = project.enabled === false ? 'paused' : 'active';
  const fullUrl = `/account/projects/${encodeURIComponent(project.id)}/analytics`;
  const snippet = `<script src="${PUBLIC_BASE_URL}/sdk/v1/${project.publicKey}.js" async></script>`;
  return `<article class="account-project-card" style="--project-gradient:${esc(clientProjectGradient(project))}">
    <div class="account-project-top">
      <div>
        <h3>${esc(project.name)}</h3>
        <p class="project-domains">${esc(formatProjectDomains(project.allowedDomains || []))}</p>
      </div>
      <div class="project-badges"><span class="pill ${statusText === 'active' ? 'good' : 'bad'}">${statusText}</span><span class="pill">${esc(planLabel(project.planId || 'beta'))}</span></div>
    </div>
    <pre class="project-install-snippet">${esc(snippet)}</pre>
    <div class="account-project-bottom">
      <a class="btn blue" href="${esc(fullUrl)}">Analytics</a>
      <p class="project-mini-stats">Overlay: ${fmtNumber(st.overlay || 0)} · Visits: ${fmtNumber(st.visits || 0)} · Rate: ${Number(st.overlayRate || 0)}%</p>
    </div>
  </article>`;
}

async function accountPage(client, message = '', opts = {}) {
  const linkedProjects = await ensureClientProjects(client.id);
  const projectCards = linkedProjects.length
    ? (await Promise.all(linkedProjects.map(projectAccountCard))).join('')
    : `<article class="account-project-card empty-project-card"><h3>No projects yet</h3><p class="muted">Create your first project and it will be stored in PostgreSQL for this account.</p></article>`;
  const onboarding = (opts.onboarding || linkedProjects.length === 0) ? `<section class="soft-panel section"><h2>First setup tutorial</h2><div class="grid cols3"><div><h3>1. Enable MFA</h3><p class="muted">Open the security area after launch and protect the account with authenticator MFA.</p></div><div><h3>2. Create project</h3><p class="muted">Add a project name, website URL, ad slot selector, and protected content selector.</p></div><div><h3>3. Analytics</h3><p class="muted">Review overlay traffic from the database by today, week, month, or all time.</p></div></div></section>` : '';
  const pop = opts.registered ? modalBlock('registered') : opts.passwordReset ? modalBlock('passwordReset') : opts.loginSuccess ? modalBlock('login') : '';
  const projectCardCss = `<style>
    .account-projects-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin-top:14px}
    .account-project-card{position:relative;overflow:hidden;background:rgba(255,255,255,.74);border:1px solid var(--line);border-radius:24px;padding:20px;box-shadow:0 20px 70px rgba(72,59,39,.08);backdrop-filter:blur(10px)}
    .account-project-card:before{content:'';position:absolute;left:0;right:0;top:0;height:7px;background:var(--project-gradient,linear-gradient(90deg,#111,#4a90d9))}
    .account-project-top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-top:4px}
    .account-project-top h3{margin:0 0 7px;font-size:20px;letter-spacing:-.35px}.project-domains{margin:0;color:var(--muted);line-height:1.45;font-size:14px}.project-badges{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.project-install-snippet{margin:16px 0 14px;font-size:12px;border-radius:16px;max-height:116px;overflow:auto}.account-project-bottom{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}.project-mini-stats{margin:0;color:var(--muted);font-size:14px;font-weight:600}.empty-project-card{min-height:150px;display:flex;flex-direction:column;justify-content:center}.portal-project-section h2{margin-bottom:6px}.portal-project-section .lead{margin-top:0}.danger-zone{border-color:rgba(189,63,63,.22);background:rgba(255,245,245,.72)}.danger-zone h2{color:#713333}.danger-btn{color:#713333!important;border-color:rgba(189,63,63,.28)!important}@media(max-width:900px){.account-projects-grid{grid-template-columns:1fr}.account-project-top{display:block}.project-badges{justify-content:flex-start;margin-top:10px}}
  </style>`;
  return appShell('Client account', `${projectCardCss}${pop}<section><h1 class="title">Client account</h1><div class="account-summary"><span class="account-chip">${esc(client.fullName || 'Account owner')}</span><span class="account-chip">${esc(client.email)}</span><span class="account-chip">${esc(client.companyName || 'No company name')}</span><span class="account-chip trial">${esc(planLabel(client.planId || 'beta'))} · ${esc(String(trialSnapshot(client).daysRemaining))} days left</span></div>${message ? `<p class="notice ok">${esc(message)}</p>` : ''}<form method="post" action="/logout" style="display:inline">${clientCsrfInput(client)}<button class="btn ghost">Logout</button></form></section>${onboarding}<section class="grid cols3 section"><div class="card"><h2>Account status</h2><p><span class="pill good">${esc(planLabel(client.planId || 'beta'))} Trial</span></p><p class="muted">Active for 1 month. Included now: 1 project, 500k checks, PostgreSQL analytics, SDK and server verification tests.</p></div><div class="card"><h2>Projects</h2><p class="kpi"><span class="num">${linkedProjects.length}</span></p><p class="muted">Each project has a separate analytics page with overlay and traffic data.</p></div><div class="card"><h2>Database analytics</h2><p class="muted">Analytics reads project data from PostgreSQL when <code>DATABASE_URL</code> and Postgres storage are enabled.</p></div></section><section class="section portal-project-section"><h2>Your projects</h2><p class="lead">Project cards are stored and restored from PostgreSQL for this account.</p><div class="account-projects-grid">${projectCards}</div></section><section class="section"><button class="create-project-tile" type="button" data-open-project-modal>Create Project +</button></section><div class="project-modal" data-project-modal aria-hidden="true"><div class="project-modal-card"><button class="modal-close" type="button" data-close-project-modal aria-label="Close">×</button><h2>Create project</h2><form method="post" action="/account/projects/create">${clientCsrfInput(client)}<div class="row"><div class="field"><label>Project name</label><input name="projectName" required placeholder="My publisher site"></div><div class="field"><label>Website URL or domain</label><input name="domain" required placeholder="example.com or www.example.com/page"></div></div><div class="row"><div class="field"><label>Ad slot selector</label><input name="adContainerSelector" value='[data-adproof-slot="left-sidebar"]'><p class="muted" id="selector-tutorial">Tutorial: press F12, click the element picker arrow, hover the banner, right-click the outer ad container, copy selector, paste it here. You can add your GIF tutorial later.</p></div><div class="field"><label>Element to lock selector</label><input name="protectedSelector" value='[data-adproof-content="protected"]'></div></div><div class="row"><div class="field"><label>Project label color</label><select name="projectColor"><option value="violet">Black violet gradient</option><option value="blue">Blue gradient</option><option value="terra">Warm terracotta</option><option value="green">Soft green</option></select></div><div class="field"><label>Preview colors</label><div class="swatches"><span class="swatch" style="--g:linear-gradient(135deg,#1d102f,#7b5cff,#4a90d9)">Violet</span><span class="swatch" style="--g:linear-gradient(135deg,#10263f,#3f88c5,#8bd3ff)">Blue</span><span class="swatch" style="--g:linear-gradient(135deg,#3a1f16,#c98555,#f0c28a)">Terra</span><span class="swatch" style="--g:linear-gradient(135deg,#10291e,#2f8d65,#a8dfbf)">Green</span></div></div></div><button class="btn blue">Save project</button></form></div></div><script>(function(){var modal=document.querySelector('[data-project-modal]');var open=document.querySelector('[data-open-project-modal]');var close=document.querySelector('[data-close-project-modal]');function show(){if(!modal)return;modal.classList.add('open');modal.setAttribute('aria-hidden','false');}function hide(){if(!modal)return;modal.classList.remove('open');modal.setAttribute('aria-hidden','true');}if(open)open.addEventListener('click',show);if(close)close.addEventListener('click',hide);if(modal)modal.addEventListener('click',function(e){if(e.target===modal)hide();});document.addEventListener('keydown',function(e){if(e.key==='Escape')hide();});})();</script>`, client);
}
async function createClientPortalSession(res, account, redirectTo = '/account') {
  const sid = randomId('cli', 24);
  const sess = { accountId: account.id, createdAt: now(), lastSeen: now(), expiresAt: now() + CLIENT_SESSION_TTL, csrfToken: randomKey('csrf') };
  await saveClientSessionRecord(sid, sess);
  res.writeHead(302, { Location: redirectTo, 'Set-Cookie': `${CLIENT_COOKIE}=${encodeURIComponent(sid)}; ${clientCookieAttrs()}`, 'Cache-Control': 'no-store' });
  return res.end();
}
async function handleClientPortal(req, res, url) {
  if (url.pathname === '/reset-password' && req.method === 'GET') {
    if (url.searchParams.get('sent') === '1') return send(res, 200, resetPasswordPage('A one-time reset link was sent.', {}, true));
    return send(res, 200, resetPasswordPage());
  }
  if (url.pathname === '/reset-password' && req.method === 'POST') {
    const form = await readForm(req);
    const email = normalizeEmail(cleanClientText(form.email || '', 255));
    if (!email || email.length < 5 || email.length > 255 || hasHtmlLikeInput(email) || !emailLooksValid(email)) {
      return send(res, 400, resetPasswordPage('Enter a valid email address with @.', form));
    }
    const lookup = await findClientAccountByEmailDetailed(email);
    if (AUTH_DEBUG_LOGS) {
      structuredLog(lookup.account ? 'log' : 'warn', 'password_reset_account_lookup', {
        requestedEmailMasked: lookup.requestedEmailMasked,
        requestedEmailHash: lookup.requestedEmailHash,
        found: Boolean(lookup.account),
        source: lookup.source,
        authDbFile: lookup.authDbFile,
        authDbExists: lookup.authDbExists,
        dataFile: lookup.dataFile,
        dataFileExists: lookup.dataFileExists,
        accountCount: lookup.accountCount,
        knownAccounts: lookup.knownAccounts,
        stateCandidateCount: lookup.stateCandidateCount,
        stateCandidates: lookup.stateCandidates,
        appDb: appDbPublicStatus()
      });
    }
    const account = lookup.account;
    if (!account) {
      structuredLog('warn', 'password_reset_rejected_unknown_email', { requestedEmailMasked: maskEmail(email), emailHash: emailHash(email), source: lookup.source, accountCount: lookup.accountCount, authDbFile: AUTH_DB_FILE, outboxFile: EMAIL_OUTBOX_FILE, appDb: appDbPublicStatus() });
      appendAudit(req, 'client_password_reset_requested', { emailHash: emailHash(email), found: false, rejected: true, source: lookup.source }, null);
      if (AUTH_REQUIRE_DATABASE_FOR_CLIENT_AUTH && String(lookup.source || '').startsWith('postgres_required')) {
        return send(res, 503, resetPasswordPage('Account database is not connected. Set DATABASE_URL or POSTGRES_URL and restart the server.', form));
      }
      return send(res, 404, resetPasswordPage('We could not find an account with this email. Please check the address or create an account.', form));
    }

    const rawToken = randomId('rst', 24);
    try {
      await savePasswordResetToken(account, rawToken);
    } catch (err) {
      structuredLog('error', 'password_reset_token_save_failed', { emailHash: emailHash(email), accountId: account.id, error: err.message, appDb: appDbPublicStatus() });
      return send(res, 503, resetPasswordPage('Account database is not available. Please check DATABASE_URL or POSTGRES_URL and try again.', form));
    }
    const link = `${PUBLIC_BASE_URL}/reset-password/${encodeURIComponent(rawToken)}`;
    const queued = await sendAppEmail(email, 'Reset your AdProof password', `Use this one-time link to create a new password. The link expires in 1 hour: ${link}`, { accountId: account.id, type: 'password_reset', resetLink: link, expiresIn: '1 hour' });
    structuredLog('log', 'password_reset_email_processed', { emailMasked: maskEmail(email), emailHash: emailHash(email), accountId: account.id, mailId: queued.id, status: queued.status, error: queued.error || '', outboxFile: EMAIL_OUTBOX_FILE, smtp: smtpPublicStatus() });
    appendAudit(req, 'client_password_reset_requested', { emailHash: emailHash(email), found: true, mailStatus: queued.status }, null);
    if (SMTP_ENABLED && queued.status !== 'sent') {
      return send(res, 502, resetPasswordPage(`SMTP did not send the reset email. Status: ${queued.status || 'unknown'}. Check /debug/email-outbox and the server console log.`, form));
    }
    return send(res, 200, resetPasswordPage('A one-time reset link was sent.', {}, true));
  }
  const resetMatch = url.pathname.match(/^\/reset-password\/([^/]+)$/);
  if (resetMatch && req.method === 'GET') {
    const token = decodeURIComponent(resetMatch[1] || '');
    const rec = await loadPasswordResetToken(token);
    if (!resetTokenIsValid(rec)) return send(res, 400, newPasswordPage(token, 'This reset link is invalid or expired.'));
    return send(res, 200, newPasswordPage(token));
  }
  if (resetMatch && req.method === 'POST') {
    const token = decodeURIComponent(resetMatch[1] || '');
    const rec = await loadPasswordResetToken(token);
    if (!resetTokenIsValid(rec)) return send(res, 400, newPasswordPage(token, 'This reset link is invalid or expired.'));
    const form = await readForm(req);
    const validation = validateNewPasswordFields(form || {});
    if (!validation.ok) return send(res, 400, newPasswordPage(token, clientValidationMessage(validation.errors), form));
    const account = await findClientAccountById(rec.accountId);
    if (!account) return send(res, 400, newPasswordPage(token, 'Account not found.'));
    await updateClientPassword(account.id, validation.password);
    await consumePasswordResetToken(token);
    appendAudit(req, 'client_password_reset_completed', { accountId: account.id, email: account.email }, null);
    return createClientPortalSession(res, account, '/account?passwordReset=1');
  }
  if (url.pathname === '/register' && req.method === 'GET') return send(res, 200, registerPage());
  if (url.pathname === '/register' && req.method === 'POST') {
    const form = await readForm(req);
    const validation = validateClientRegistrationFields(form || {});
    if (!validation.ok) return send(res, 400, registerPage('', form));
    const { email, password, companyName, fullName, phone, termsAccepted } = validation;
    if (await findClientAccountByEmail(email)) return send(res, 409, registerPage('An account with this email already exists. Please login or use another email.', form));
    const marketingConsent = form.marketingConsent === 'on' || form.marketingConsent === 'true' || form.marketingConsent === true;
    const account = { id: randomId('acct'), email, fullName, phone, companyName, password: passwordRecord(password), provider: 'password', role: 'client_owner', status: 'trial', planId: 'beta', marketingConsent, marketingConsentAt: marketingConsent ? iso() : '', termsAccepted, termsAcceptedAt: termsAccepted ? iso() : '', emailVerified: false, trialEndsAt: new Date(now() + 30 * 24 * 60 * 60 * 1000).toISOString(), createdAt: iso(), updatedAt: iso() };
    let savedAccount;
    try {
      savedAccount = await createClientAccount(account);
    } catch (err) {
      structuredLog('error', 'client_account_register_failed', { emailMasked: maskEmail(email), emailHash: emailHash(email), error: err.message, appDb: appDbPublicStatus() });
      return send(res, 503, registerPage('Account database is not connected. Set DATABASE_URL or POSTGRES_URL and restart the server.', form));
    }
    if (marketingConsent) await persistMarketingConsentToAppDb(savedAccount, req, 'signup_checkbox');
    appendAudit(req, 'client_account_registered_page', { accountId: savedAccount.id, email, marketingConsent, termsAccepted }, null);
    const welcome = await sendAppEmail(email, 'Welcome to AdProof', 'Your AdProof account was created successfully. You can now create your first project and connect the SDK to your test site.', { accountId: savedAccount.id, type: 'registration_success' });
    structuredLog('log', 'registration_email_processed', { email, accountId: savedAccount.id, mailId: welcome.id, status: welcome.status, outboxFile: EMAIL_OUTBOX_FILE });
    return createClientPortalSession(res, savedAccount, '/account?registered=1&onboarding=1');
  }
  if (url.pathname === '/login' && req.method === 'GET') {
    const success = url.searchParams.get('cancelled') === '1'
      ? 'Subscription cancelled. Account data, sessions and linked project data were removed from the database. A confirmation test email was processed.'
      : '';
    return send(res, 200, clientLoginPage('', {}, success));
  }
  if (url.pathname === '/login' && req.method === 'POST') {
    const key = requestIpKey(req) + '|client-login';
    if (!rateLimitBucket(loginAttempts, key, ADMIN_LOGIN_LIMIT_WINDOW, ADMIN_LOGIN_LIMIT_MAX)) return send(res, 429, clientLoginPage('Too many login attempts. Try again later.'));
    const form = await readForm(req);
    const email = normalizeEmail(clamp(form.email || '', 120));
    const account = await findClientAccountByEmail(email);
    if (!account || !passwordOk(form.password || '', account.password)) { appendAudit(req, 'client_login_failed', { email }, null); return send(res, 401, clientLoginPage('Wrong email or password.', form)); }
    appendAudit(req, 'client_login_success', { accountId: account.id, email }, null);
    return createClientPortalSession(res, account, '/account?login=success');
  }
  if (url.pathname === '/account/cancel-subscription' && req.method === 'POST') {
    const form = await readForm(req);
    const client = await clientFromSession(req);
    if (!client || form.csrf !== client.csrfToken) return send(res, 403, publicAuthPage('Forbidden', '<section class="card"><h1>403</h1><p>Session token is missing or expired.</p></section>'));
    const reason = clamp(form.reason || 'client_requested_cancel', 120);
    let result;
    try {
      result = await cancelClientSubscriptionAndDeleteData(client, req, reason);
    } catch (err) {
      structuredLog('error', 'client_subscription_cancel_failed', { accountId: client.id, emailMasked: maskEmail(client.email), error: err.message, appDb: appDbPublicStatus() });
      return send(res, 500, await accountPage(client, `Could not cancel subscription: ${err.message}`));
    }
    const mail = await sendAppEmail(client.email, 'AdProof subscription cancelled', `Your AdProof subscription was cancelled. The account was removed from the client database and ${result.deletedProjects || 0} linked project(s) were removed from project analytics storage. If this was a mistake, create a new account from the registration page.`, { accountId: client.id, type: 'subscription_cancelled', projectIds: result.projectIds || [] });
    await markSubscriptionCancellationEmail(client, mail.status || 'unknown');
    structuredLog('log', 'subscription_cancellation_email_processed', { emailMasked: maskEmail(client.email), emailHash: emailHash(client.email), mailId: mail.id, status: mail.status, outboxFile: EMAIL_OUTBOX_FILE });
    res.writeHead(302, { Location: '/login?cancelled=1', 'Set-Cookie': `${CLIENT_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${(USE_HTTPS || APP_ENV === 'production') ? '; Secure' : ''}`, 'Cache-Control': 'no-store' });
    return res.end();
  }
  if (url.pathname === '/logout' && req.method === 'POST') {
    const form = await readForm(req);
    const client = await clientFromSession(req);
    if (!client || form.csrf !== client.csrfToken) return send(res, 403, publicAuthPage('Forbidden', '<section class="card"><h1>403</h1><p>Session token is missing or expired.</p></section>'));
    await deleteClientSession(client.clientSessionId);
    res.writeHead(302, { Location: '/login', 'Set-Cookie': `${CLIENT_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${(USE_HTTPS || APP_ENV === 'production') ? '; Secure' : ''}` });
    return res.end();
  }
  if (url.pathname === '/account' && req.method === 'GET') {
    const client = await requireClient(req, res); if (!client) return;
    return send(res, 200, await accountPage(client, '', { loginSuccess: url.searchParams.get('login') === 'success', registered: url.searchParams.get('registered') === '1', passwordReset: url.searchParams.get('passwordReset') === '1', onboarding: url.searchParams.get('onboarding') === '1', view: url.searchParams.get('view') || 'standard', period: url.searchParams.get('period') || 'week' }));
  }
  const clientFullMatch = url.pathname.match(/^\/account\/projects\/([^/]+)\/(?:full|analytics)$/);
  if (clientFullMatch && req.method === 'GET') {
    const client = await requireClient(req, res); if (!client) return;
    const projectId = decodeURIComponent(clientFullMatch[1] || '');
    const ids = await clientProjectIds(client.id);
    if (!ids.includes(projectId)) return send(res, 404, await accountPage(client, 'Project not found for this account.'));
    const project = await ensureProjectAvailable(projectId);
    if (!project) return send(res, 404, await accountPage(client, 'Project was not found in PostgreSQL or local state.'));
    return send(res, 200, await clientProjectFullViewPage(client, project, { period: url.searchParams.get('period') || 'today', view: url.searchParams.get('view') || 'count' }));
  }
  if (url.pathname === '/account/projects/create' && req.method === 'POST') {
    const client = await requireClient(req, res); if (!client) return;
    const form = await readForm(req);
    if (form.csrf !== client.csrfToken) return send(res, 403, await accountPage(client, 'CSRF token is missing or expired.'));
    const domain = sanitizeDomain(form.domain || '');
    if (!domain) return send(res, 400, await accountPage(client, 'Enter a valid domain.'));
    const currentProjects = await ensureClientProjects(client.id);
    const accountPlan = planFor({ planId: client.planId || 'beta' });
    if (currentProjects.length >= Number(accountPlan.maxProjects || 1)) {
      return send(res, 403, await accountPage(client, `${planLabel(client.planId || 'beta')} allows ${accountPlan.maxProjects || 1} project(s). Upgrade to Classic or Enterprise to add more.`));
    }
    const company = { id: randomId('cmp'), name: clamp(client.companyName || form.companyName || client.email, 120), contactEmail: client.email, notes: `Client portal account ${client.id}`, createdAt: iso(), updatedAt: iso() };
    state.companies.push(company);
    const project = { id: randomId('prj'), companyId: company.id, name: clamp(form.projectName || domain, 120), publicKey: randomKey('avp_pub'), allowedDomains: projectDomainsFromInput(domain), mode: 'server-gate', protectedSelector: clamp(form.protectedSelector || '[data-adproof-content="protected"]', 120), adContainerSelector: clamp(form.adContainerSelector || '[data-adproof-slot="left-sidebar"]', 120), marketBenchmarkPercent: 33, loaderEnabled: true, autoCreateAdContainer: true, strictness: 'strict', planId: 'beta', trialEndsAt: new Date(now() + 30 * 24 * 60 * 60 * 1000).toISOString(), quota: { monthlyEvents: PLAN_LIMITS.beta.monthlyEvents, monthlyServerVerifications: PLAN_LIMITS.beta.monthlyServerVerifications, maxDomains: PLAN_LIMITS.beta.maxDomains }, pathRules: { allow: [], deny: [] }, overlayCopy: { blockTitle: 'Access paused', blockMessage: 'Ad visibility could not be verified. Please disable blockers or third-party scripts that affect the ad area, then refresh the page to continue.', softTitle: 'Connection issue', softMessage: 'Verification server is unavailable. Please refresh the page after connection is restored.' }, ui: { color: ['violet','blue','terra','green'].includes(form.projectColor) ? form.projectColor : 'violet', gradient: ['violet','blue','terra','green'].includes(form.projectColor) ? form.projectColor : 'violet' }, hardening: { webCryptoProof: true, canvasProof: true, signedEvents: true, signedEventsStrict: true, eventBatching: true, domNoise: true, domNoiseMin: 500, domNoiseMax: 700, heartbeat: true, heartbeatIntervalMs: DEFAULT_HEARTBEAT_INTERVAL, scheduledRerender: true, rerenderIntervalMs: DEFAULT_RERENDER_INTERVAL, maxRestores: 4, hardLockOnBlock: true, dynamicSdkUrl: true, polymorphicWrapper: true, encryptedSecrets: true }, createdAt: iso(), updatedAt: iso() };
    project.domainVerification = defaultDomainVerification(project.allowedDomains || []);
    project.limits = { eventsPerMinute: MAX_EVENTS_PER_PROJECT_PER_MINUTE, sessionsPerMinute: MAX_SESSIONS_PER_PROJECT_PER_MINUTE, proofAttemptsPerVisitor: MAX_PROOF_ATTEMPTS_PER_VISITOR, eventsPerVisitorPerMinute: MAX_EVENTS_PER_VISITOR_PER_MINUTE };
    setProjectSecret(project, randomKey('avp_sec'));
    state.projects.push(project); state.projectStats[project.id] = defaultProjectStats();
    await linkProjectToClient(client.id, project.id);
    appendAudit(req, 'client_project_created', { accountId: client.id, projectId: project.id, publicKey: project.publicKey }, null);
    scheduleSave(); await persistProjectConfigToPostgres(project);
    return redirect(res, '/account?project=created');
  }
  return send(res, 404, publicAuthPage('Not found', '<section class="card"><h1>404</h1><p>Client portal route not found.</p></section>'));
}

function globalStats() {
  const all = state.projects.map(p => statsFor(p.id));
  return all.reduce((acc, s) => {
    for (const key of ['visits','uniqueVisitors','contentUnlocked','overlayShown','adRestores','connectionIssues','clientErrors','serverVerifications','successfulServerVerifications','events']) acc[key] += Number(s[key] || 0);
    return acc;
  }, { visits:0, uniqueVisitors:0, contentUnlocked:0, overlayShown:0, adRestores:0, connectionIssues:0, clientErrors:0, serverVerifications:0, successfulServerVerifications:0, events:0 });
}

function topReasons(projectId = null) {
  const combined = {};
  const list = projectId ? [statsFor(projectId)] : state.projects.map(p => statsFor(p.id));
  for (const st of list) for (const [k, v] of Object.entries(st.reasons || {})) inc(combined, k, v);
  return Object.entries(combined).sort((a,b)=>b[1]-a[1]).slice(0, 12);
}
function latestEvents(limit = 30, projectId = null) {
  const events = projectId ? statsFor(projectId).recentEvents : state.globalEvents;
  return (events || []).slice(-limit).reverse();
}

function dashboardPage(user) {
  const g = globalStats();
  const overlayRate = percent(g.overlayShown, g.visits);
  const unlockRate = percent(g.contentUnlocked, g.visits);
  const serverOkRate = percent(g.successfulServerVerifications, g.serverVerifications);
  const projectRows = state.projects.map(p => {
    const c = companyById(p.companyId);
    const s = statsFor(p.id);
    return `<tr><td><a href="/admin/projects/${p.id}"><strong>${esc(p.name)}</strong></a><br><span class="muted">${esc(c?.name || '—')}</span></td><td><span class="pill">${esc(p.mode)}</span><br><span class="muted">${esc((p.allowedDomains || []).join(', ') || 'any domain')}</span></td><td><span class="pill">${esc(planLabel(p.planId || 'beta'))}</span><br><a href="/admin/projects/${p.id}/status">status</a></td><td>${s.visits}</td><td>${s.overlayShown}<br><span class="muted">${percent(s.overlayShown, s.visits)}%</span></td><td>${s.contentUnlocked}<br><span class="muted">${percent(s.contentUnlocked, s.visits)}%</span></td><td><code>${esc(p.publicKey)}</code></td></tr>`;
  }).join('');
  const reasons = topReasons().map(([k,v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">No trigger reasons yet</td></tr>';
  const events = latestEvents(20).map(e => `<tr><td>${esc(e.time)}</td><td>${esc(e.projectName)}</td><td>${esc(e.type)}</td><td>${esc(e.reason)}</td><td class="muted">${esc(e.page || e.origin)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No events yet</td></tr>';
  return appShell('Dashboard', `<section><h1 class="title">Beta SaaS dashboard</h1><p class="lead">Founder-led beta dashboard: create companies and projects, issue snippets, review ad visibility events, overlay, restore, connection issues and server-side verification.</p><p><a class="btn blue" href="/admin/projects/new">+ Create client project</a> <a class="btn ghost" href="/demo/customer/${esc(state.projects[0]?.publicKey || '')}">Open SDK test page</a></p></section><section class="grid cols4 section"><div class="card kpi"><div class="label">Total visits</div><div class="num">${g.visits}</div><div class="label">across all projects</div></div><div class="card kpi"><div class="label">Overlay rate</div><div class="num">${overlayRate}%</div><div class="label">overlay / visits</div></div><div class="card kpi"><div class="label">Content unlock rate</div><div class="num">${unlockRate}%</div><div class="label">content unlocked / visits</div></div><div class="card kpi"><div class="label">Server verify OK</div><div class="num">${serverOkRate}%</div><div class="label">for strict integration</div></div></section><section class="card section"><h2>Client projects</h2><table class="table"><thead><tr><th>Project</th><th>Mode / domains</th><th>Plan / status</th><th>Visits</th><th>Overlay</th><th>Unlocked</th><th>Public key</th></tr></thead><tbody>${projectRows || '<tr><td colspan="7">No projects yet</td></tr>'}</tbody></table></section><section class="split section"><div class="card"><h2>Reasons</h2><table class="table"><thead><tr><th>Reason</th><th>Count</th></tr></thead><tbody>${reasons}</tbody></table></div><div class="card"><h2>Beta status</h2><p class="notice ok">This is no longer a single anti-adblock script. It is a beta SaaS model with projects, public keys, server-side secrets, dashboard and client SDK.</p><p class="muted">In cluster mode, events go through Redis Stream into PostgreSQL; JSON is only a fallback config snapshot, and the dashboard reads PostgreSQL aggregates.</p><form method="post" action="/admin/backup-now" style="margin-top:12px">${csrfInput(user)}<button class="btn ghost">Create backup now</button></form></div></section><section class="card section"><h2>Recent events</h2><table class="table"><thead><tr><th>Time</th><th>Project</th><th>Type</th><th>Reason</th><th>Page</th></tr></thead><tbody>${events}</tbody></table></section>`, user);
}

function readRecentNdjson(dir, prefix, limit = 30) {
  try {
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir).filter(f => f.startsWith(prefix + '-')).sort().reverse().slice(0, 5);
    const rows = [];
    for (const f of files) {
      for (const line of fs.readFileSync(path.join(dir, f), 'utf8').trim().split(/\n+/).reverse()) {
        const obj = safeJsonParse(line, null); if (obj) rows.push(obj);
        if (rows.length >= limit) return rows;
      }
    }
    return rows;
  } catch { return []; }
}
function securityPage(user, message = '') {
  const mfa = user.mfa || { enabled: false };
  const alerts = readRecentNdjson(ALERT_LOG_DIR, 'alerts', 20).map(a => `<tr><td>${esc(a.time)}</td><td>${esc(a.severity)}</td><td>${esc(a.type)}</td><td class="muted">${esc(JSON.stringify(a.details || {}))}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No alert events</td></tr>';
  const audit = readRecentNdjson(AUDIT_LOG_DIR, 'admin-audit', 20).map(a => `<tr><td>${esc(a.time)}</td><td>${esc(a.userEmail)}</td><td>${esc(a.action)}</td><td class="muted">${esc(JSON.stringify(a.details || {}))}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No audit events</td></tr>';
  const tmpSecret = user.mfaSetupSecret || '';
  const otp = tmpSecret ? otpAuthUrl(user, tmpSecret) : '';
  return appShell('Security', `<section><p><a href="/admin">← Dashboard</a></p><h1 class="title">Security center</h1><p class="lead">MFA, audit log, alerts, global kill switch, production guard and operational checks.</p>${message ? `<p class="notice ok">${esc(message)}</p>` : ''}</section><section class="split section"><div class="card"><h2>MFA</h2><p>Status: <span class="pill ${mfa.enabled ? 'good':'warn'}">${mfa.enabled ? 'enabled':'disabled'}</span></p>${tmpSecret ? `<p><strong>Secret:</strong></p><pre>${esc(tmpSecret)}</pre><p><strong>otpauth URL:</strong></p><pre>${esc(otp)}</pre><form method="post" action="/admin/security/mfa-enable">${csrfInput(user)}<div class="field"><label>Enter the 6-digit code from Authenticator</label><input name="code" inputmode="numeric"></div><button class="btn blue">Enable MFA</button></form>` : `<form method="post" action="/admin/security/mfa-generate">${csrfInput(user)}<button class="btn ghost">Generate TOTP secret</button></form>`}</div><div class="card"><h2>Global kill switch</h2><p>Current: <span class="pill ${state.settings?.killSwitch ? 'bad':'good'}">${state.settings?.killSwitch ? 'enabled':'disabled'}</span></p><form method="post" action="/admin/security/kill-switch">${csrfInput(user)}<input type="hidden" name="enabled" value="${state.settings?.killSwitch ? 'false':'true'}"><button class="btn ${state.settings?.killSwitch ? 'blue':'ghost'}">${state.settings?.killSwitch ? 'Disable':'Enable'} global kill switch</button></form><p class="muted">When enabled, the API stops confirming new checks and the SDK receives a safe denial. Use it for emergency rollback.</p></div></section><section class="card section"><h2>Recent alerts</h2><table class="table"><thead><tr><th>Time</th><th>Severity</th><th>Type</th><th>Details</th></tr></thead><tbody>${alerts}</tbody></table></section><section class="card section"><h2>Admin audit log</h2><table class="table"><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Details</th></tr></thead><tbody>${audit}</tbody></table></section>`, user);
}

function projectFormPage(user) {
  const companyOptions = state.companies.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  return appShell('Create project', `<section class="card"><h1 class="title">New beta client project</h1><p class="lead">One project equals one customer site/domain with its own public key, secret key and analytics.</p><form method="post" action="/admin/projects/create">${csrfInput(user)}<div class="row"><div class="field"><label>Company name</label><input name="companyName" placeholder="Example: Media Publisher LLC"></div><div class="field"><label>Contact email</label><input name="contactEmail" placeholder="client@example.com"></div></div><div class="row"><div class="field"><label>Project / website name</label><input name="projectName" required placeholder="News Portal"></div><div class="field"><label>Mode</label><select name="mode"><option value="soft-gate">soft-gate — soft client-side content hiding</option><option value="server-gate">server-gate — recommended, verification through customer backend</option><option value="observe-only">observe-only — analytics only, no blocking</option></select></div></div><div class="field"><label>Customer domains, one per line</label><textarea name="allowedDomains" rows="3" placeholder="example.com\nwww.example.com"></textarea></div><div class="row"><div class="field"><label>Protected content CSS selector</label><input name="protectedSelector" value="#protected-content"></div><div class="field"><label>Ad container CSS selector</label><input name="adContainerSelector" value="#ad-slot"></div></div><div class="row"><div class="field"><label>Market benchmark, %</label><input name="marketBenchmarkPercent" value="33"></div><div class="field"><label>Strictness</label><select name="strictness"><option value="balanced">balanced</option><option value="gentle">gentle</option><option value="strict">strict</option></select></div></div><button class="btn blue">Create project</button></form></section>`, user);
}

function installSnippet(project) {
  return `<div id="ad-slot"></div>
<div id="protected-content">... protected content ...</div>
<script src="${stableSdkScriptUrl(project)}" async
  data-project-key="${project.publicKey}"
  data-protected-selector="${esc(project.protectedSelector)}"
  data-ad-container-selector="${esc(project.adContainerSelector)}"></script>`;
}
function serverVerifyExample(project) {
  return `POST ${PUBLIC_BASE_URL}/api/v1/server/verify\nContent-Type: application/json\n\n{\n  "projectKey": "${project.publicKey}",\n  "secretKey": "${projectSecret(project)}",\n  "visitorToken": "TOKEN_FROM_CLIENT_SDK"\n}`;
}

function projectPage(user, project, message = '', filters = {}) {
  const c = companyById(project.companyId);
  const s = statsFor(project.id);
  const overlayRate = percent(s.overlayShown, s.visits);
  const unlockRate = percent(s.contentUnlocked, s.visits);
  const reasons = topReasons(project.id).map(([k,v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">Пока нет причин</td></tr>';
  let filteredEvents = latestEvents(80, project.id);
  if (filters.reason) filteredEvents = filteredEvents.filter(e => e.reason === filters.reason);
  if (filters.domain) filteredEvents = filteredEvents.filter(e => e.domain === filters.domain);
  if (filters.date) filteredEvents = filteredEvents.filter(e => String(e.time || '').startsWith(filters.date));
  const events = filteredEvents.slice(0, 40).map(e => `<tr><td>${esc(e.time)}</td><td>${esc(e.type)}</td><td>${esc(e.reason)}</td><td>${esc(e.domain || '')}</td><td class="muted">${esc(e.page || e.origin)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No events yet</td></tr>';
  const verifiedDomains = (project.domainVerification?.verifiedDomains || []).join(', ') || 'нет подтверждённых доменов';
  const verifyRows = (project.allowedDomains || []).map(d => { const token = project.domainVerification?.tokens?.[d] || ''; const ok = (project.domainVerification?.verifiedDomains || []).includes(d); return `<tr><td>${esc(d)}</td><td>${ok ? '<span class="pill good">verified</span>' : '<span class="pill warn">pending</span>'}</td><td><code>${esc(token || 'token not generated')}</code></td></tr>`; }).join('') || '<tr><td colspan="3" class="muted">Нет доменов</td></tr>';
  const quota = projectQuota(project);
  const monthlyEvents = monthlyStatCount(s, 'events');
  const monthlyVerify = monthlyStatCount(s, 'serverVerifications');
  const dailyRows = Object.entries(s.daily || {}).sort((a,b)=>a[0] < b[0] ? 1 : -1).slice(0, 14).map(([day,d]) => `<tr><td>${esc(day)}</td><td>${d.visits || 0}</td><td>${d.overlayShown || 0}</td><td>${d.contentUnlocked || 0}</td><td>${d.connectionIssues || 0}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Нет данных</td></tr>';
  normalizeProjectSecrets(project);
  const secretRows = (project.secrets || []).map(sec => `<tr><td>${esc(sec.kind)}</td><td>${esc(sec.label || sec.id)}<br><span class="muted">${esc(sec.id)}</span></td><td>${sec.revokedAt ? `<span class="pill warn">revokes: ${esc(sec.revokedAt)}</span>` : '<span class="pill good">active</span>'}</td><td>${esc(sec.lastUsedAt || 'never')}</td></tr>`).join('');
  const domainRows = Object.entries(s.domains || {}).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([k,v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">Нет доменов</td></tr>';
  const browserRows = Object.entries(s.browsers || {}).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([k,v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">Нет данных</td></tr>';
  return appShell(project.name, `<section><p><a href="/admin">← Dashboard</a></p><h1 class="title">${esc(project.name)}</h1><p class="lead">${esc(c?.name || 'No company')} · режим <span class="pill">${esc(project.mode)}</span> · статус <span class="pill ${project.killSwitch || project.enabled === false ? 'bad':'good'}">${project.killSwitch || project.enabled === false ? 'disabled':'active'}</span> · домены: ${esc((project.allowedDomains || []).join(', ') || 'any')}</p>${message ? `<p class="notice ok">${esc(message)}</p>` : ''}<p><a class="btn blue" href="/demo/customer/${project.publicKey}">Open SDK test page</a> <a class="btn ghost" href="/admin/projects/${project.id}/export.csv">Export CSV</a> <a class="btn ghost" href="/admin/projects/${project.id}/export.json">Export JSON</a> <a class="btn ghost" href="/admin/projects/${project.id}/status">Project status</a></p></section><section class="grid cols4 section"><div class="card kpi"><div class="label">Visits</div><div class="num">${s.visits}</div></div><div class="card kpi"><div class="label">Overlay rate</div><div class="num">${overlayRate}%</div><div class="label">benchmark: ${esc(project.marketBenchmarkPercent)}%</div></div><div class="card kpi"><div class="label">Unlocked</div><div class="num">${unlockRate}%</div></div><div class="card kpi"><div class="label">Restores</div><div class="num">${s.adRestores}</div></div></section><section class="grid cols3 section"><div class="card"><h2>Plan & quotas</h2><p>Plan: <span class="pill">${esc(planLabel(project.planId || 'beta'))}</span></p><p class="muted">Monthly events: ${monthlyEvents} / ${quota.monthlyEvents}<br>Server verify: ${monthlyVerify} / ${quota.monthlyServerVerifications}<br>Max domains: ${quota.maxDomains}</p></div><div class="card"><h2>Domain verification</h2><p class="muted">Verified: ${esc(verifiedDomains)}</p><table class="table"><thead><tr><th>Domain</th><th>Status</th><th>Token</th></tr></thead><tbody>${verifyRows}</tbody></table><form method="post" action="/admin/projects/${project.id}/domain-token" style="margin-top:12px">${csrfInput(user)}<div class="field"><label>Domain</label><input name="domain" placeholder="example.com"></div><button class="btn ghost">Generate token</button></form><form method="post" action="/admin/projects/${project.id}/domain-verify" style="margin-top:12px">${csrfInput(user)}<div class="field"><label>Domain to verify</label><input name="domain" placeholder="example.com"></div><button class="btn ghost">Verify .well-known file</button></form></div><div class="card"><h2>Offboarding</h2><p class="muted">Перед удалением экспортируйте JSON. Удаление убирает проект, stats и активные visitor sessions.</p><form method="post" action="/admin/projects/${project.id}/delete" onsubmit="return confirm('Delete project and local stats? Export JSON first.');">${csrfInput(user)}<div class="field"><label>Type DELETE to confirm</label><input name="confirm"></div><button class="btn ghost">Delete project</button></form></div></section><section class="split section"><div class="card"><h2>Install snippet для клиента</h2><p class="muted">Клиент вставляет это в шаблон страницы, CMS, GTM/custom HTML или отдаёт своему разработчику.</p><pre>${esc(installSnippet(project))}</pre></div><div class="card"><h2>Ключи проекта</h2><p><strong>Public key:</strong><br><code>${esc(project.publicKey)}</code></p><p><strong>Secret key:</strong><br><code>${esc(projectSecret(project))}</code><br><span class="muted">stored at rest as encrypted AES-256-GCM value · preview: ${esc(projectSecretPreview(project))}</span></p><p class="notice danger">Secret key нельзя вставлять во frontend. Он нужен только backend’у клиента для server-to-server проверки.</p><form method="post" action="/admin/projects/${project.id}/rotate-secret">${csrfInput(user)}<div class="field"><label>Grace period for old key, days</label><input name="graceDays" value="7"></div><button class="btn ghost">Rotate server secret</button></form><form method="post" action="/admin/projects/${project.id}/api-key" style="margin-top:12px">${csrfInput(user)}<div class="row"><div class="field"><label>API key kind</label><select name="kind"><option value="events_ingest">events_ingest</option><option value="analytics_readonly">analytics_readonly</option><option value="server_verify">server_verify</option></select></div><div class="field"><label>Label</label><input name="label" placeholder="Render backend key"></div></div><button class="btn ghost">Create scoped API key</button></form></div></section><section class="card section"><h2>Project secrets and API keys</h2><table class="table"><thead><tr><th>Kind</th><th>Label / ID</th><th>Status</th><th>Last used</th></tr></thead><tbody>${secretRows}</tbody></table></section><section class="split section"><div class="card"><h2>Server-to-server verify</h2><p class="muted">Рекомендованный beta-режим для реальной защиты: сайт клиента не отдаёт защищённый контент, пока его backend не проверит visitorToken у Вашего SaaS.</p><pre>${esc(serverVerifyExample(project))}</pre></div><div class="card"><h2>Настройки проекта</h2><form method="post" action="/admin/projects/${project.id}/update">${csrfInput(user)}<div class="field"><label>Allowed domains</label><textarea name="allowedDomains" rows="3">${esc((project.allowedDomains || []).join('\n'))}</textarea></div><div class="row"><div class="field"><label>Plan</label><select name="planId"><option ${project.planId==='beta'?'selected':''} value="beta">beta</option><option ${project.planId==='classic'?'selected':''} value="classic">classic</option><option ${project.planId==='enterprise'?'selected':''} value="enterprise">enterprise</option></select></div><div class="field"><label>Monthly events quota</label><input name="monthlyEvents" value="${esc(project.quota?.monthlyEvents || planFor(project).monthlyEvents)}"></div></div><div class="row"><div class="field"><label>Allow paths, one per line. Empty = all</label><textarea name="allowPaths" rows="3">${esc((project.pathRules?.allow || []).join('\n'))}</textarea></div><div class="field"><label>Deny paths, one per line</label><textarea name="denyPaths" rows="3">${esc((project.pathRules?.deny || []).join('\n'))}</textarea></div></div><div class="field"><label>Overlay blocking message</label><textarea name="overlayBlockMessage" rows="3">${esc(project.overlayCopy?.blockMessage || '')}</textarea></div><div class="row"><div class="field"><label>Protected selector</label><input name="protectedSelector" value="${esc(project.protectedSelector)}"></div><div class="field"><label>Ad container selector</label><input name="adContainerSelector" value="${esc(project.adContainerSelector)}"></div></div><div class="row"><div class="field"><label>Mode</label><select name="mode"><option ${project.mode==='soft-gate'?'selected':''} value="soft-gate">soft-gate</option><option ${project.mode==='server-gate'?'selected':''} value="server-gate">server-gate</option><option ${project.mode==='observe-only'?'selected':''} value="observe-only">observe-only</option></select></div><div class="field"><label>Benchmark %</label><input name="marketBenchmarkPercent" value="${esc(project.marketBenchmarkPercent)}"></div></div><div class="row"><div class="field"><label>SDK version</label><select name="sdkVersion"><option ${project.sdkVersion==='v1'?'selected':''} value="v1">v1 stable</option><option ${project.sdkVersion==='v2'?'selected':''} value="v2">v2 canary-compatible</option></select></div><div class="field"><label>SDK channel</label><select name="sdkChannel"><option ${project.sdkChannel==='stable'?'selected':''} value="stable">stable</option><option ${project.sdkChannel==='beta'?'selected':''} value="beta">beta</option><option ${project.sdkChannel==='experimental'?'selected':''} value="experimental">experimental</option></select></div></div><div class="row"><div class="field"><label>Canary percent</label><input name="canaryPercent" value="${esc(project.canaryPercent || 0)}"></div><div class="field"><label>Fallback policy</label><select name="fallbackPolicy"><option ${project.fallbackPolicy==='gentle'?'selected':''} value="gentle">gentle</option><option ${project.fallbackPolicy==='balanced'?'selected':''} value="balanced">balanced</option><option ${project.fallbackPolicy==='strict'?'selected':''} value="strict">strict</option></select></div></div><div class="row"><div class="field"><label>Project enabled</label><select name="enabled"><option ${project.enabled!==false?'selected':''} value="true">enabled</option><option ${project.enabled===false?'selected':''} value="false">disabled</option></select></div><div class="field"><label>Project kill switch</label><select name="killSwitch"><option ${!project.killSwitch?'selected':''} value="false">off</option><option ${project.killSwitch?'selected':''} value="true">on</option></select></div></div><div class="row"><div class="field"><label>Events/min limit</label><input name="eventsPerMinute" value="${esc(project.limits?.eventsPerMinute || MAX_EVENTS_PER_PROJECT_PER_MINUTE)}"></div><div class="field"><label>Sessions/min limit</label><input name="sessionsPerMinute" value="${esc(project.limits?.sessionsPerMinute || MAX_SESSIONS_PER_PROJECT_PER_MINUTE)}"></div></div><div class="row"><div class="field"><label>Events per visitor/min</label><input name="eventsPerVisitorPerMinute" value="${esc(project.limits?.eventsPerVisitorPerMinute || MAX_EVENTS_PER_VISITOR_PER_MINUTE)}"></div><div class="field"><label>Signed events strict</label><select name="signedEventsStrict"><option ${!project.hardening?.signedEventsStrict?'selected':''} value="false">audit-only</option><option ${project.hardening?.signedEventsStrict?'selected':''} value="true">strict reject unsigned</option></select></div></div><button class="btn blue">Сохранить</button></form></div></section><section class="split section"><div class="card"><h2>Причины</h2><table class="table"><thead><tr><th>Reason</th><th>Count</th></tr></thead><tbody>${reasons}</tbody></table></div><div class="card"><h2>Дневная статистика</h2><table class="table"><thead><tr><th>Day</th><th>Visits</th><th>Overlay</th><th>Unlocked</th><th>Connection</th></tr></thead><tbody>${dailyRows}</tbody></table></div></section><section class="split section"><div class="card"><h2>Top domains</h2><table class="table"><thead><tr><th>Domain</th><th>Events</th></tr></thead><tbody>${domainRows}</tbody></table></div><div class="card"><h2>Browsers</h2><table class="table"><thead><tr><th>Browser</th><th>Events</th></tr></thead><tbody>${browserRows}</tbody></table></div></section><section class="card section"><h2>Recent events проекта</h2><table class="table"><thead><tr><th>Time</th><th>Type</th><th>Reason</th><th>Domain</th><th>Page</th></tr></thead><tbody>${events}</tbody></table></section>`, user);
}

function landingPage() {
  const demoKey = state.projects[0]?.publicKey || '';
  return appShell('Ad Visibility SaaS Beta', `<section class="split"><div class="card"><h1 class="title">Beta SaaS for ad visibility verification</h1><p class="lead">The platform verifies ad container delivery and visibility before protected content access, records overlay reasons, separates likely network filtering from connection issues and gives site owners a dashboard.</p><p><a class="btn blue" href="/admin">Open dashboard</a> <a class="btn ghost" href="/demo/customer/${esc(demoKey)}">View SDK test page</a></p></div><div class="card"><h2>What is already in beta</h2><ul class="lead"><li>client companies and projects;</li><li>public key / secret key;</li><li>client SDK snippet;</li><li>server-to-server verification API;</li><li>analytics dashboard;</li><li>loader, overlay, restore, connection issue;</li><li>beta onboarding documentation.</li></ul></div></section>`, null);
}

function docsIndex(user = null) {
  const files = fs.readdirSync(path.join(__dirname, 'docs')).filter(f => f.endsWith('.md'));
  return appShell('Docs', `<section class="card"><h1 class="title">Project documentation</h1><p class="lead">These files can be shared with developers, used for beta presentation and customer onboarding preparation.</p><table class="table"><thead><tr><th>File</th><th>Open</th></tr></thead><tbody>${files.map(f => `<tr><td>${esc(f)}</td><td><a href="/docs/${encodeURIComponent(f)}">read</a></td></tr>`).join('')}</tbody></table></section>`, user);
}
function docPage(file, user = null) {
  const safe = path.basename(file);
  const full = path.join(__dirname, 'docs', safe);
  if (!safe.endsWith('.md') || !fs.existsSync(full)) return appShell('Not found', '<section class="card"><h1>Doc not found</h1></section>', user);
  return appShell(safe, `<section class="card"><p><a href="/docs">← Docs</a></p><h1 class="title">${esc(safe)}</h1><pre>${esc(readFileSafe(full))}</pre></section>`, user);
}

function testSiteIndexPage(project) {
  if (!project) return appShell('Test site unavailable', '<section class="card"><h1 class="title">Test site unavailable</h1><p>No demo project found. Create a project in Admin first.</p></section>');
  const article = `/test-site/article?projectKey=${encodeURIComponent(project.publicKey)}&sdkMode=boot`;
  const articleStable = `/test-site/article?projectKey=${encodeURIComponent(project.publicKey)}&sdkMode=stable`;
  const foreign = `/foreign-test-site?projectKey=${encodeURIComponent(project.publicKey)}&sdkMode=boot`;
  const foreignStable = `/foreign-test-site?projectKey=${encodeURIComponent(project.publicKey)}&sdkMode=stable`;
  return appShell('AVP Test Sites', `<section class="card"><h1 class="title">Two-site SDK test bundle</h1><p class="lead">Only two test websites are used for the integration check: an allowed customer site and a foreign site that tries to reuse another project's script tag. Test pages default to dynamic <code>boot-xxxx.js</code>; customer integration still uses the stable <code>/sdk/v1/&lt;publicKey&gt;.js</code> tag.</p><p><a class="btn blue" href="${article}">Open allowed customer site</a> <a class="btn ghost" href="${foreign}">Open foreign script-tag site</a></p></section><section class="grid cols3 section"><div class="card"><h2>Site 1: allowed customer site</h2><p class="muted"><code>/test-site/article</code> loads the dynamic boot script, creates a session, checks ad visibility, heartbeat, mutation observer and backend unlock.</p><p><a class="btn ghost" href="${articleStable}">Stable tag mode</a> <a class="btn ghost" href="${article}&simulateAdBlock=1">Simulated adblock</a> <a class="btn ghost" href="${article}&simulateConnectionIssue=1">Connection issue</a> <a class="btn ghost" href="${article}&case=hide-slot">Hidden slot</a> <a class="btn ghost" href="${article}&case=remove-after-unlock">Remove slot</a> <a class="btn ghost" href="${article}&case=server-gate">Server-gate</a></p></div><div class="card"><h2>Site 2: foreign site</h2><p class="muted"><code>/foreign-test-site</code> intentionally injects the same project script from another host. The server must return a blocked SDK stub and log <code>sdk_domain_not_allowed</code>.</p><p><a class="btn ghost" href="${foreign}">Foreign boot-script reuse</a> <a class="btn ghost" href="${foreignStable}">Foreign stable-tag reuse</a></p></div><div class="card"><h2>Current project key</h2><pre>${esc(project.publicKey)}</pre><p class="muted"><a href="/debug/test-site-scripts">Debug script map</a> · <a href="/admin">Admin dashboard</a></p></div></section><section class="card section"><h2>UI ↔ backend mapping</h2><table class="table"><thead><tr><th>Area</th><th>Route/API</th><th>Purpose</th></tr></thead><tbody><tr><td>Product website</td><td><code>/</code>, <code>/product.html</code>, <code>/pricing.html</code></td><td>Public SaaS site</td></tr><tr><td>Allowed test site</td><td><code>/test-site/article</code></td><td>Real SDK behavior test</td></tr><tr><td>Foreign test site</td><td><code>/foreign-test-site</code></td><td>Script-tag theft/reuse test</td></tr><tr><td>Client SDK</td><td><code>/sdk/v1/:publicKey/...</code></td><td>Customer website integration</td></tr><tr><td>Server-gate demo</td><td><code>/test-site/backend-unlock</code></td><td>Customer backend simulation without exposing the secret key in frontend</td></tr></tbody></table></section>`, userFromAdminSession({ headers: {} }));
}

function renderTestSiteTemplate(fileName, values) {
  const templatePath = path.join(__dirname, 'src', 'test-sites', fileName);
  let html = fs.readFileSync(templatePath, 'utf8');
  for (const [key, value] of Object.entries(values || {})) {
    html = html.split(`{{${key}}}`).join(value == null ? '' : String(value));
  }
  return html.replace(/{{[A-Z0-9_]+}}/g, '');
}

function testSiteContentHtml(serverGate) {
  if (serverGate) {
    return `<div id="sdk-proof-marker" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden">SDK proof marker</div><div id="protected-content"><p>A short preview remains visible, while the full premium block opens through a backend verification simulation.</p><button class="btn blue" id="serverUnlockBtn" type="button">Verify through backend and unlock premium</button><div id="serverStatus" class="status">Wait until the SDK creates a visitorToken.</div><div id="server-premium"><strong>Premium content unlocked by backend.</strong><p>This is a server-gate simulation: the frontend does not know the secret key, and the local backend route verifies visitorToken like a customer backend would.</p></div></div>`;
  }
  return `<div id="protected-content"><p>The full article, file or website feature should be available only after a valid ad visibility check.</p><p>If the ad is visible, the SDK unlocks this block and sends <code>content_unlocked</code>. If the slot is hidden, removed or blocked, an overlay appears and the reason is saved in the dashboard.</p></div>`;
}

function testSiteArticlePage(project, url) {
  if (!project) return appShell('Test project not found', '<section class="card"><h1>Project not found</h1></section>');
  const testCase = url.searchParams.get('case') || 'normal';
  const serverGate = testCase === 'server-gate';
  const hideSlot = testCase === 'hide-slot';
  const removeAfterUnlock = testCase === 'remove-after-unlock';
  const protectedSelector = serverGate ? '#sdk-proof-marker' : '#protected-content';
  const mode = serverGate ? 'observe-only' : project.mode;
  const caseLabel = serverGate ? 'Server-gate demo' : hideSlot ? 'Hidden ad-slot' : removeAfterUnlock ? 'Remove ad-slot after unlock' : url.searchParams.has('simulateAdBlock') ? 'Simulated adblock' : url.searchParams.has('simulateConnectionIssue') ? 'Simulated connection issue' : 'Normal unlock';
  const testScriptTag = testSdkScriptTag(project, url, `data-mode="${esc(mode)}" data-protected-selector="${protectedSelector}" data-ad-container-selector="#ad-slot"`);
  return renderTestSiteTemplate('site-a-article.html', {
    CASE_LABEL: esc(caseLabel),
    CASE_LABEL_JSON: JSON.stringify(caseLabel),
    PROJECT_NAME: esc(project.name),
    PROJECT_KEY: esc(project.publicKey),
    PROJECT_KEY_JSON: JSON.stringify(project.publicKey),
    PROJECT_KEY_URL: encodeURIComponent(project.publicKey),
    HIDE_SLOT_CSS: hideSlot ? '#ad-slot{display:none!important}' : '',
    CONTENT_HTML: testSiteContentHtml(serverGate),
    REMOVE_AFTER_UNLOCK_JS: removeAfterUnlock ? "setTimeout(function(){ var slot=document.getElementById('ad-slot'); if(slot) slot.remove(); }, 6500);" : '',
    TEST_SCRIPT_TAG: testScriptTag
  });
}

function foreignTestSitePage(project, url) {
  if (!project) return appShell('Foreign test not found', '<section class="card"><h1>Project not found</h1></section>');
  const localPort = String(url.port || PORT || 3443);
  const modeParam = `&sdkMode=${encodeURIComponent(testSdkMode(url))}`;
  const localhostUrl = `http://localhost:${localPort}/foreign-test-site?projectKey=${encodeURIComponent(project.publicKey)}${modeParam}`;
  const foreignUrl = `http://127.0.0.2:${localPort}/foreign-test-site?projectKey=${encodeURIComponent(project.publicKey)}${modeParam}`;
  const domains = (project.allowedDomains || []).join(', ') || 'no domains configured';
  const injectedSnippet = testSdkScriptTag(project, url, 'data-protected-selector="#protected-content" data-ad-container-selector="#ad-slot"');
  return renderTestSiteTemplate('site-b-foreign.html', {
    PROJECT_NAME: esc(project.name),
    PROJECT_KEY: esc(project.publicKey),
    PROJECT_KEY_JSON: JSON.stringify(project.publicKey),
    ALLOWED_DOMAINS: esc(domains),
    LOCALHOST_URL: esc(localhostUrl),
    FOREIGN_URL: esc(foreignUrl),
    INJECTED_SNIPPET: injectedSnippet,
    INJECTED_SNIPPET_ESC: esc(`<!-- FOREIGN INJECTED SDK TAG: remove or replace this script tag to test stolen SDK reuse. Test pages default to dynamic boot-xxxx.js; add sdkMode=stable to test the static customer tag. -->${injectedSnippet}`)
  });
}

async function handleTestSiteBackendUnlock(req, res) {
  const body = await readJson(req);
  const project = projectByPublicKey(body.projectKey) || state.projects[0];
  if (!project) return sendJson(res, 404, { success: false, allowed: false, reason: 'project_not_found' });
  if (rejectIfProjectClosed(req, res, project)) return;
  const token = body.visitorToken || '';
  const sess = await loadVisitorSession(token);
  recordEvent(req, project, 'server_verification', 'test_site_backend_unlock_called', { pageUrl: sess?.pageUrl || '/test-site/article' }, token);
  const heartbeatFresh = Boolean(sess?.lastHeartbeatAt && now() - sess.lastHeartbeatAt < HEARTBEAT_TTL);
    const recentlyUnlocked = Boolean(sess?.contentUnlockedAt && now() - sess.contentUnlockedAt < HEARTBEAT_TTL);
    const allowed = Boolean(sess && sess.projectId === project.id && sess.status === 'content_unlocked' && now() - (sess.contentUnlockedAt || 0) < VISITOR_SESSION_TTL && (heartbeatFresh || recentlyUnlocked));
  if (allowed) recordEvent(req, project, 'server_verification_ok', 'test_site_backend_content_allowed', { pageUrl: sess.pageUrl }, token);
  return sendJson(res, 200, { success: true, allowed, status: sess?.status || 'missing_session', heartbeatFresh, reason: allowed ? 'ad_visibility_confirmed' : 'not_confirmed_or_expired', projectId: project.id });
}

function demoCustomerPage(project) {
  if (!project) return appShell('Demo not found', '<section class="card"><h1>Project not found</h1></section>');
  if (APP_ENV !== 'production') {
    project.allowedDomains = Array.isArray(project.allowedDomains) ? project.allowedDomains : [];
    let changed = false;
    for (const d of ['localhost', '127.0.0.1']) {
      if (!project.allowedDomains.includes(d)) { project.allowedDomains.push(d); changed = true; }
    }
    if (changed) { project.updatedAt = iso(); scheduleSave(); }
  }
  const protectedSel = '#protected-content';
  const adSel = '#ad-slot';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AdProof demo · ${esc(project.name)}</title><style>
  :root{--ivory:#fdf9e9;--blue:#4a90d9;--blue-dark:#236ca8;--ink:#171717;--muted:#766f66;--line:rgba(20,20,20,.1);--card:rgba(255,255,255,.8)}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:rgb(253,249,233);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:var(--ink)}header{position:sticky;top:0;z-index:20;background:#111;color:#fff;padding:16px 28px;display:flex;align-items:center;justify-content:space-between;gap:18px;box-shadow:0 12px 38px rgba(0,0,0,.14)}header strong{font-weight:600}header a{color:rgba(255,255,255,.78);text-decoration:none;font-weight:600;font-size:14px}main{width:min(1120px,calc(100% - 44px));margin:34px auto;display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:28px;align-items:start}.article,.side-card{background:var(--card);border:1px solid var(--line);border-radius:28px;padding:26px;box-shadow:0 22px 70px rgba(72,59,39,.09);backdrop-filter:blur(10px)}.meta{display:inline-flex;gap:8px;align-items:center;padding:7px 10px;border-radius:999px;background:#dff0ff;color:#245b83;font-size:12px;font-weight:600;margin:0 0 16px}h1{font-size:42px;line-height:1.05;letter-spacing:-1.4px;margin:0 0 16px}.lead{font-size:18px;line-height:1.7;color:var(--muted);margin:0 0 22px}#protected-content{line-height:1.85;font-size:17px}.ad-label{font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#8d8376;margin:0 0 10px;text-align:center}#ad-slot{width:300px;min-height:250px;margin:0 auto 16px}.hint{font-size:13px;color:var(--muted);line-height:1.55;margin:14px 0 0}.btn-row{display:flex;gap:9px;flex-wrap:wrap;margin-top:16px}.btn{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:15px;background:#111;color:#fff;text-decoration:none;padding:10px 13px;font-weight:600}.btn.ghost{background:rgba(255,255,255,.72);color:#111;border:1px solid var(--line)}code{background:rgba(255,255,255,.72);border:1px solid var(--line);border-radius:9px;padding:2px 6px}@media(max-width:900px){main{grid-template-columns:1fr}h1{font-size:32px}#ad-slot{width:100%}header{align-items:flex-start;flex-direction:column}}
  </style></head><body><header><strong>AdProof project demo</strong><nav><a href="/account">Client portal</a> · <a href="/">Home</a></nav></header><main><article class="article"><div class="meta">Live SDK demo · ${esc(project.name)}</div><h1>Protected content opens after ad visibility verification</h1><p class="lead">This page uses your project public key and a local demo ad container. It is built for testing SDK, heartbeat, lease and hard-lock behavior before connecting a real customer website.</p><div id="protected-content"><p>This is the protected content area. In a production integration, this could be a premium article, download page, feature panel or gated media block.</p><p>If the ad zone is visible and verification succeeds, this content stays available. If the ad zone is blocked, hidden or removed, AdProof pauses access and records the reason in analytics.</p></div></article><aside class="side-card"><p class="ad-label">Advertisement test slot</p><div id="ad-slot"></div><p class="hint">Project key: <code>${esc(project.publicKey)}</code></p><div class="btn-row"><a class="btn ghost" href="/demo/customer/${encodeURIComponent(project.publicKey)}">Reload normal</a><a class="btn ghost" href="/demo/customer/${encodeURIComponent(project.publicKey)}?simulateAdBlock=1">Simulate blocker</a></div></aside></main><script src="${stableSdkScriptUrl(project)}" async data-project-key="${project.publicKey}" data-protected-selector="${protectedSel}" data-ad-container-selector="${adSel}"></script></body></html>`;
}

function sdkBootstrap(project) {
  const nonce = crypto.randomBytes(10).toString('hex');
  return `/* AVP dynamic SDK bootstrap v1.9 commercial beta | ${nonce} */
(function(){'use strict';
  var script=document.currentScript;
  var key=${jsonEsc(project.publicKey)};
  var base=${jsonEsc(PUBLIC_BASE_URL)};
  var version=${jsonEsc(project.sdkVersion || DEFAULT_SDK_VERSION)};
  var canary=Number(${jsonEsc(project.canaryPercent || 0)}||0);
  if(Math.random()*100<canary) version='v2';
  var dyn='dyn-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+'.js';
  var s=document.createElement('script');
  s.async=true;
  s.src=base+'/sdk/'+encodeURIComponent(version)+'/'+encodeURIComponent(key)+'/'+dyn;
  if(script){
    Array.prototype.slice.call(script.attributes).forEach(function(a){ if(/^data-/.test(a.name)) s.setAttribute(a.name,a.value); });
    if(script.parentNode) script.parentNode.insertBefore(s, script.nextSibling); else document.head.appendChild(s);
  } else document.head.appendChild(s);
})();`;
}

function sdkProjectEntryLoader(project) {
  const bootId = `boot-${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}`;
  return `/* AVP project entry loader. Stable customer tag, guarded per page host. */
(function(){'use strict';
  var script=document.currentScript;
  var key=${jsonEsc(project.publicKey)};
  var base=${jsonEsc(PUBLIC_BASE_URL)};
  var version=${jsonEsc(project.sdkVersion || DEFAULT_SDK_VERSION)};
  var boot=${jsonEsc(bootId)};
  var s=document.createElement('script');
  s.async=true;
  s.src=base+'/sdk/'+encodeURIComponent(version)+'/'+encodeURIComponent(key)+'/'+boot+'.js?avp_entry='+(Date.now().toString(36));
  if(script){
    Array.prototype.slice.call(script.attributes).forEach(function(a){ if(/^data-/.test(a.name)) s.setAttribute(a.name,a.value); });
    s.setAttribute('data-sdk-mode','boot');
    if(script.parentNode) script.parentNode.insertBefore(s, script.nextSibling); else document.head.appendChild(s);
  } else document.head.appendChild(s);
})();`;
}

function sdkJs(project) {
  const config = {
    baseUrl: PUBLIC_BASE_URL,
    projectKey: project.publicKey,
    mode: project.mode,
    protectedSelector: project.protectedSelector,
    adContainerSelector: project.adContainerSelector,
    loaderEnabled: project.loaderEnabled,
    autoCreateAdContainer: project.autoCreateAdContainer,
    hardening: project.hardening || {},
    sdkVersion: project.sdkVersion || DEFAULT_SDK_VERSION,
    sdkChannel: project.sdkChannel || DEFAULT_SDK_CHANNEL,
    fallbackPolicy: project.fallbackPolicy || 'balanced',
    pathRules: project.pathRules || { allow: [], deny: [] },
    overlayCopy: project.overlayCopy || {},
    quota: projectQuota(project),
    killSwitch: Boolean(state.settings?.killSwitch || project.killSwitch || project.enabled === false)
  };
  const nonce = crypto.randomBytes(8).toString('hex');
  const dead = crypto.randomBytes(16).toString('hex');
  return `/* AVP hardened SaaS SDK v1.9 commercial beta | polymorphic wrapper ${nonce} | dead:${dead} */
(function(){'use strict';
  var CFG=${jsonEsc(config)};
  if(CFG.killSwitch){console.warn('AVP project is temporarily disabled'); return;}
  var script=document.currentScript||document.querySelector('script[data-project-key="'+CFG.projectKey+'"]');
  var projectKey=(script&&script.getAttribute('data-project-key'))||CFG.projectKey;
  var protectedSelector=(script&&script.getAttribute('data-protected-selector'))||CFG.protectedSelector;
  var adSelector=(script&&script.getAttribute('data-ad-container-selector'))||CFG.adContainerSelector;
  var mode=(script&&script.getAttribute('data-mode'))||CFG.mode;
  var H=CFG.hardening||{};
  var visitorToken='', keyPair=null, eventSeq=0, eventQueue=[], eventTimer=null, observer=null, bodyObserver=null, rerenderTimer=null, heartbeatTimer=null;
  var restored=0, maxRestores=Number(H.maxRestores||4), overlayShown=false, unlocked=false, internalMutation=false;
  var lastHeartbeatOk=Date.now(), lostHeartbeats=0, currentChallenge=null, noiseContainer=null;
  function qs(s){try{return document.querySelector(s)}catch(e){return null}}
  function sleep(ms){return new Promise(function(r){setTimeout(r,ms)})}
  function nextPaint(){return new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r)})})}
  function params(){return new URLSearchParams(location.search)}
  function api(path){return CFG.baseUrl+path}
  function post(path,payload){return fetch(api(path),{method:'POST',mode:'cors',cache:'no-store',headers:{'Content-Type':'application/json','X-AVP-Request':'1'},body:JSON.stringify(payload||{})}).then(function(r){return r.json()})}
  function getJson(path){return fetch(api(path),{method:'GET',mode:'cors',cache:'no-store',headers:{'X-AVP-Request':'1'}}).then(function(r){return r.json()})}
  function signEventPayload(evt){ if(!keyPair||!keyPair.privateKey||!visitorToken)return Promise.resolve(evt); var details=evt.details||{}; return sha256hex(JSON.stringify(details)).then(function(dh){ var env={projectKey:projectKey,visitorToken:visitorToken,type:evt.type,reason:evt.reason||'none',seq:++eventSeq,detailsHash:dh,pageUrl:location.href,ts:Date.now()}; return signPayload(env).then(function(sig){ evt.eventEnvelope=env; evt.eventSignature=sig; return evt; });}).catch(function(){return evt}); }
  function flushEvents(force){ if(!eventQueue.length)return Promise.resolve(); var batch=eventQueue.splice(0,eventQueue.length); if(eventTimer){clearTimeout(eventTimer);eventTimer=null} return Promise.all(batch.map(signEventPayload)).then(function(events){ var payload={projectKey:projectKey,visitorToken:visitorToken,events:events}; if(navigator.sendBeacon&&force){try{var blob=new Blob([JSON.stringify(payload)],{type:'application/json'}); if(navigator.sendBeacon(api('/api/v1/events/batch'),blob))return {success:true}}catch(e){}} return post('/api/v1/events/batch',payload);}).catch(function(){}); }
  function emit(type,reason,details){try{var evt={projectKey:projectKey,visitorToken:visitorToken,type:type,reason:reason||'none',details:details||{pageUrl:location.href}}; if(!visitorToken||!(H.eventBatching!==false)){return signEventPayload(evt).then(function(signed){return post('/api/v1/events',signed)})} eventQueue.push(evt); if(eventQueue.length>=10)return flushEvents(false); if(!eventTimer)eventTimer=setTimeout(function(){flushEvents(false)},4000); }catch(e){}}
  function withInternal(fn){internalMutation=true;try{return fn()}finally{setTimeout(function(){internalMutation=false},130)}}
  function hideProtected(){if(mode==='observe-only')return; var el=qs(protectedSelector); if(el){el.setAttribute('data-avp-original-visibility',el.style.visibility||'');el.style.visibility='hidden';el.style.filter='blur(4px)';}}
  function showProtected(){var el=qs(protectedSelector); if(el){el.style.visibility=el.getAttribute('data-avp-original-visibility')||'';el.style.filter='';} unlocked=true;}
  function ensureAdContainer(){var el=qs(adSelector); if(el) return el; if(!CFG.autoCreateAdContainer)return null; el=document.createElement('div'); el.id=(adSelector.charAt(0)==='#'?adSelector.slice(1):'avp-ad-slot'); el.style.cssText='width:300px;min-height:250px;margin:20px auto;'; document.body.appendChild(el); return el;}
  function loader(text){if(!CFG.loaderEnabled||document.getElementById('avp-loader'))return; var d=document.createElement('div'); d.id='avp-loader'; d.style.cssText='position:fixed;inset:0;z-index:2147483000;background:rgba(246,240,230,.92);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;color:#244d6b;'; d.innerHTML='<div style="width:min(430px,92vw);background:rgba(255,255,255,.82);border:1px solid rgba(74,144,217,.22);border-radius:24px;padding:32px;text-align:center;box-shadow:0 20px 70px rgba(47,97,141,.16)"><div style="width:54px;height:54px;margin:0 auto 18px;border-radius:50%;border:4px solid #d7ebff;border-top-color:#4a90d9;animation:avpSpin .9s linear infinite"></div><div style="font-size:22px;font-weight:800;margin-bottom:8px">Please wait</div><div id="avp-loader-text" style="font-size:14px;opacity:.75">'+(text||'Checking page visibility')+'</div><style>@keyframes avpSpin{to{transform:rotate(360deg)}}</style></div>'; document.documentElement.appendChild(d)}
  function loaderText(t){var el=document.getElementById('avp-loader-text'); if(el)el.textContent=t}
  function hideLoader(){var d=document.getElementById('avp-loader'); if(!d)return; d.style.transition='opacity .35s ease,transform .35s ease'; d.style.opacity='0'; d.style.transform='translateY(-6px)'; setTimeout(function(){if(d&&d.parentNode)d.parentNode.removeChild(d)},390)}
  function clientEsc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function hardLockPage(title,msg,reason){
    try{emit('overlay_shown',reason,{pageUrl:location.href,kind:'hard_lock'});}catch(e){}
    overlayShown=true; stopTimers(); hideLoader();
    var safeTitle=clientEsc(title||'Access paused'), safeMsg=clientEsc(msg||'This page requires a verified ad area to continue.'), safeReason=clientEsc(reason||'verification_failed');
    document.documentElement.setAttribute('data-avp-lock','hard');
    document.body.innerHTML='<main id="avp-hard-lock" style="position:fixed;inset:0;z-index:2147483647;min-height:100vh;display:grid;place-items:center;padding:24px;background:#111;color:#fff;font-family:Arial,sans-serif"><section style="max-width:560px;width:min(560px,calc(100vw - 36px));padding:34px;border-radius:28px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);text-align:center;box-shadow:0 24px 90px rgba(0,0,0,.35)"><h1 style="font-size:30px;line-height:1.12;margin:0 0 14px">'+safeTitle+'</h1><p style="font-size:16px;line-height:1.65;color:rgba(255,255,255,.74);margin:0">'+safeMsg+'</p><p style="font-size:12px;line-height:1.5;color:rgba(255,255,255,.45);margin:18px 0 0">Reason: '+safeReason+'</p><button id="avp-hard-retry" style="margin-top:24px;background:#4a90d9;color:#fff;border:0;border-radius:16px;padding:13px 18px;font-weight:700;cursor:pointer">Refresh page</button></section></main>';
    document.body.style.margin='0';
    var b=document.getElementById('avp-hard-retry'); if(b)b.onclick=function(){location.reload()};
  }
  function showOverlay(title,msg,reason,kind){if(overlayShown)return; var oc=CFG.overlayCopy||{}; if(kind==='block'&&oc.blockTitle)title=oc.blockTitle; if(kind==='block'&&oc.blockMessage)msg=oc.blockMessage; if(kind==='soft'&&oc.softTitle)title=oc.softTitle; if(kind==='soft'&&oc.softMessage)msg=oc.softMessage; if(kind==='block'&&H.hardLockOnBlock!==false){hardLockPage(title,msg,reason);return;} overlayShown=true; stopTimers(); hideLoader(); var o=document.createElement('div'); o.id='avp-overlay'; o.style.cssText='position:fixed;inset:0;z-index:2147483100;background:rgba(246,240,230,.94);backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;padding:22px;font-family:Arial,sans-serif;color:#1a1a1a;'; var border=kind==='soft'?'#4a90d9':'#9f3434'; o.innerHTML='<div style="max-width:560px;background:rgba(255,255,255,.9);border:1px solid rgba(0,0,0,.1);border-left:5px solid '+border+';border-radius:24px;padding:30px;box-shadow:0 24px 80px rgba(0,0,0,.16)"><div style="font-size:26px;font-weight:850;margin-bottom:12px">'+clientEsc(title)+'</div><div style="font-size:16px;line-height:1.65;color:#56504a">'+clientEsc(msg)+'</div><button id="avp-retry" style="margin-top:22px;background:#121212;color:#fff;border:0;border-radius:14px;padding:12px 16px;font-weight:800;cursor:pointer">Try again</button></div>'; document.body.appendChild(o); var btn=document.getElementById('avp-retry'); if(btn)btn.onclick=function(){location.reload()}; emit('overlay_shown',reason,{pageUrl:location.href,kind:kind||'block'});}
  function arrayBufferToBase64(buffer){var bytes=new Uint8Array(buffer),binary='',chunk=0x8000;for(var i=0;i<bytes.length;i+=chunk){binary+=String.fromCharCode.apply(null,bytes.subarray(i,i+chunk))}return btoa(binary)}
  function canonicalPayload(payload){var out={};Object.keys(payload).sort().forEach(function(k){out[k]=payload[k]});return JSON.stringify(out)}
  function sha256hex(str){return crypto.subtle.digest('SHA-256',new TextEncoder().encode(str)).then(function(hash){return Array.from(new Uint8Array(hash)).map(function(b){return b.toString(16).padStart(2,'0')}).join('')})}
  function canvasProof(nonce){var r=parseInt(nonce.slice(0,2),16)||0,g=parseInt(nonce.slice(2,4),16)||0,b=parseInt(nonce.slice(4,6),16)||0;var canvas=document.createElement('canvas');canvas.width=10;canvas.height=10;var ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='rgb('+r+','+g+','+b+')';ctx.fillRect(0,0,10,10);var pixels=Array.from(ctx.getImageData(0,0,10,10).data).join(',');return sha256hex(pixels+nonce)}
  function createSessionKey(){if(!window.crypto||!crypto.subtle)return Promise.resolve(null);return crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']).then(function(k){keyPair=k;return crypto.subtle.exportKey('jwk',k.publicKey)})}
  function signPayload(payload){if(!keyPair||!keyPair.privateKey)return Promise.resolve('');var data=new TextEncoder().encode(canonicalPayload(payload));return crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keyPair.privateKey,data).then(arrayBufferToBase64)}
  function generateNoise(){if(!H.domNoise)return; if(noiseContainer&&noiseContainer.isConnected)noiseContainer.remove(); noiseContainer=document.createElement('div'); noiseContainer.setAttribute('aria-hidden','true'); noiseContainer.style.cssText='display:none!important;position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;'; var frag=document.createDocumentFragment(); var isMobile=/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent||''); if(H.adaptivePerformance&&document.hidden)return; var min=Number(H.domNoiseMin||500), max=Number(H.domNoiseMax||700); if(isMobile)max=Math.min(max,Number(H.mobileDomNoiseMax||160)); var count=Math.min(max, min+Math.floor(Math.random()*Math.max(1,max-min)));  var tags=['div','span','p','section','article','nav','li','a','em','strong']; var prefixes=['ad','banner','sponsor','promo','creative','slot','pub','media','block','unit','placement','display']; for(var i=0;i<count;i++){var el=document.createElement(tags[Math.floor(Math.random()*tags.length)]);var prefix=prefixes[Math.floor(Math.random()*prefixes.length)];el.id=prefix+'-'+Math.random().toString(36).slice(2)+'-'+i;el.className=prefix+'-'+Math.random().toString(36).slice(2)+' adsbygoogle '+prefix+'-slot';el.setAttribute('data-slot',Math.random().toString(36).slice(2));frag.appendChild(el)} noiseContainer.appendChild(frag); document.body.appendChild(noiseContainer); emit('dom_noise_generated','noise_pool_created',{pageUrl:location.href,count:count});}
  function loadProbe(){return new Promise(function(resolve){ if(params().has('simulateAdBlock')) return resolve(false); if(params().has('simulateConnectionIssue')) return resolve(false); window.__avpProbeOk=0; var s=document.createElement('script'); var done=false; var t=setTimeout(function(){if(done)return;done=true;resolve(false)},4000); s.src=api('/ads/network-probe.js?projectKey='+encodeURIComponent(projectKey)+'&r='+Date.now()); s.async=true; s.onload=function(){if(done)return;done=true;clearTimeout(t);resolve(window.__avpProbeOk===1)}; s.onerror=function(){if(done)return;done=true;clearTimeout(t);resolve(false)}; document.head.appendChild(s); });}
  function neutralPing(){ if(params().has('simulateConnectionIssue')) return Promise.resolve(false); return fetch(api('/api/v1/ping?projectKey='+encodeURIComponent(projectKey)+'&r='+Date.now()),{mode:'cors',cache:'no-store'}).then(function(r){return !!r.ok}).catch(function(){return false})}
  function networkState(){return Promise.all([neutralPing(),loadProbe()]).then(function(a){var neutral=a[0],probe=a[1]; if(!neutral&&!probe)return 'probable_connection_issue'; if(neutral&&!probe)return 'probable_network_filter'; return 'ok'})}
  function visible(el){ if(!el||!el.isConnected)return false; var r=el.getBoundingClientRect(); var cs=getComputedStyle(el); return r.width>20&&r.height>20&&cs.display!=='none'&&cs.visibility!=='hidden'&&Number(cs.opacity||1)>0.05;}
  function visibilityRatio(el){return new Promise(function(resolve){if(!el||!window.IntersectionObserver)return resolve(visible(el)?1:0);var done=false,obs;function finish(v){if(done)return;done=true;if(obs)obs.disconnect();resolve(v)};obs=new IntersectionObserver(function(entries){var e=entries[0];finish(e&&e.isIntersecting?e.intersectionRatio:0)},{threshold:[0,.25,.5,.75,1]});obs.observe(el);setTimeout(function(){finish(visible(el)?1:0)},900)})}
  function adVisible(){var c=qs(adSelector); if(!visible(c))return false; var slot=c.querySelector('[data-avp-slot]')||c.firstElementChild; return visible(slot||c)}
  function getChallenge(kind){return post('/api/v1/challenge',{projectKey:projectKey,visitorToken:visitorToken,kind:kind||'content'}).then(function(data){if(!data||!data.success)throw new Error(data&&data.reason||'challenge_failed');currentChallenge=data.challenge;return data.challenge})}
  function renderAd(reason, challenge){var c=ensureAdContainer(); if(!c)return Promise.resolve(false); return withInternal(function(){c.innerHTML='<div style="width:300px;min-height:250px;border-radius:14px;background:linear-gradient(135deg,#d9ecff,#f4fbff);display:flex;align-items:center;justify-content:center;color:#477399;font-family:Arial,sans-serif">Loading sponsored area...</div>'; return getJson('/api/v1/ad-fragment?projectKey='+encodeURIComponent(projectKey)+'&visitorToken='+encodeURIComponent(visitorToken)+'&reason='+encodeURIComponent(reason||'initial')+'&nonce='+encodeURIComponent((challenge&&challenge.nonce)||'')+'&slotId='+encodeURIComponent((challenge&&challenge.slotId)||'')+'&baitToken='+encodeURIComponent((challenge&&challenge.baitToken)||'')).then(function(data){ if(!data||!data.success)return false; return withInternal(function(){c.innerHTML=data.html; generateNoise(); return nextPaint().then(function(){return adVisible()})}); }).catch(function(){return false});});}
  function proveAndUnlock(challenge){var c=ensureAdContainer(); var slot=c&&(c.querySelector('[data-avp-slot]')||c.firstElementChild); return Promise.all([visibilityRatio(slot||c), canvasProof(challenge.nonce)]).then(function(r){var ratio=r[0], proof=r[1]; var payload={kind:'content',seq:challenge.seq,nonce:challenge.nonce,slotId:challenge.slotId,poolToken:challenge.poolToken,proof:proof,visibleRatioScaled:Math.round(ratio*1000),baitNetworkOk:true,baitDomVisible:adVisible(),pageUrl:location.href,mode:mode}; return signPayload(payload).then(function(signature){return post('/api/v1/proof',{projectKey:projectKey,visitorToken:visitorToken,payload:payload,signature:signature}).then(function(data){if(!data||!data.success)throw new Error(data&&data.reason||'proof_failed');return data})})})}
  function scheduledRerender(){if(!unlocked||overlayShown)return; if(H.pauseWhenHidden&&document.hidden)return; getChallenge('refresh').then(function(ch){return renderAd('scheduled_rerender',ch)}).then(function(ok){emit('scheduled_rerender',ok?'rerender_ok':'rerender_failed',{pageUrl:location.href}); if(!ok) restoreOrOverlay('scheduled_rerender_failed')}).catch(function(){restoreOrOverlay('scheduled_rerender_error')})}
  function restoreOrOverlay(reason){if(overlayShown)return; restored++; emit('ad_restore',reason,{pageUrl:location.href,count:restored}); if(restored>maxRestores){showOverlay('Ad area is unavailable again','The system restored the ad container several times, but it keeps disappearing or becoming hidden. Please allow the ad area to continue.','persistent_dom_tamper','block');return;} getChallenge('restore').then(function(ch){return renderAd('restore_after_tamper',ch)})}
  function startObserver(){var c=qs(adSelector); if(!c||observer)return; observer=new MutationObserver(function(){ if(internalMutation||!unlocked)return; clearTimeout(window.__avpRestoreTimer); window.__avpRestoreTimer=setTimeout(function(){ if(adVisible())return; restoreOrOverlay('dom_tamper_or_hidden'); },160); }); observer.observe(c,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class','hidden','aria-hidden']}); bodyObserver=new MutationObserver(function(){ if(internalMutation||!unlocked)return; var c2=qs(adSelector); if(!c2||!adVisible())restoreOrOverlay('ad_container_removed_or_hidden');}); bodyObserver.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class','hidden','aria-hidden']});}
  function heartbeat(){if(!unlocked||overlayShown||!H.heartbeat)return; if(H.pauseWhenHidden&&document.hidden)return; if(!adVisible()){post('/api/v1/heartbeat',{projectKey:projectKey,visitorToken:visitorToken,status:'failed',adStatus:'not_visible',reason:'heartbeat_ad_not_visible',pageUrl:location.href}).catch(function(){});restoreOrOverlay('heartbeat_ad_not_visible');return;} neutralPing().then(function(ok){if(ok){return post('/api/v1/heartbeat',{projectKey:projectKey,visitorToken:visitorToken,status:'ok',adStatus:'visible',reason:'heartbeat_ok',pageUrl:location.href}).then(function(hb){if(!hb||!hb.success||hb.leaseValid===false)throw new Error('heartbeat_rejected');lastHeartbeatOk=Date.now();lostHeartbeats=0;emit('heartbeat','ok',{pageUrl:location.href,leaseValidUntil:hb.leaseValidUntil||''});});} lostHeartbeats++; emit('heartbeat_lost','ping_failed',{pageUrl:location.href,count:lostHeartbeats}); if(lostHeartbeats>=3||Date.now()-lastHeartbeatOk>15000){showOverlay('Page verification stopped','The verification layer is unavailable or the page state is frozen. Refresh the page and allow the ad container.','heartbeat_lost','block');}}).catch(function(){lostHeartbeats++;emit('heartbeat_lost','heartbeat_endpoint_failed',{pageUrl:location.href,count:lostHeartbeats});if(lostHeartbeats>=3||Date.now()-lastHeartbeatOk>15000){showOverlay('Page verification stopped','The verification layer is unavailable or the page state is frozen. Refresh the page and allow the ad container.','heartbeat_lost','block');}})}
  function stopTimers(){if(observer)observer.disconnect();if(bodyObserver)bodyObserver.disconnect();if(rerenderTimer)clearInterval(rerenderTimer);if(heartbeatTimer)clearInterval(heartbeatTimer);observer=null;bodyObserver=null;rerenderTimer=null;heartbeatTimer=null;}
  function pathRuleMatch(pathname,rule){rule=String(rule||'').trim(); if(!rule)return false; if(rule.slice(-1)==='*')return pathname.indexOf(rule.slice(0,-1))===0; return pathname===rule||pathname.indexOf(rule+'/')===0}
  function pathAllowed(){var p=location.pathname||'/'; var r=CFG.pathRules||{}, deny=r.deny||[], allow=r.allow||[]; for(var i=0;i<deny.length;i++)if(pathRuleMatch(p,deny[i]))return false; if(allow.length){for(var j=0;j<allow.length;j++)if(pathRuleMatch(p,allow[j]))return true; return false;} return true;}
  function init(){if(!pathAllowed()){console.warn('AVP skipped by project path rules');return;} hideProtected(); loader('Preparing protected content'); createSessionKey().then(function(pub){loaderText('Creating protected session'); return post('/api/v1/session',{projectKey:projectKey,pageUrl:location.href,mode:mode,clientPublicKey:pub});}).then(function(sess){ if(!sess||!sess.success)throw new Error('session_failed'); visitorToken=sess.visitorToken; if(location.pathname.indexOf('/test-site')===0||location.pathname.indexOf('/foreign-test-site')===0||window.__AVP_DEBUG_VISITOR_TOKEN__===true){window.__AVP_VISITOR_TOKEN__=visitorToken;} loaderText('Checking connection and ad container'); return networkState(); }).then(function(net){ if(net==='probable_connection_issue'){emit('connection_issue','neutral_and_ad_probe_failed',{pageUrl:location.href}); showProtected(); showOverlay('Connection issue detected','Some page resources did not load. This is not treated as ad blocking, but the page should be refreshed after the connection is restored.','probable_connection_issue','soft'); return false;} if(net==='probable_network_filter'){showOverlay('Ad resources are unavailable','It looks like the browser or an extension is blocking ad resources. Please allow the ad area to access protected content.','probable_network_filter','block'); return false;} loaderText('Getting one-time challenge'); return getChallenge('content'); }).then(function(ch){if(ch===false)return false; loaderText('Checking ad visibility'); return renderAd('initial',ch).then(function(ok){return ok?ch:false})}).then(function(ch){ if(ch===false)return; if(!ch){showOverlay('Ad block is not visible','Content remains locked because the ad container did not pass visibility verification.','ad_container_not_visible','block'); return;} loaderText('Confirming ad visibility'); return proveAndUnlock(ch); }).then(function(proof){ if(!proof)return; if(mode!=='observe-only')showProtected(); hideLoader(); emit('content_unlocked','ad_visible_and_proof_ok',{pageUrl:location.href,mode:mode}); startObserver(); if(H.scheduledRerender)rerenderTimer=setInterval(scheduledRerender,Number(H.rerenderIntervalMs||30000)); if(H.heartbeat)heartbeatTimer=setInterval(heartbeat,Number(H.heartbeatIntervalMs||2000)); }).catch(function(e){emit('client_error','sdk_init_failed',{pageUrl:location.href,message:String(e&&e.message||e)}); if(mode==='observe-only'){showProtected(); hideLoader();}else{showOverlay('Verification was not completed','The system could not verify ad visibility and the protected browser session. Refresh the page, allow the ad container or disable blocking extensions for this site.','sdk_or_proof_failed','block');}});}
  document.addEventListener('visibilitychange',function(){ if(document.hidden){flushEvents(true);return;} if(!document.hidden&&unlocked&&!overlayShown){ if(H.scheduledRerender)scheduledRerender(); }});
  window.addEventListener('pagehide',function(){flushEvents(true)});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init); else init();
})();`;
}


function httpGetText(url, limit = 1024 * 64) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.get(u, { timeout: 8000, headers: { 'User-Agent': 'AVP-Domain-Verifier/1.0' } }, (r) => {
      if (r.statusCode && r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        r.resume(); return resolve(httpGetText(new URL(r.headers.location, u).toString(), limit));
      }
      if (r.statusCode !== 200) { r.resume(); return reject(new Error(`http_${r.statusCode}`)); }
      let data = '';
      r.setEncoding('utf8');
      r.on('data', chunk => { data += chunk; if (data.length > limit) { req.destroy(new Error('response_too_large')); } });
      r.on('end', () => resolve(data));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}
async function verifyDomainOwnership(project, domain) {
  domain = sanitizeDomain(domain);
  if (!domain) throw new Error('domain_required');
  project.domainVerification = Object.assign(defaultDomainVerification(project.allowedDomains || []), project.domainVerification || {});
  project.domainVerification.tokens = project.domainVerification.tokens || {};
  const token = project.domainVerification.tokens[domain] || '';
  if (!token) throw new Error('verification_token_missing');
  if (APP_ENV !== 'production' && ['localhost','127.0.0.1'].includes(domain)) {
    if (!project.domainVerification.verifiedDomains.includes(domain)) project.domainVerification.verifiedDomains.push(domain);
    return { ok: true, method: 'development-localhost' };
  }
  const body = await httpGetText(`https://${domain}/.well-known/avp-verify.txt`);
  if (!body.includes(token)) throw new Error('verification_token_not_found');
  if (!project.domainVerification.verifiedDomains.includes(domain)) project.domainVerification.verifiedDomains.push(domain);
  project.domainVerification.lastCheckedAt = iso();
  project.domainVerification.lastError = '';
  return { ok: true, method: 'well-known-file' };
}
function projectStatusPage(user, project) {
  const s = statsFor(project.id);
  const quota = projectQuota(project);
  const verified = (project.domainVerification?.verifiedDomains || []).join(', ') || '—';
  const op = projectIsOperational(project);
  const lastEvents = latestEvents(10, project.id).map(e => `<tr><td>${esc(e.time)}</td><td>${esc(e.type)}</td><td>${esc(e.reason)}</td><td>${esc(e.domain || '')}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No events</td></tr>';
  const warnings = [];
  if (!op.ok) warnings.push(op.reason);
  if (APP_ENV === 'production' && project.domainVerification?.requiredInProduction !== false && !(project.domainVerification?.verifiedDomains || []).length) warnings.push('production_requires_verified_domain');
  if (monthlyStatCount(s, 'events') > quota.monthlyEvents * 0.8) warnings.push('monthly_events_quota_above_80_percent');
  if ((s.webCryptoProofFailed || 0) > (s.webCryptoProofOk || 0) && s.webCryptoProofFailed > 10) warnings.push('proof_failures_exceed_successes');
  return appShell('Project status', `<section><p><a href="/admin/projects/${project.id}">← Project</a></p><h1 class="title">Integration health: ${esc(project.name)}</h1><p class="lead">Quick integration health check before customer setup and during operation.</p></section><section class="grid cols3 section"><div class="card"><h2>Operational</h2><p><span class="pill ${op.ok ? 'good':'bad'}">${op.ok ? 'ok':esc(op.reason)}</span></p><p class="muted">Mode: ${esc(project.mode)} · SDK: ${esc(project.sdkVersion)} · Plan: ${esc(project.planId)}</p></div><div class="card"><h2>Domains</h2><p class="muted">Allowed: ${esc((project.allowedDomains || []).join(', ') || '—')}</p><p class="muted">Verified: ${esc(verified)}</p></div><div class="card"><h2>Quota</h2><p class="muted">Events this month: ${monthlyStatCount(s, 'events')} / ${quota.monthlyEvents}<br>Server verify: ${monthlyStatCount(s, 'serverVerifications')} / ${quota.monthlyServerVerifications}</p></div></section><section class="card section"><h2>Warnings</h2><p class="${warnings.length ? 'notice danger':'notice ok'}">${warnings.length ? esc(warnings.join(', ')) : 'No critical warnings detected.'}</p></section><section class="card section"><h2>Recent events</h2><table class="table"><thead><tr><th>Time</th><th>Type</th><th>Reason</th><th>Domain</th></tr></thead><tbody>${lastEvents}</tbody></table></section>`, user);
}
function projectExportJson(project) {
  const safe = JSON.parse(JSON.stringify(project));
  normalizeProjectSecrets(safe);
  for (const sec of safe.secrets || []) sec.secretKeyEnc = '[encrypted-secret-redacted]';
  safe.secretKeyEnc = '[encrypted-secret-redacted]';
  return { schema: 'avp.project_export.v1', exportedAt: iso(), version: CURRENT_VERSION, project: safe, stats: statsFor(project.id), recentEvents: latestEvents(500, project.id) };
}

async function handleAdmin(req, res, url) {
  if (url.pathname === '/admin/login' && req.method === 'GET') return send(res, 200, loginPage());
  if (url.pathname === '/admin/login' && req.method === 'POST') {
    const loginKey = requestIpKey(req) + '|admin-login';
    if (!rateLimitBucket(loginAttempts, loginKey, ADMIN_LOGIN_LIMIT_WINDOW, ADMIN_LOGIN_LIMIT_MAX)) {
      return send(res, 429, loginPage('Too many login attempts. Please wait a few minutes and try again.'));
    }
    const form = await readForm(req);
    const user = state.users.find(u => u.email === form.email);
    if (!user || !passwordOk(form.password || '', user.password)) { appendAudit(req, 'login_failed', { email: form.email || '', reason: 'bad_password' }, null); return send(res, 401, loginPage('Invalid email or password')); }
    if (user.mfa?.enabled && !verifyTotp(user.mfa.secret, form.mfaCode || '')) { appendAudit(req, 'login_failed', { email: user.email, reason: 'bad_mfa' }, user); return send(res, 401, loginPage('Invalid MFA code')); }
    if (APP_ENV === 'production' && REQUIRE_MFA_IN_PRODUCTION && !user.mfa?.enabled) { appendAudit(req, 'login_blocked_mfa_required', { email: user.email }, user); return send(res, 403, loginPage('Production requires MFA. Enable MFA in development/admin setup or temporarily disable REQUIRE_MFA_IN_PRODUCTION.')); }
    if (user.password?.algo !== 'pbkdf2-sha256') user.password = passwordRecord(form.password || '');
    const sid = randomId('adm', 24);
    state.adminSessions[sid] = { userId: user.id, createdAt: now(), lastSeen: now(), csrfToken: randomKey('csrf'), mfaOk: Boolean(user.mfa?.enabled) };
    appendAudit(req, 'login_success', { email: user.email }, user);
    scheduleSave();
    res.writeHead(302, { Location: '/admin', 'Set-Cookie': `${ADMIN_COOKIE}=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Lax; Secure`, 'Cache-Control': 'no-store' });
    return res.end();
  }
  if (url.pathname === '/admin/logout' && req.method === 'POST') {
    const form = await readForm(req);
    const logoutUser = userFromAdminSession(req);
    if (!checkAdminCsrf(req, form)) return denyBadCsrf(res, logoutUser);
    const sid = parseCookies(req.headers.cookie || '')[ADMIN_COOKIE];
    if (sid) delete state.adminSessions[sid];
    appendAudit(req, 'logout', {}, logoutUser);
    scheduleSave();
    res.writeHead(302, { Location: '/admin/login', 'Set-Cookie': `${ADMIN_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure` });
    return res.end();
  }
  const user = requireAdmin(req, res); if (!user) return;
  if (url.pathname === '/admin/backup-now' && req.method === 'POST') {
    const form = await readForm(req);
    if (!checkAdminCsrf(req, form)) return denyBadCsrf(res, user);
    const file = backupNow('manual'); appendAudit(req, 'backup_created', { file }, user);
    return send(res, 200, appShell('Backup created', `<section class="card"><h1 class="title">Backup created</h1><p class="lead">State backup saved locally and restore-check validation passed.</p><pre>${esc(file)}</pre><p><a class="btn blue" href="/admin">Back to dashboard</a></p></section>`, user));
  }
  if (url.pathname === '/admin' && req.method === 'GET') return send(res, 200, dashboardPage(user));
  if (url.pathname === '/admin/security' && req.method === 'GET') return send(res, 200, securityPage(user));
  if (url.pathname === '/admin/security/mfa-generate' && req.method === 'POST') { const form = await readForm(req); if (!checkAdminCsrf(req, form)) return denyBadCsrf(res, user); const realUser = state.users.find(u => u.id === user.id); realUser.mfaSetupSecret = newTotpSecret(); appendAudit(req, 'mfa_generate', {}, user); scheduleSave(); return send(res, 200, securityPage(realUser, 'TOTP secret generated. Add it to Authenticator and confirm the code.')); }
  if (url.pathname === '/admin/security/mfa-enable' && req.method === 'POST') { const form = await readForm(req); if (!checkAdminCsrf(req, form)) return denyBadCsrf(res, user); const realUser = state.users.find(u => u.id === user.id); if (!realUser?.mfaSetupSecret || !verifyTotp(realUser.mfaSetupSecret, form.code || '')) return send(res, 403, securityPage(realUser || user, 'MFA code invalid.')); realUser.mfa = { enabled: true, secret: realUser.mfaSetupSecret, backupCodes: Array.from({length:6},()=>randomKey('mfa').slice(0,16)) }; delete realUser.mfaSetupSecret; appendAudit(req, 'mfa_enabled', {}, user); scheduleSave(); return send(res, 200, securityPage(realUser, 'MFA enabled. Save backup codes from state securely if needed.')); }
  if (url.pathname === '/admin/security/kill-switch' && req.method === 'POST') { const form = await readForm(req); if (!checkAdminCsrf(req, form)) return denyBadCsrf(res, user); state.settings.killSwitch = form.enabled === 'true'; state.settings.updatedAt = iso(); appendAudit(req, state.settings.killSwitch ? 'global_kill_switch_enabled' : 'global_kill_switch_disabled', {}, user); scheduleSave(); return send(res, 200, securityPage(user, `Global kill switch ${state.settings.killSwitch ? 'enabled' : 'disabled'}.`)); }
  if (url.pathname === '/admin/projects/new' && req.method === 'GET') return send(res, 200, projectFormPage(user));
  const exportMatch = url.pathname.match(/^\/admin\/projects\/([^/]+)\/export\.csv$/);
  if (exportMatch && req.method === 'GET') {
    const project = projectById(exportMatch[1]);
    if (!project) return send(res, 404, appShell('Not found', '<section class="card"><h1>Project not found</h1></section>', user));
    const rows = [['time','project','type','reason','visitor','origin','page','ipHash','userAgent']];
    for (const e of (statsFor(project.id).recentEvents || [])) rows.push([e.time,e.projectName,e.type,e.reason,e.visitor,e.origin,e.page,e.ipHash,e.ua]);
    appendAudit(req, 'project_events_exported', { projectId: project.id, rows: rows.length - 1 }, user);
    const csv = rows.map(r => r.map(v => '"' + String(v || '').replace(/"/g, '""') + '"').join(',')).join('\n');
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${project.publicKey}-events.csv"`, 'Cache-Control': 'no-store' });
    return res.end(csv);
  }


  const exportJsonMatch = url.pathname.match(/^\/admin\/projects\/([^/]+)\/export\.json$/);
  if (exportJsonMatch && req.method === 'GET') {
    const project = projectById(exportJsonMatch[1]);
    if (!project) return send(res, 404, appShell('Not found', '<section class="card"><h1>Project not found</h1></section>', user));
    if (!roleCan(user, 'export')) return send(res, 403, appShell('Forbidden', '<section class="card"><h1>403</h1></section>', user));
    const body = JSON.stringify(projectExportJson(project), null, 2);
    res.writeHead(200, securityHeaders({ 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${project.id}-export.json"`, 'Cache-Control': 'no-store', 'X-Request-Id': res._requestId || '' }));
    return res.end(body);
  }
  const statusMatch = url.pathname.match(/^\/admin\/projects\/([^/]+)\/status$/);
  if (statusMatch && req.method === 'GET') {
    const project = projectById(statusMatch[1]);
    if (!project) return send(res, 404, appShell('Not found', '<section class="card"><h1>Project not found</h1></section>', user));
    return send(res, 200, projectStatusPage(user, project));
  }
  const tokenMatch = url.pathname.match(/^\/admin\/projects\/([^/]+)\/domain-token$/);
  if (tokenMatch && req.method === 'POST') {
    const form = await readForm(req); if (!checkAdminCsrf(req, form)) return denyBadCsrf(res, user);
    const project = projectById(tokenMatch[1]); if (!project) return send(res, 404, appShell('Not found', '<section class="card"><h1>Project not found</h1></section>', user));
    if (!roleCan(user, 'write')) return send(res, 403, projectPage(user, project, 'Forbidden'));
    const domain = sanitizeDomain(form.domain || '');
    project.allowedDomains = uniqueDomainList(project.allowedDomains || []);
    project.domainVerification = Object.assign(defaultDomainVerification(project.allowedDomains || []), project.domainVerification || {});
    project.domainVerification.tokens = project.domainVerification.tokens || {};
    project.domainVerification.tokens[domain] = project.domainVerification.tokens[domain] || `avp-domain-verification=${randomKey('verify')}`;
    if (domain && !project.allowedDomains.includes(domain)) project.allowedDomains.push(domain);
    appendAudit(req, 'domain_verification_token_generated', { projectId: project.id, domain }, user); scheduleSave();
    return send(res, 200, projectPage(user, project, `Verification token created for ${domain}. Put it into https://${domain}/.well-known/avp-verify.txt`));
  }
  const verifyMatch = url.pathname.match(/^\/admin\/projects\/([^/]+)\/domain-verify$/);
  if (verifyMatch && req.method === 'POST') {
    const form = await readForm(req); if (!checkAdminCsrf(req, form)) return denyBadCsrf(res, user);
    const project = projectById(verifyMatch[1]); if (!project) return send(res, 404, appShell('Not found', '<section class="card"><h1>Project not found</h1></section>', user));
    if (!roleCan(user, 'write')) return send(res, 403, projectPage(user, project, 'Forbidden'));
    const domain = sanitizeDomain(form.domain || '');
    try { const result = await verifyDomainOwnership(project, domain); appendAudit(req, 'domain_verified', { projectId: project.id, domain, method: result.method }, user); scheduleSave(); return send(res, 200, projectPage(user, project, `Domain verified: ${domain}`)); }
    catch (err) { project.domainVerification.lastError = err.message; appendAudit(req, 'domain_verification_failed', { projectId: project.id, domain, error: err.message }, user); scheduleSave(); return send(res, 200, projectPage(user, project, `Domain verification failed for ${domain}: ${err.message}`)); }
  }
  const deleteMatch = url.pathname.match(/^\/admin\/projects\/([^/]+)\/delete$/);
  if (deleteMatch && req.method === 'POST') {
    const form = await readForm(req); if (!checkAdminCsrf(req, form)) return denyBadCsrf(res, user);
    const project = projectById(deleteMatch[1]); if (!project) return send(res, 404, appShell('Not found', '<section class="card"><h1>Project not found</h1></section>', user));
    if (!roleCan(user, 'write') || String(form.confirm || '') !== 'DELETE') return send(res, 403, projectPage(user, project, 'Deletion not confirmed. Type DELETE.'));
    const exportFile = path.join(BACKUP_DIR, `offboarding-${project.id}-${Date.now()}.json`); ensureDir(BACKUP_DIR); fs.writeFileSync(exportFile, JSON.stringify(projectExportJson(project), null, 2));
    state.projects = state.projects.filter(p => p.id !== project.id); delete state.projectStats[project.id];
    for (const [token, sess] of Object.entries(state.visitorSessions || {})) if (sess.projectId === project.id) delete state.visitorSessions[token];
    appendAudit(req, 'project_offboarded_deleted', { projectId: project.id, exportFile }, user); scheduleSave();
    return send(res, 200, appShell('Project deleted', `<section class="card"><h1 class="title">Project deleted</h1><p class="lead">Local export saved before deletion.</p><pre>${esc(exportFile)}</pre><p><a class="btn blue" href="/admin">Back to dashboard</a></p></section>`, user));
  }

  if (url.pathname === '/admin/projects/create' && req.method === 'POST') {
    const form = await readForm(req);
    if (!checkAdminCsrf(req, form)) return denyBadCsrf(res, user);
    let company = null;
    if (form.companyName) {
      company = { id: randomId('cmp'), name: clamp(form.companyName, 120), contactEmail: clamp(form.contactEmail, 120), notes: '', createdAt: iso() };
      state.companies.push(company);
    } else {
      company = state.companies[0] || { id: randomId('cmp'), name: 'Unnamed Company', contactEmail: '', notes: '', createdAt: iso() };
      if (!state.companies.length) state.companies.push(company);
    }
    const project = {
      id: randomId('prj'), companyId: company.id, name: clamp(form.projectName || 'Untitled Project', 120), publicKey: randomKey('avp_pub'),
      allowedDomains: asArrayLines(form.allowedDomains).map(sanitizeDomain).filter(Boolean), mode: clamp(form.mode || 'soft-gate', 30), protectedSelector: clamp(form.protectedSelector || '#protected-content', 80), adContainerSelector: clamp(form.adContainerSelector || '#ad-slot', 80), marketBenchmarkPercent: Number(form.marketBenchmarkPercent || 33), loaderEnabled: true, autoCreateAdContainer: true, strictness: clamp(form.strictness || 'balanced', 30), planId: 'beta', quota: { monthlyEvents: PLAN_LIMITS.beta.monthlyEvents, monthlyServerVerifications: PLAN_LIMITS.beta.monthlyServerVerifications, maxDomains: PLAN_LIMITS.beta.maxDomains }, pathRules: { allow: [], deny: [] }, overlayCopy: { blockTitle: 'Ad visibility could not be verified', blockMessage: 'The ad area is blocked, hidden, removed, or unavailable. Please allow the ad area and refresh the page to continue.', softTitle: 'Connection issue detected', softMessage: 'Some page resources did not load. Please refresh the page after the connection is restored.' }, ui: { color: ['violet','blue','terra','green'].includes(form.projectColor) ? form.projectColor : 'violet', gradient: ['violet','blue','terra','green'].includes(form.projectColor) ? form.projectColor : 'violet' }, hardening: { webCryptoProof: true, canvasProof: true, signedEvents: true, signedEventsStrict: true, eventBatching: true, domNoise: true, domNoiseMin: 500, domNoiseMax: 700, heartbeat: true, heartbeatIntervalMs: DEFAULT_HEARTBEAT_INTERVAL, scheduledRerender: true, rerenderIntervalMs: DEFAULT_RERENDER_INTERVAL, maxRestores: 4, hardLockOnBlock: true, dynamicSdkUrl: true, polymorphicWrapper: true, encryptedSecrets: true }, createdAt: iso(), updatedAt: iso()
    };
    project.domainVerification = defaultDomainVerification(project.allowedDomains || []);
    setProjectSecret(project, randomKey('avp_sec'));
    state.projects.push(project); state.projectStats[project.id] = defaultProjectStats(); appendAudit(req, 'project_created', { projectId: project.id, publicKey: project.publicKey }, user); scheduleSave(); await persistProjectConfigToPostgres(project);
    return redirect(res, `/admin/projects/${project.id}`);
  }
  const rotateMatch = url.pathname.match(/^\/admin\/projects\/([^/]+)\/rotate-secret$/);
  if (rotateMatch && req.method === 'POST') {
    const project = projectById(rotateMatch[1]);
    if (!project) return send(res, 404, appShell('Not found', '<section class="card"><h1>Project not found</h1></section>', user));
    const form = await readForm(req);
    if (!checkAdminCsrf(req, form)) return denyBadCsrf(res, user);
    const result = rotateProjectSecret(project, Number(form.graceDays || 7));
    appendAudit(req, 'project_secret_rotated', { projectId: project.id, graceUntil: result.graceUntil }, user);
    scheduleSave();
    await persistProjectConfigToPostgres(project);
    return send(res, 200, projectPage(user, project, `New secret created. The old key will remain valid until ${result.graceUntil}. New secret: ${result.newSecret}`));
  }
  const apiKeyMatch = url.pathname.match(/^\/admin\/projects\/([^/]+)\/api-key$/);
  if (apiKeyMatch && req.method === 'POST') {
    const project = projectById(apiKeyMatch[1]);
    if (!project) return send(res, 404, appShell('Not found', '<section class="card"><h1>Project not found</h1></section>', user));
    const form = await readForm(req);
    if (!checkAdminCsrf(req, form)) return denyBadCsrf(res, user);
    const kind = ['server_verify','events_ingest','analytics_readonly'].includes(form.kind) ? form.kind : 'events_ingest';
    const created = createProjectApiKey(project, kind, form.label || 'Scoped API key');
    appendAudit(req, 'project_api_key_created', { projectId: project.id, kind }, user);
    scheduleSave();
    await persistProjectConfigToPostgres(project);
    return send(res, 200, projectPage(user, project, `New ${kind} API key created. Copy it now: ${created.key}`));
  }
  const m = url.pathname.match(/^\/admin\/projects\/([^/]+)(?:\/(update))?$/);
  if (m && req.method === 'GET') {
    const project = projectById(m[1]);
    if (!project) return send(res, 404, appShell('Not found', '<section class="card"><h1>Project not found</h1></section>', user));
    return send(res, 200, projectPage(user, project, '', { reason: url.searchParams.get('reason') || '', domain: url.searchParams.get('domain') || '', date: url.searchParams.get('date') || '' }));
  }
  if (m && m[2] === 'update' && req.method === 'POST') {
    const project = projectById(m[1]);
    if (!project) return send(res, 404, appShell('Not found', '<section class="card"><h1>Project not found</h1></section>', user));
    const form = await readForm(req);
    if (!checkAdminCsrf(req, form)) return denyBadCsrf(res, user);
    project.allowedDomains = asArrayLines(form.allowedDomains);
    project.protectedSelector = clamp(form.protectedSelector || project.protectedSelector, 80);
    project.adContainerSelector = clamp(form.adContainerSelector || project.adContainerSelector, 80);
    project.mode = clamp(form.mode || project.mode, 30);
    project.marketBenchmarkPercent = Number(form.marketBenchmarkPercent || project.marketBenchmarkPercent || 33);
    project.sdkVersion = ['v1','v2'].includes(form.sdkVersion) ? form.sdkVersion : project.sdkVersion;
    project.sdkChannel = ['stable','beta','experimental'].includes(form.sdkChannel) ? form.sdkChannel : project.sdkChannel;
    project.canaryPercent = Math.max(0, Math.min(100, Number(form.canaryPercent || 0)));
    project.fallbackPolicy = ['gentle','balanced','strict'].includes(form.fallbackPolicy) ? form.fallbackPolicy : 'balanced';
    project.enabled = form.enabled !== 'false';
    project.killSwitch = form.killSwitch === 'true';
    project.limits = Object.assign(project.limits || {}, { eventsPerMinute: Number(form.eventsPerMinute || MAX_EVENTS_PER_PROJECT_PER_MINUTE), sessionsPerMinute: Number(form.sessionsPerMinute || MAX_SESSIONS_PER_PROJECT_PER_MINUTE) });
    project.updatedAt = iso(); appendAudit(req, 'project_updated', { projectId: project.id, mode: project.mode, enabled: project.enabled, killSwitch: project.killSwitch }, user); scheduleSave(); await persistProjectConfigToPostgres(project);
    return send(res, 200, projectPage(user, project, 'Project settings saved'));
  }
  return send(res, 404, appShell('Not found', '<section class="card"><h1>Admin route not found</h1></section>', user));
}


async function handleAuth(req, res, url) {
  if (url.pathname === '/auth/register' && req.method === 'POST') {
    const body = await readJson(req);
    const validation = validateClientRegistrationFields(body || {});
    if (!validation.ok) return sendJson(res, 400, { success: false, reason: 'validation_error', message: clientValidationMessage(validation.errors), errors: validation.errors });
    const { email, password, companyName, fullName, phone, termsAccepted } = validation;
    if (await findClientAccountByEmail(email)) return sendJson(res, 409, { success: false, reason: 'account_exists' });
    const account = {
      id: randomId('acct'),
      email,
      fullName,
      phone,
      companyName,
      password: passwordRecord(password),
      provider: 'password',
      role: 'client_owner',
      status: 'trial',
      trialEndsAt: new Date(now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: iso(),
      updatedAt: iso()
    };
    let savedAccount;
    try {
      savedAccount = await createClientAccount(account);
    } catch (err) {
      structuredLog('error', 'client_account_register_api_failed', { emailMasked: maskEmail(email), emailHash: emailHash(email), error: err.message, appDb: appDbPublicStatus() });
      return sendJson(res, 503, { success: false, reason: 'account_database_unavailable', message: 'Account database is not connected. Set DATABASE_URL or POSTGRES_URL and restart the server.', appDb: appDbPublicStatus() });
    }
    appendAudit(req, 'client_account_registered', { accountId: savedAccount.id, email }, null);
    await sendAppEmail(email, 'Welcome to AdProof', 'Your AdProof account was created successfully. You can now create your first project and connect the SDK to your test site.', { accountId: savedAccount.id, type: 'registration_success_api' });
    return sendJson(res, 201, { success: true, accountId: savedAccount.id, email, status: savedAccount.status, trial: trialSnapshot(savedAccount), next: '/login' });
  }

  if (url.pathname === '/auth/google/start' && req.method === 'GET') {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      const wantsHtml = String(req.headers.accept || '').includes('text/html');
      if (!wantsHtml) return sendJson(res, 501, { success: false, reason: 'google_oauth_not_configured', provider: 'google', redirectUri: oauthRedirectUri('google') });
      return send(res, 501, publicAuthPage('Google login not configured', '<section class="card"><h1 class="title">Google login is not configured yet</h1><p class="lead">Set <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> in environment variables, then add this redirect URI in Google Cloud Console:</p><pre>' + esc(oauthRedirectUri('google')) + '</pre><p><a class="btn ghost" href="/login">Back to login</a></p></section>'));
    }
    cleanExpiredOauthStates();
    const stateKey = randomKey('oauth_state');
    oauthStates.set(stateKey, { provider: 'google', createdAt: now(), expiresAt: now() + OAUTH_STATE_TTL });
    return redirect(res, googleAuthUrl(stateKey));
  }
  if (url.pathname === '/auth/google/callback' && req.method === 'GET') {
    const stateKey = String(url.searchParams.get('state') || '');
    const code = String(url.searchParams.get('code') || '');
    const saved = oauthStates.get(stateKey);
    oauthStates.delete(stateKey);
    if (!saved || saved.expiresAt < now() || !code) return send(res, 400, publicAuthPage('Google login failed', '<section class="card"><h1 class="title">Google login failed</h1><p class="lead">OAuth state is missing or expired. Please try again.</p><p><a class="btn blue" href="/login">Back to login</a></p></section>'));
    try {
      const token = await httpsFormPost('https://oauth2.googleapis.com/token', { code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: oauthRedirectUri('google'), grant_type: 'authorization_code' });
      if (token.status < 200 || token.status >= 300 || !token.body.access_token) throw new Error('token_exchange_failed');
      const profile = await httpsJsonGet('https://www.googleapis.com/oauth2/v2/userinfo', token.body.access_token);
      if (profile.status < 200 || profile.status >= 300) throw new Error('profile_fetch_failed');
      structuredLog('log', 'google_oauth_profile_received', { emailMasked: maskEmail(profile.body && profile.body.email), emailHash: emailHash(profile.body && profile.body.email), verifiedEmail: profile.body && profile.body.verified_email !== false });
      const account = await findOrCreateGoogleAccount(profile.body);
      structuredLog('log', 'google_oauth_login_account_ready', { emailMasked: maskEmail(account.email), emailHash: emailHash(account.email), accountId: account.id, provider: account.provider, authDbFile: AUTH_DB_FILE, authDbExists: fs.existsSync(AUTH_DB_FILE), appDb: appDbPublicStatus() });
      appendAudit(req, 'client_google_login_success', { accountId: account.id, email: account.email }, null);
      return createClientPortalSession(res, account, '/account?login=success');
    } catch (err) {
      appendAudit(req, 'client_google_login_failed', { reason: err.message }, null);
      const dbHint = String(err.message || '').startsWith('app_db_required') ? ' Account database is not connected. Set DATABASE_URL or POSTGRES_URL and restart the server.' : '';
      return send(res, 502, publicAuthPage('Google login failed', '<section class="card"><h1 class="title">Google login failed</h1><p class="lead">The Google OAuth callback could not be completed. Check credentials, redirect URI and network access.' + esc(dbHint) + '</p><p><a class="btn blue" href="/login">Back to login</a></p></section>'));
    }
  }
  if (url.pathname === '/auth/github/start' && req.method === 'GET') {
    return sendJson(res, 501, { success: false, reason: 'github_oauth_not_configured', provider: 'github' });
  }

  return sendJson(res, 404, { success: false, reason: 'unknown_auth_route' });
}

async function handleApi(req, res, url) {
  await ensureScalableRuntimeReady();
  const apiKey = requestIpKey(req) + '|api';
  if (!rateLimitBucket(apiHits, apiKey, API_LIMIT_WINDOW, API_LIMIT_MAX)) {
    return sendJson(res, 429, { success: false, reason: 'rate_limited' }, { 'Access-Control-Allow-Origin': req.headers.origin || '*' });
  }
  if (req.method === 'OPTIONS') {
    return sendJson(res, 204, {}, { 'Access-Control-Allow-Origin': req.headers.origin || '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-AVP-Request, X-AVP-Event-Signature, Authorization', 'Access-Control-Max-Age': '600', 'Vary': 'Origin' });
  }
  if (url.pathname === '/api/v1/ping' && req.method === 'GET') {
    const project = projectByPublicKey(url.searchParams.get('projectKey')) || state.projects[0];
    return sendJson(res, 200, { success: true, time: iso() }, corsHeaders(req, project));
  }
  if (url.pathname === '/api/v1/session' && req.method === 'POST') {
    const body = await readJson(req);
    const project = projectByPublicKey(body.projectKey);
    if (!project) return sendJson(res, 404, { success: false, reason: 'project_not_found' }, { 'Access-Control-Allow-Origin': req.headers.origin || '*' });
    if (req.headers.origin && !isOriginAllowed(project, req.headers.origin)) { recordEvent(req, project, 'abuse', 'origin_not_allowed', { origin: req.headers.origin }, ''); return sendJson(res, 403, { success: false, reason: 'origin_not_allowed' }, corsHeaders(req, project)); }
    if (rejectIfProjectClosed(req, res, project)) return;
    if (!checkProjectLimit(project, 'sessions', project.limits?.sessionsPerMinute || planFor(project).sessionsPerMinute || MAX_SESSIONS_PER_PROJECT_PER_MINUTE)) { recordEvent(req, project, 'abuse', 'sessions_rate_limited', { pageUrl: body.pageUrl }, ''); return sendJson(res, 429, { success: false, reason: 'project_session_rate_limited' }, corsHeaders(req, project)); }
    const sharedSessionLimit = await sharedProjectRateLimit(project, 'sessions', project.limits?.sessionsPerMinute || planFor(project).sessionsPerMinute || MAX_SESSIONS_PER_PROJECT_PER_MINUTE);
    if (!sharedSessionLimit.ok) { recordEvent(req, project, 'abuse', 'sessions_rate_limited_shared', { pageUrl: body.pageUrl, retryAfterMs: sharedSessionLimit.retryAfterMs }, ''); return sendJson(res, 429, { success: false, reason: 'project_session_rate_limited_shared', retryAfterMs: sharedSessionLimit.retryAfterMs }, corsHeaders(req, project)); }
    const token = randomKey('avp_vst');
    const visitorSession = { projectId: project.id, createdAt: now(), lastSeen: now(), origin: clamp(req.headers.origin || '', 150), pageUrl: clamp(body.pageUrl, 220), status: 'created', fingerprint: clientFingerprint(req), clientPublicKey: body.clientPublicKey || null, nextSeq: 1, challenges: {}, contentUnlockedAt: null, proof: null, reasons: [] };
    await storeVisitorSession(token, visitorSession);
    recordEvent(req, project, 'unique_visitor', 'session_created', { pageUrl: body.pageUrl }, token);
    recordEvent(req, project, 'visit', 'page_view', { pageUrl: body.pageUrl, mode: body.mode || project.mode }, token);
    return sendJson(res, 200, { success: true, visitorToken: token, mode: project.mode, settings: { protectedSelector: project.protectedSelector, adContainerSelector: project.adContainerSelector, loaderEnabled: project.loaderEnabled } }, corsHeaders(req, project));
  }
  if (url.pathname === '/api/v1/challenge' && req.method === 'POST') {
    const body = await readJson(req);
    const project = projectByPublicKey(body.projectKey);
    if (!project) return sendJson(res, 404, { success: false, reason: 'project_not_found' }, { 'Access-Control-Allow-Origin': req.headers.origin || '*' });
    if (req.headers.origin && !isOriginAllowed(project, req.headers.origin)) { recordEvent(req, project, 'abuse', 'origin_not_allowed', { origin: req.headers.origin }, ''); return sendJson(res, 403, { success: false, reason: 'origin_not_allowed' }, corsHeaders(req, project)); }
    if (rejectIfProjectClosed(req, res, project)) return;
    const token = body.visitorToken || '';
    const sess = await loadVisitorSession(token);
    if (!sess || sess.projectId !== project.id) { recordEvent(req, project, 'abuse', 'bad_visitor_token', {}, token); return sendJson(res, 403, { success: false, reason: 'bad_visitor_token' }, corsHeaders(req, project)); }
    sess.lastSeen = now();
    const challenge = issueChallengeForSession(sess, clamp(body.kind || 'content', 30));
    recordEvent(req, project, 'challenge_issued', challenge.kind, { pageUrl: sess.pageUrl, slotId: challenge.slotId }, token);
    await storeVisitorSession(token, sess);
    return sendJson(res, 200, { success: true, challenge }, corsHeaders(req, project));
  }
  if (url.pathname === '/api/v1/proof' && req.method === 'POST') {
    const body = await readJson(req);
    const project = projectByPublicKey(body.projectKey);
    if (!project) return sendJson(res, 404, { success: false, reason: 'project_not_found' }, { 'Access-Control-Allow-Origin': req.headers.origin || '*' });
    if (req.headers.origin && !isOriginAllowed(project, req.headers.origin)) { recordEvent(req, project, 'abuse', 'origin_not_allowed', { origin: req.headers.origin }, ''); return sendJson(res, 403, { success: false, reason: 'origin_not_allowed' }, corsHeaders(req, project)); }
    if (rejectIfProjectClosed(req, res, project)) return;
    const token = body.visitorToken || '';
    const sess = await loadVisitorSession(token);
    if (!sess || sess.projectId !== project.id) { recordEvent(req, project, 'abuse', 'bad_visitor_token', {}, token); return sendJson(res, 403, { success: false, reason: 'bad_visitor_token' }, corsHeaders(req, project)); }
    sess.proofAttempts = (sess.proofAttempts || 0) + 1;
    if (sess.proofAttempts > (project.limits?.proofAttemptsPerVisitor || MAX_PROOF_ATTEMPTS_PER_VISITOR)) { await storeVisitorSession(token, sess); recordEvent(req, project, 'abuse', 'excessive_proof_attempts', { attempts: sess.proofAttempts }, token); return sendJson(res, 429, { success: false, reason: 'excessive_proof_attempts' }, corsHeaders(req, project)); }
    const payload = body.payload || {};
    let signatureOk = false;
    try { signatureOk = verifySignedPayload(sess.clientPublicKey, payload, body.signature); } catch { signatureOk = false; }
    if (!signatureOk) {
      await storeVisitorSession(token, sess);
      recordEvent(req, project, 'proof_failed', 'signature_invalid', { pageUrl: sess.pageUrl }, token);
      return sendJson(res, 403, { success: false, reason: 'signature_invalid' }, corsHeaders(req, project));
    }
    const taken = takeChallenge(sess, payload, 'content');
    if (!taken.ok) {
      await storeVisitorSession(token, sess);
      recordEvent(req, project, 'proof_failed', taken.reason, { pageUrl: sess.pageUrl }, token);
      return sendJson(res, 403, { success: false, reason: taken.reason }, corsHeaders(req, project));
    }
    const meta = taken.meta;
    if (payload.proof !== meta.expectedProof) {
      await storeVisitorSession(token, sess);
      recordEvent(req, project, 'proof_failed', 'canvas_proof_invalid', { pageUrl: sess.pageUrl }, token);
      return sendJson(res, 403, { success: false, reason: 'canvas_proof_invalid' }, corsHeaders(req, project));
    }
    if (payload.baitDomVisible !== true || typeof payload.visibleRatioScaled !== 'number' || payload.visibleRatioScaled < 500) {
      await storeVisitorSession(token, sess);
      recordEvent(req, project, 'proof_failed', 'ad_not_visible', { pageUrl: sess.pageUrl, ratio: payload.visibleRatioScaled }, token);
      return sendJson(res, 403, { success: false, reason: 'ad_not_visible' }, corsHeaders(req, project));
    }
    if ((meta.baitHits || 0) < 1) {
      await storeVisitorSession(token, sess);
      recordEvent(req, project, 'proof_failed', 'server_did_not_see_bait_hit', { pageUrl: sess.pageUrl }, token);
      return sendJson(res, 403, { success: false, reason: 'server_did_not_see_bait_hit' }, corsHeaders(req, project));
    }
    sess.status = 'content_unlocked';
    sess.contentUnlockedAt = now();
    sess.proof = { ok: true, at: now(), visibleRatioScaled: payload.visibleRatioScaled, slotId: payload.slotId, canvasHash: payload.proof.slice(0, 16) };
    recordEvent(req, project, 'proof_ok', 'webcrypto_canvas_bait_ok', { pageUrl: sess.pageUrl, ratio: payload.visibleRatioScaled, slotId: payload.slotId }, token);
    await storeVisitorSession(token, sess);
    return sendJson(res, 200, { success: true, allowed: true, reason: 'proof_ok' }, corsHeaders(req, project));
  }
  if (url.pathname === '/api/v1/bait-hit' && req.method === 'GET') {
    const project = projectByPublicKey(url.searchParams.get('projectKey')) || state.projects[0];
    const token = url.searchParams.get('visitorToken') || '';
    const sess = await loadVisitorSession(token);
    if (sess && project && sess.projectId === project.id) {
      const nonce = url.searchParams.get('nonce') || '';
      const meta = sess.challenges && sess.challenges[nonce];
      if (meta && !meta.used && meta.slotId === url.searchParams.get('slotId') && meta.baitToken === url.searchParams.get('baitToken')) {
        meta.baitHits = (meta.baitHits || 0) + 1;
        sess.lastSeen = now();
        recordEvent(req, project, 'bait_hit', url.searchParams.get('kind') === 'script' ? 'bait_script_seen' : 'bait_pixel_seen', { pageUrl: sess.pageUrl }, token);
        await storeVisitorSession(token, sess);
      }
    }
    const body = url.searchParams.get('kind') === 'script' ? 'window.__avpBaitHit=1;' : Buffer.from('R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==','base64');
    if (url.searchParams.get('kind') === 'script') { res.writeHead(200, securityHeaders({ 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' })); return res.end(body); }
    res.writeHead(200, securityHeaders({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' }));
    return res.end(body);
  }
  if (url.pathname === '/api/v1/ad-fragment' && req.method === 'GET') {
    const project = projectByPublicKey(url.searchParams.get('projectKey'));
    const token = url.searchParams.get('visitorToken') || '';
    if (!project) return sendJson(res, 404, { success: false, reason: 'project_not_found' }, { 'Access-Control-Allow-Origin': req.headers.origin || '*' });
    if (req.headers.origin && !isOriginAllowed(project, req.headers.origin)) { recordEvent(req, project, 'abuse', 'origin_not_allowed', { origin: req.headers.origin }, token); return sendJson(res, 403, { success: false, reason: 'origin_not_allowed' }, corsHeaders(req, project)); }
    if (rejectIfProjectClosed(req, res, project)) return;
    const sess = await loadVisitorSession(token);
    if (!sess || sess.projectId !== project.id) { recordEvent(req, project, 'abuse', 'bad_visitor_token', {}, token); return sendJson(res, 403, { success: false, reason: 'bad_visitor_token' }, corsHeaders(req, project)); }
    sess.lastSeen = now();
    recordEvent(req, project, 'ad_fragment_delivered', clamp(url.searchParams.get('reason') || 'initial', 80), { pageUrl: sess.pageUrl }, token);
    await storeVisitorSession(token, sess);
    return sendJson(res, 200, { success: true, html: makeAdHtml(project, url.searchParams.get('reason') || 'initial', { visitorToken: token, nonce: url.searchParams.get('nonce') || '', slotId: url.searchParams.get('slotId') || '', baitToken: url.searchParams.get('baitToken') || '' }) }, corsHeaders(req, project));
  }
  if (url.pathname === '/api/v1/events' && req.method === 'POST') {
    const body = await readJson(req);
    const project = projectByPublicKey(body.projectKey);
    if (!project) return sendJson(res, 404, { success: false, reason: 'project_not_found' }, { 'Access-Control-Allow-Origin': req.headers.origin || '*' });
    if (req.headers.origin && !isOriginAllowed(project, req.headers.origin)) { recordEvent(req, project, 'abuse', 'origin_not_allowed', { origin: req.headers.origin }, ''); return sendJson(res, 403, { success: false, reason: 'origin_not_allowed' }, corsHeaders(req, project)); }
    if (rejectIfProjectClosed(req, res, project)) return;
    if (!checkMonthlyQuota(project, 'events')) { recordEvent(req, project, 'abuse', 'monthly_events_quota_exceeded', {}, body.visitorToken || ''); return sendJson(res, 402, { success: false, reason: 'monthly_events_quota_exceeded' }, corsHeaders(req, project)); }
    if (!checkProjectLimit(project, 'events', project.limits?.eventsPerMinute || planFor(project).eventsPerMinute || MAX_EVENTS_PER_PROJECT_PER_MINUTE)) { recordEvent(req, project, 'abuse', 'events_rate_limited', {}, body.visitorToken || ''); return sendJson(res, 429, { success: false, reason: 'project_events_rate_limited' }, corsHeaders(req, project)); }
    const sharedEventLimit = await sharedProjectRateLimit(project, 'events', project.limits?.eventsPerMinute || planFor(project).eventsPerMinute || MAX_EVENTS_PER_PROJECT_PER_MINUTE);
    if (!sharedEventLimit.ok) { recordEvent(req, project, 'abuse', 'events_rate_limited_shared', { retryAfterMs: sharedEventLimit.retryAfterMs }, body.visitorToken || ''); return sendJson(res, 429, { success: false, reason: 'project_events_rate_limited_shared', retryAfterMs: sharedEventLimit.retryAfterMs }, corsHeaders(req, project)); }
    if (body.visitorToken && !checkVisitorEventLimit(project, body.visitorToken)) { recordEvent(req, project, 'abuse', 'visitor_events_rate_limited', {}, body.visitorToken || ''); return sendJson(res, 429, { success: false, reason: 'visitor_events_rate_limited' }, corsHeaders(req, project)); }
    const sharedVisitorEventLimit = await sharedVisitorRateLimit(project, body.visitorToken || '', 'events', project.limits?.eventsPerVisitorPerMinute || MAX_EVENTS_PER_VISITOR_PER_MINUTE);
    if (!sharedVisitorEventLimit.ok) { recordEvent(req, project, 'abuse', 'visitor_events_rate_limited_shared', { retryAfterMs: sharedVisitorEventLimit.retryAfterMs }, body.visitorToken || ''); return sendJson(res, 429, { success: false, reason: 'visitor_events_rate_limited_shared', retryAfterMs: sharedVisitorEventLimit.retryAfterMs }, corsHeaders(req, project)); }
    const loadedEventSession = body.visitorToken ? await loadVisitorSession(body.visitorToken) : null;
    const sig = verifyClientEventEnvelope(project, body, loadedEventSession);
    if (!sig.ok) { recordEvent(req, project, 'abuse', sig.reason, {}, body.visitorToken || ''); return sendJson(res, 403, { success: false, reason: sig.reason }, corsHeaders(req, project)); }
    if (sig.reason === 'unsigned_event') recordEvent(req, project, 'client_event_security', 'unsigned_event_audit_only', {}, body.visitorToken || '');
    const token = body.visitorToken || '';
    const sess = await loadVisitorSession(token);
    if (sess && sess.projectId === project.id) {
      sess.lastSeen = now();
      sess.reasons = sess.reasons || [];
      sess.reasons.push(clamp(body.reason, 90));
      if (body.type === 'content_unlocked') { sess.status = 'content_unlocked'; sess.contentUnlockedAt = now(); }
      if (body.type === 'overlay_shown') sess.status = 'overlay_shown';
      if (body.type === 'connection_issue') sess.status = 'connection_issue';
      await storeVisitorSession(token, sess);
    }
    const type = clamp(body.type || 'client_event', 60);
    recordEvent(req, project, type, clamp(body.reason || 'none', 90), body.details || {}, token);
    return sendJson(res, 200, { success: true }, corsHeaders(req, project));
  }
  if (url.pathname === '/api/v1/events/batch' && req.method === 'POST') {
    const body = await readJson(req);
    const project = projectByPublicKey(body.projectKey);
    if (!project) return sendJson(res, 404, { success: false, reason: 'project_not_found' }, { 'Access-Control-Allow-Origin': req.headers.origin || '*' });
    if (req.headers.origin && !isOriginAllowed(project, req.headers.origin)) { recordEvent(req, project, 'abuse', 'origin_not_allowed', { origin: req.headers.origin }, ''); return sendJson(res, 403, { success: false, reason: 'origin_not_allowed' }, corsHeaders(req, project)); }
    if (rejectIfProjectClosed(req, res, project)) return;
    const events = Array.isArray(body.events) ? body.events.slice(0, 50) : [];
    if (!events.length) return sendJson(res, 400, { success: false, reason: 'empty_batch' }, corsHeaders(req, project));
    if (!checkMonthlyQuota(project, 'events')) return sendJson(res, 402, { success: false, reason: 'monthly_events_quota_exceeded' }, corsHeaders(req, project));
    if (!checkProjectLimit(project, 'events_batch', project.limits?.eventsPerMinute || planFor(project).eventsPerMinute || MAX_EVENTS_PER_PROJECT_PER_MINUTE)) return sendJson(res, 429, { success: false, reason: 'project_events_rate_limited' }, corsHeaders(req, project));
    const sharedBatchLimit = await sharedProjectRateLimit(project, 'events_batch', project.limits?.eventsPerMinute || planFor(project).eventsPerMinute || MAX_EVENTS_PER_PROJECT_PER_MINUTE);
    if (!sharedBatchLimit.ok) return sendJson(res, 429, { success: false, reason: 'project_events_rate_limited_shared', retryAfterMs: sharedBatchLimit.retryAfterMs }, corsHeaders(req, project));
    let accepted = 0, rejected = 0;
    for (const raw of events) {
      const evt = Object.assign({}, raw, { projectKey: body.projectKey, visitorToken: raw.visitorToken || body.visitorToken || '' });
      if (evt.visitorToken && !checkVisitorEventLimit(project, evt.visitorToken)) { rejected++; recordEvent(req, project, 'abuse', 'visitor_events_rate_limited', {}, evt.visitorToken); continue; }
      const sharedVisitorBatchLimit = await sharedVisitorRateLimit(project, evt.visitorToken || '', 'events', project.limits?.eventsPerVisitorPerMinute || MAX_EVENTS_PER_VISITOR_PER_MINUTE);
      if (!sharedVisitorBatchLimit.ok) { rejected++; recordEvent(req, project, 'abuse', 'visitor_events_rate_limited_shared', { retryAfterMs: sharedVisitorBatchLimit.retryAfterMs }, evt.visitorToken); continue; }
      const loadedEventSession = evt.visitorToken ? await loadVisitorSession(evt.visitorToken) : null;
      const sig = verifyClientEventEnvelope(project, evt, loadedEventSession);
      if (!sig.ok) { rejected++; recordEvent(req, project, 'abuse', sig.reason, {}, evt.visitorToken); continue; }
      const token = evt.visitorToken || '';
      const sess = await loadVisitorSession(token);
      if (sess && sess.projectId === project.id) { sess.lastSeen = now(); if (evt.type === 'content_unlocked') { sess.status = 'content_unlocked'; sess.contentUnlockedAt = now(); } if (evt.type === 'overlay_shown') sess.status = 'overlay_shown'; if (evt.type === 'connection_issue') sess.status = 'connection_issue'; await storeVisitorSession(token, sess); }
      recordEvent(req, project, clamp(evt.type || 'client_event', 60), clamp(evt.reason || 'none', 90), evt.details || {}, token);
      accepted++;
    }
    return sendJson(res, 200, { success: true, accepted, rejected }, corsHeaders(req, project));
  }
  if (url.pathname === '/api/v1/leads' && req.method === 'POST') {
    const body = await readJson(req);
    const email = clamp(body.email || '', 140).toLowerCase();
    const message = clamp(body.message || body.notes || '', 2000);
    if (!emailLooksValid(email)) return sendJson(res, 400, { success: false, reason: 'email_invalid' }, { 'Access-Control-Allow-Origin': req.headers.origin || '*' });
    if (message.length < 8) return sendJson(res, 400, { success: false, reason: 'message_too_short' }, { 'Access-Control-Allow-Origin': req.headers.origin || '*' });
    const project = body.projectKey ? projectByPublicKey(body.projectKey) : null;
    const leads = readLeads();
    const lead = {
      id: randomId('lead'),
      time: iso(),
      projectId: project?.id || '',
      projectKey: project?.publicKey || '',
      name: clamp(body.name || '', 120),
      email,
      company: clamp(body.company || '', 140),
      siteUrl: clamp(body.siteUrl || body.website || '', 220),
      message,
      source: clamp(body.source || req.headers.origin || 'api', 120),
      ipHash: clientFingerprint(req),
      ua: clamp(req.headers['user-agent'] || '', 150)
    };
    leads.leads.push(lead);
    leads.updatedAt = iso();
    writeLeads(leads);
    await persistLeadToAppDb(lead);
    if (project) recordEvent(req, project, 'lead_submitted', 'form_backend', { pageUrl: body.pageUrl || body.siteUrl || '', emailDomain: email.split('@')[1] || '' }, body.visitorToken || '');
    return sendJson(res, 201, { success: true, leadId: lead.id }, { 'Access-Control-Allow-Origin': req.headers.origin || '*' });
  }

  if (url.pathname === '/api/v1/trial-status' && req.method === 'GET') {
    const project = projectByPublicKey(url.searchParams.get('projectKey')) || state.projects[0];
    if (!project) return sendJson(res, 404, { success: false, reason: 'project_not_found' }, { 'Access-Control-Allow-Origin': req.headers.origin || '*' });
    return sendJson(res, 200, { success: true, projectKey: project.publicKey, projectId: project.id, trial: trialSnapshot(project) }, corsHeaders(req, project));
  }

  if (url.pathname === '/api/v1/billing/card-verification' && req.method === 'POST') {
    const body = await readJson(req);
    const provider = process.env.BILLING_PROVIDER || '';
    if (!provider) return sendJson(res, 501, { success: false, reason: 'billing_provider_not_configured', mode: 'stub' }, { 'Access-Control-Allow-Origin': req.headers.origin || '*' });
    if (provider === 'mock') return sendJson(res, 200, { success: true, verified: true, accountId: clamp(body.accountId || '', 80), validForDays: 30 }, { 'Access-Control-Allow-Origin': req.headers.origin || '*' });
    return sendJson(res, 501, { success: false, reason: 'billing_provider_adapter_missing', provider }, { 'Access-Control-Allow-Origin': req.headers.origin || '*' });
  }

  if (url.pathname === '/api/v1/heartbeat' && req.method === 'POST') {
    const body = await readJson(req);
    const project = projectByPublicKey(body.projectKey);
    if (!project) return sendJson(res, 404, { success: false, reason: 'project_not_found' }, { 'Access-Control-Allow-Origin': req.headers.origin || '*' });
    if (req.headers.origin && !isOriginAllowed(project, req.headers.origin)) { recordEvent(req, project, 'abuse', 'origin_not_allowed', { origin: req.headers.origin }, ''); return sendJson(res, 403, { success: false, reason: 'origin_not_allowed' }, corsHeaders(req, project)); }
    if (rejectIfProjectClosed(req, res, project)) return;
    const token = body.visitorToken || '';
    const sess = await loadVisitorSession(token);
    if (!sess || sess.projectId !== project.id) { recordEvent(req, project, 'abuse', 'bad_visitor_token', {}, token); return sendJson(res, 403, { success: false, reason: 'bad_visitor_token' }, corsHeaders(req, project)); }
    const adOk = body.status === 'ok' && body.adStatus === 'visible';
    sess.lastSeen = now();
    sess.lastHeartbeatAt = adOk ? now() : (sess.lastHeartbeatAt || 0);
    sess.lastHeartbeatStatus = adOk ? 'ok' : 'failed';
    sess.lastHeartbeatReason = clamp(body.reason || (adOk ? 'heartbeat_ok' : 'heartbeat_failed'), 90);
    if (!adOk) sess.status = 'failed';
    await storeVisitorSession(token, sess);
    recordEvent(req, project, adOk ? 'heartbeat' : 'heartbeat_lost', adOk ? 'ok' : sess.lastHeartbeatReason, { pageUrl: body.pageUrl || sess.pageUrl || '', adStatus: body.adStatus || '', status: body.status || '' }, token);
    const leaseValid = Boolean(adOk && sess.status === 'content_unlocked' && now() - (sess.contentUnlockedAt || 0) < VISITOR_SESSION_TTL);
    return sendJson(res, 200, { success: true, leaseValid, status: sess.status, heartbeatStatus: sess.lastHeartbeatStatus, leaseValidUntil: leaseValid ? new Date(now() + HEARTBEAT_TTL).toISOString() : '' }, corsHeaders(req, project));
  }

  if (url.pathname === '/api/v1/lease-status' && req.method === 'GET') {
    const project = projectByPublicKey(url.searchParams.get('projectKey'));
    if (!project) return sendJson(res, 404, { success: false, reason: 'project_not_found' }, { 'Access-Control-Allow-Origin': req.headers.origin || '*' });
    const token = url.searchParams.get('visitorToken') || '';
    const sess = await loadVisitorSession(token);
    const heartbeatFresh = Boolean(sess?.lastHeartbeatAt && now() - sess.lastHeartbeatAt < HEARTBEAT_TTL);
    const recentlyUnlocked = Boolean(sess?.contentUnlockedAt && now() - sess.contentUnlockedAt < HEARTBEAT_TTL);
    const allowed = Boolean(sess && sess.projectId === project.id && sess.status === 'content_unlocked' && (heartbeatFresh || recentlyUnlocked));
    return sendJson(res, 200, { success: true, allowed, status: sess?.status || 'missing_session', heartbeatFresh, reason: allowed ? 'lease_active' : 'lease_missing_or_expired' }, corsHeaders(req, project));
  }

  if (url.pathname === '/api/v1/server/verify' && req.method === 'POST') {
    const body = await readJson(req);
    const project = projectByPublicKey(body.projectKey) || projectBySecret(body.secretKey || body.apiKey, 'server_verify');
    if (!project || !verifyProjectCredential(project, body.secretKey || body.apiKey, 'server_verify')) { if (project) recordEvent(req, project, 'abuse', 'bad_project_or_secret', {}, body.visitorToken || ''); appendAlert('bad_server_verify_secret', 'warning', { projectKey: body.projectKey || '' }); return sendJson(res, 403, { success: false, allowed: false, reason: 'bad_project_or_secret' }); }
    if (rejectIfProjectClosed(req, res, project)) return;
    if (!checkMonthlyQuota(project, 'serverVerifications')) { recordEvent(req, project, 'abuse', 'monthly_server_verify_quota_exceeded', {}, body.visitorToken || ''); return sendJson(res, 402, { success: false, allowed: false, reason: 'monthly_server_verify_quota_exceeded' }); }
    const token = body.visitorToken || '';
    const sess = await loadVisitorSession(token);
    recordEvent(req, project, 'server_verification', 'server_verify_called', { pageUrl: sess?.pageUrl || '' }, token);
    const heartbeatFresh = Boolean(sess?.lastHeartbeatAt && now() - sess.lastHeartbeatAt < HEARTBEAT_TTL);
    const recentlyUnlocked = Boolean(sess?.contentUnlockedAt && now() - sess.contentUnlockedAt < HEARTBEAT_TTL);
    const allowed = Boolean(sess && sess.projectId === project.id && sess.status === 'content_unlocked' && now() - (sess.contentUnlockedAt || 0) < VISITOR_SESSION_TTL && (heartbeatFresh || recentlyUnlocked));
    if (allowed) recordEvent(req, project, 'server_verification_ok', 'content_access_allowed', { pageUrl: sess.pageUrl }, token);
    return sendJson(res, 200, { success: true, allowed, status: sess?.status || 'missing_session', heartbeatFresh, reason: allowed ? 'ad_visibility_confirmed' : 'not_confirmed_or_expired', projectId: project.id });
  }
  return sendJson(res, 404, { success: false, reason: 'unknown_api' }, { 'Access-Control-Allow-Origin': req.headers.origin || '*' });
}

const requestHandler = async (req, res) => {
  res._requestId = req.headers['x-request-id'] ? clamp(req.headers['x-request-id'], 80) : newRequestId();
  const startedAt = now();
  try {
    const url = new URL(req.url, PUBLIC_BASE_URL);
    if (url.pathname === '/api/client/session' && req.method === 'GET') {
      const client = await clientFromSession(req);
      return sendJson(res, 200, { ok: true, authenticated: Boolean(client), user: client ? { id: client.id, name: client.fullName || client.email || 'Account', email: client.email || '', planId: client.planId || 'beta', status: client.status || 'trial' } : null });
    }
    if (['/login','/register','/logout','/account','/reset-password'].includes(url.pathname) || url.pathname.startsWith('/account/') || url.pathname.startsWith('/reset-password/')) return await handleClientPortal(req, res, url);
    if (url.pathname.startsWith('/admin')) return await handleAdmin(req, res, url);
    if (url.pathname.startsWith('/auth/')) return await handleAuth(req, res, url);
    if (url.pathname.startsWith('/api/v1/')) return await handleApi(req, res, url);
    if (url.pathname === '/debug/auth-accounts' && req.method === 'GET') {
      if (APP_ENV === 'production') return sendJson(res, 404, { success: false, reason: 'not_found' });
      return sendJson(res, 200, Object.assign({ ok: true, note: 'Emails are masked and hashed. This endpoint is for local debugging only.' }, await authDebugSnapshot(req)));
    }
    if (url.pathname === '/debug/app-db' && req.method === 'GET') {
      if (APP_ENV === 'production') return sendJson(res, 404, { success: false, reason: 'not_found' });
      await ensureAppDbReady();
      let dbRows = [];
      if (appDbReady && appDbPool) {
        const r = await appDbPool.query('SELECT id,email,provider,status,email_verified,created_at,updated_at FROM avp_client_accounts ORDER BY created_at DESC LIMIT 50');
        dbRows = r.rows.map(row => accountDebugInfo(accountFromRow(row)));
      }
      return sendJson(res, 200, { ok: true, note: 'Client accounts should live in Postgres when DATABASE_URL/POSTGRES_URL is configured. Emails are masked and hashed.', appDb: appDbPublicStatus(), accountCount: dbRows.length, accounts: dbRows });
    }
    if (url.pathname === '/debug/storage-files' && req.method === 'GET') {
      if (APP_ENV === 'production') return sendJson(res, 404, { success: false, reason: 'not_found' });
      const files = fs.existsSync(STORAGE_ROOT) ? fs.readdirSync(STORAGE_ROOT).filter(name => name.endsWith('.json')).map(name => {
        const file = path.join(STORAGE_ROOT, name);
        const candidates = jsonFileAccountCandidates(file, name);
        return { file, exists: fs.existsSync(file), accountCandidateCount: candidates.length, accountCandidates: candidates.map(accountDebugInfo) };
      }) : [];
      return sendJson(res, 200, { ok: true, storageRoot: STORAGE_ROOT, files });
    }
    if (url.pathname === '/debug/test-site-scripts' && req.method === 'GET') {
      if (APP_ENV === 'production') return sendJson(res, 404, { success: false, reason: 'not_found' });
      return sendJson(res, 200, { ok: true, note: 'Static SDK script map for manual Site A / Site B testing. Both sites are foreign to the other project unless their host is allowed.', publicBaseUrl: PUBLIC_BASE_URL, siteAHost: 'localhost', siteBHost: '127.0.0.2', rules: ['A site + A project key must pass when localhost is allowed.', 'A site + B project key must block when localhost is not allowed for B.', 'B site + B project key must pass only when 127.0.0.2 is allowed for B.', 'B site + A project key must block when 127.0.0.2 is not allowed for A.'], projects: await currentProjectScriptDebugList(20) });
    }
    if (url.pathname === '/test-site/backend-unlock' && req.method === 'POST') return await handleTestSiteBackendUnlock(req, res);
    if ((url.pathname === '/test-site' || url.pathname === '/test-site/') && req.method === 'GET') return send(res, 200, testSiteIndexPage(projectByPublicKey(url.searchParams.get('projectKey')) || state.projects[0]));
    if (url.pathname === '/test-site/article' && req.method === 'GET') return send(res, 200, testSiteArticlePage(projectByPublicKey(url.searchParams.get('projectKey')) || state.projects[0], url));
    if (url.pathname === '/foreign-test-site' && req.method === 'GET') return send(res, 200, foreignTestSitePage(projectByPublicKey(url.searchParams.get('projectKey')) || state.projects[0], url));
    if (url.pathname === '/debug/subscription-cancellations' && req.method === 'GET') {
      if (APP_ENV === 'production') return sendJson(res, 404, { success: false, reason: 'not_found' });
      await ensureAppDbReady();
      let rows = [];
      if (appDbReady && appDbPool) {
        const r = await appDbPool.query('SELECT id,email,full_name,company_name,plan_id,project_ids,reason,mail_status,created_at FROM avp_subscription_cancellations ORDER BY created_at DESC LIMIT 50');
        rows = r.rows.map(row => ({ id: row.id, emailMasked: maskEmail(row.email), emailHash: emailHash(row.email), fullName: row.full_name || '', companyName: row.company_name || '', planId: row.plan_id || '', projectCount: Array.isArray(row.project_ids) ? row.project_ids.length : 0, reason: row.reason || '', mailStatus: row.mail_status || '', createdAt: row.created_at ? new Date(row.created_at).toISOString() : '' }));
      }
      return sendJson(res, 200, { ok: true, note: 'Local cancellation debug. Emails are masked.', appDb: appDbPublicStatus(), count: rows.length, cancellations: rows });
    }
    if (url.pathname === '/debug/email-outbox' && req.method === 'GET') {
      const outbox = readEmailOutbox();
      const emails = (outbox.emails || []).slice(-30).reverse().map(item => ({
        id: item.id,
        time: item.time,
        toMasked: maskEmail(item.to || ''),
        from: item.from || '',
        subject: item.subject || '',
        status: item.status || '',
        provider: item.provider || '',
        sentAt: item.sentAt || '',
        messageId: item.messageId || '',
        accepted: item.accepted || [],
        rejected: item.rejected || [],
        response: item.response || '',
        error: item.error || '',
        meta: item.meta || {}
      }));
      return sendJson(res, 200, { ok: true, note: 'Local SMTP/outbox debug. Email addresses are masked.', smtp: smtpPublicStatus(), outboxFile: EMAIL_OUTBOX_FILE, count: (outbox.emails || []).length, emails });
    }
    if (url.pathname === '/health' || url.pathname === '/healthz') return sendJson(res, 200, { ok: true, version: state.version, env: APP_ENV, time: iso(), uptimeSec: Math.round(process.uptime()), smtp: smtpPublicStatus(), appDb: appDbPublicStatus() });
    if (url.pathname === '/readyz') return sendJson(res, 200, { ok: true, dataFile: fs.existsSync(DATA_FILE), storageRoot: STORAGE_ROOT, backupDir: BACKUP_DIR, externalBackupDir: EXTERNAL_BACKUP_DIR || '', eventLogDir: EVENT_LOG_DIR, recentEventsKept: MAX_GLOBAL_RECENT_EVENTS, projects: state.projects.length, clusterMode: CLUSTER_MODE, redisRuntime: scalableRuntime.isRedisRuntimeEnabled(), redisEventQueue: scalableRuntime.isRedisQueueEnabled(), postgresStorage: scalableRuntime.isPostgresEnabled(), appDbEnabled: APP_DB_ENABLED, appDbConnected: appDbReady, appDb: appDbPublicStatus(), smtp: smtpPublicStatus(), runtime: await scalableRuntime.health(), time: iso() });
    if (url.pathname === '/metrics') {
      if (!isMetricsAllowed(req, url)) return sendJson(res, 403, { success: false, reason: 'metrics_forbidden' });
      const g = globalStats();
      const lines = [
        '# HELP avp_up Service health: 1 means running',
        '# TYPE avp_up gauge',
        'avp_up 1',
        '# TYPE avp_projects gauge',
        `avp_projects ${state.projects.length}`,
        '# TYPE avp_visits_total counter',
        `avp_visits_total ${g.visits}`,
        '# TYPE avp_overlay_total counter',
        `avp_overlay_total ${g.overlayShown}`,
        '# TYPE avp_unlocked_total counter',
        `avp_unlocked_total ${g.contentUnlocked}`,
        '# TYPE avp_server_verify_ok_total counter',
        `avp_server_verify_ok_total ${g.successfulServerVerifications}`,
        '# TYPE avp_event_queue_depth gauge',
        `avp_event_queue_depth ${eventWriteQueue.length}`,
        '# TYPE avp_cluster_mode gauge',
        `avp_cluster_mode ${CLUSTER_MODE ? 1 : 0}`,
        '# TYPE avp_redis_runtime_enabled gauge',
        `avp_redis_runtime_enabled ${scalableRuntime.isRedisRuntimeEnabled() ? 1 : 0}`,
        '# TYPE avp_redis_event_queue_enabled gauge',
        `avp_redis_event_queue_enabled ${scalableRuntime.isRedisQueueEnabled() ? 1 : 0}`,
        '# TYPE avp_postgres_storage_enabled gauge',
        `avp_postgres_storage_enabled ${scalableRuntime.isPostgresEnabled() ? 1 : 0}`,
        '# TYPE avp_app_db_enabled gauge',
        `avp_app_db_enabled ${APP_DB_ENABLED ? 1 : 0}`
      ];
      res.writeHead(200, securityHeaders({ 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8', 'Cache-Control': 'no-store' }));
      return res.end(lines.join('\n') + '\n');
    }
    if (url.pathname === '/platform') return send(res, 200, landingPage());
    if (req.method === 'GET' && marketingFrontendFile(url.pathname)) return serveMarketingFrontend(res, url.pathname);
    if (url.pathname === '/legacy-info') return send(res, 200, appShell('Legacy v10 preserved', '<section class="card"><h1 class="title">Legacy v10 preserved</h1><p class="lead">Original files from the first archive are preserved in the root and duplicated in <code>legacy-v10-original/</code>. Use <code>npm run legacy</code> for the old TLS-gate demo. New SaaS launch: <code>npm start</code>.</p><pre>npm start        # beta SaaS\nnpm run legacy   # original v10 TLS-gate demo</pre></section>', userFromAdminSession(req)));
    if (url.pathname === '/docs') { const u = userFromAdminSession(req); if ((DOCS_PRIVATE || state.settings?.docsPrivate) && !u) return redirect(res, '/admin/login'); return send(res, 200, docsIndex(u)); }
    if (url.pathname.startsWith('/docs/')) { const u = userFromAdminSession(req); if ((DOCS_PRIVATE || state.settings?.docsPrivate) && !u) return redirect(res, '/admin/login'); return send(res, 200, docPage(decodeURIComponent(url.pathname.slice('/docs/'.length)), u)); }
    const sdkBootMatch = url.pathname.match(/^\/sdk\/(v[12])\/([^/]+)\/(?:boot|loader)-[^/]+\.js$/);
    if (sdkBootMatch && req.method === 'GET') {
      const project = projectByPublicKey(sdkBootMatch[2]);
      if (!project) { res.writeHead(404, { 'Content-Type': 'application/javascript; charset=utf-8' }); return res.end('console.error("AVP project not found");'); }
      const guard = sdkDomainGuard(project, req, 'sdk_bootstrap');
      if (!guard.ok) { res.writeHead(200, securityHeaders({ 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' })); return res.end(blockedSdkStub(project, guard)); }
      recordEvent(req, project, 'sdk_bootstrap_loaded', 'dynamic_sdk_bootstrap', { pageUrl: req.headers.referer || '' }, '');
      res.writeHead(200, securityHeaders({ 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'Vary': 'Referer, Origin', 'Access-Control-Allow-Origin': '*' }));
      return res.end(sdkBootstrap(project));
    }
    const sdkDynamicMatch = url.pathname.match(/^\/sdk\/(v[12])\/([^/]+)\/([^/]+)\.js$/);
    if (sdkDynamicMatch && req.method === 'GET') {
      const project = projectByPublicKey(sdkDynamicMatch[2]);
      if (!project) { res.writeHead(404, { 'Content-Type': 'application/javascript; charset=utf-8' }); return res.end('console.error("AVP project not found");'); }
      const guard = sdkDomainGuard(project, req, 'sdk_dynamic');
      if (!guard.ok) { res.writeHead(200, securityHeaders({ 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' })); return res.end(blockedSdkStub(project, guard)); }
      recordEvent(req, project, 'sdk_dynamic_loaded', 'dynamic_sdk_url', { pageUrl: req.headers.referer || '' }, '');
      res.writeHead(200, securityHeaders({ 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'Vary': 'Referer, Origin', 'Access-Control-Allow-Origin': '*' }));
      return res.end(sdkJs(project));
    }
    const sdkMatch = url.pathname.match(/^\/sdk\/(v[12])\/([^/]+)\.js$/);
    if (sdkMatch && req.method === 'GET') {
      const project = projectByPublicKey(sdkMatch[2]);
      if (!project) { res.writeHead(404, { 'Content-Type': 'application/javascript; charset=utf-8' }); return res.end('console.error("AVP project not found");'); }
      const guard = sdkDomainGuard(project, req, 'sdk_plain');
      if (!guard.ok) { res.writeHead(200, securityHeaders({ 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'Vary': 'Referer, Origin', 'Access-Control-Allow-Origin': '*' })); return res.end(blockedSdkStub(project, guard)); }
      // The public customer tag stays stable, but it must not be a long-lived full SDK response.
      // It is a tiny no-store entry loader that is checked against the page Referer on every load,
      // then it pulls a dynamic boot script. This prevents cross-site reuse from passing via browser cache.
      res.writeHead(200, securityHeaders({ 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'Vary': 'Referer, Origin', 'Access-Control-Allow-Origin': '*' }));
      return res.end(sdkProjectEntryLoader(project));
    }
    if (url.pathname === '/ads/network-probe.js' && req.method === 'GET') {
      const project = projectByPublicKey(url.searchParams.get('projectKey')) || state.projects[0];
      res.writeHead(200, securityHeaders(Object.assign({ 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' }, corsHeaders(req, project))));
      return res.end('window.__avpProbeOk=1;');
    }
    const demoMatch = url.pathname.match(/^\/demo\/customer\/([^/]+)$/);
    if (demoMatch && req.method === 'GET') return send(res, 200, demoCustomerPage(projectByPublicKey(demoMatch[1])));
    return send(res, 404, appShell('Not found', '<section class="card"><h1>404</h1><p>Page not found</p></section>', userFromAdminSession(req)));
  } catch (err) {
    structuredLog('error', 'request_failed', { requestId: res._requestId, method: req.method, url: req.url, durationMs: now() - startedAt, error: err.message, stack: APP_ENV === 'production' ? undefined : err.stack });
    const payload = APP_ENV === 'production' ? { success: false, reason: 'server_error' } : { success: false, reason: 'server_error', message: err.message };
    return sendJson(res, 500, payload);
  }
};

const server = USE_HTTPS
  ? https.createServer({ key: fs.readFileSync(CERT_KEY), cert: fs.readFileSync(CERT_CRT) }, requestHandler)
  : http.createServer(requestHandler);

server.listen(PORT, HOST, () => {
  console.log(`[beta] Ad Visibility SaaS Beta running: ${PUBLIC_BASE_URL}`);
  console.log(`[beta] Transport: ${USE_HTTPS ? 'HTTPS/self-hosted TLS' : 'HTTP behind reverse proxy / Render'}`);
  console.log(`[beta] Admin dashboard: ${PUBLIC_BASE_URL}/admin`);
  console.log(`[beta] Client portal: ${PUBLIC_BASE_URL}/register / ${PUBLIC_BASE_URL}/login`);
  console.log(`[beta] Login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD === 'admin123' ? 'admin123 (change ADMIN_PASSWORD)' : 'ADMIN_PASSWORD env'}`);
  console.log(`[beta] Data file: ${DATA_FILE}`);
  console.log(`[beta] Client auth storage: ${APP_DB_ENABLED && APP_DB_CONFIGURED ? 'Postgres/App DB' : 'JSON fallback'}${AUTH_REQUIRE_DATABASE_FOR_CLIENT_AUTH ? ' (database required)' : ''}`);
  console.log(`[beta] App DB: enabled=${APP_DB_ENABLED} configured=${APP_DB_CONFIGURED} connected=${appDbReady} source=${process.env.DATABASE_URL ? 'DATABASE_URL' : (process.env.POSTGRES_URL ? 'POSTGRES_URL' : 'none')}`);
  if ((APP_DB_ENABLED || AUTH_REQUIRE_DATABASE_FOR_CLIENT_AUTH) && !APP_DB_CONFIGURED) console.log('[beta] App DB warning: DATABASE_URL or POSTGRES_URL is missing, so client accounts cannot be written to Postgres.');
  console.log(`[beta] Event log dir: ${EVENT_LOG_DIR}`);
  logStaticTestSiteScripts();
});
