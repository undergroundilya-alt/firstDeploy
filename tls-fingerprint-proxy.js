'use strict';

const net = require('net');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

require('./ensure-certs')();

const FRONT_HOST = process.env.TLS_FRONT_HOST || '0.0.0.0';
const FRONT_PORT = Number(process.env.TLS_FRONT_PORT || 3443);
const BACKEND_HOST = process.env.TLS_BACKEND_HOST || '127.0.0.1';
const BACKEND_PORT = Number(process.env.TLS_BACKEND_PORT || 3001);
const POLICY_PATH = path.join(__dirname, 'tls-fingerprint-policy.json');

function loadPolicy() {
  try {
    return JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
  } catch {
    return {
      learnMode: false,
      blockUnknown: true,
      requireSni: false,
      requireAlpnH2: true,
      strictAllowlist: false,
      minCipherSuites: 12,
      minExtensions: 7,
      allowJa3Md5: [],
      denyJa3Md5: []
    };
  }
}

function md5(input) {
  return crypto.createHash('md5').update(input).digest('hex');
}

function isGrease(v) {
  return (v & 0x0f0f) === 0x0a0a && ((v >> 8) & 0xff) === (v & 0xff);
}

function u8(buf, o) {
  if (o + 1 > buf.length) throw new Error('truncated');
  return buf[o];
}

function u16(buf, o) {
  if (o + 2 > buf.length) throw new Error('truncated');
  return buf.readUInt16BE(o);
}

function u24(buf, o) {
  if (o + 3 > buf.length) throw new Error('truncated');
  return (buf[o] << 16) | (buf[o + 1] << 8) | buf[o + 2];
}

function parseVector16(buf, offset) {
  const len = u16(buf, offset);
  const start = offset + 2;
  const end = start + len;
  if (end > buf.length) throw new Error('truncated_vector16');
  return { start, end, len, next: end };
}

function parseAlpn(data) {
  const names = [];
  if (data.length < 2) return names;
  const total = data.readUInt16BE(0);
  let o = 2;
  const end = Math.min(data.length, 2 + total);
  while (o < end) {
    const l = data[o++];
    if (o + l > end) break;
    names.push(data.slice(o, o + l).toString('ascii'));
    o += l;
  }
  return names;
}

function parseSni(data) {
  if (data.length < 5) return '';
  const listLen = data.readUInt16BE(0);
  let o = 2;
  const end = Math.min(data.length, 2 + listLen);
  while (o + 3 <= end) {
    const type = data[o++];
    const len = data.readUInt16BE(o); o += 2;
    if (o + len > end) break;
    if (type === 0) return data.slice(o, o + len).toString('utf8');
    o += len;
  }
  return '';
}

function parseU16List(data) {
  const out = [];
  if (data.length < 2) return out;
  const len = data.readUInt16BE(0);
  let o = 2;
  const end = Math.min(data.length, 2 + len);
  while (o + 2 <= end) {
    const v = data.readUInt16BE(o);
    if (!isGrease(v)) out.push(v);
    o += 2;
  }
  return out;
}

function parseEcPointFormats(data) {
  const out = [];
  if (data.length < 1) return out;
  const len = data[0];
  let o = 1;
  const end = Math.min(data.length, 1 + len);
  while (o < end) out.push(data[o++]);
  return out;
}

function parseClientHello(buf) {
  if (buf.length < 5) throw new Error('too_short');
  const recordType = u8(buf, 0);
  const recordVersion = u16(buf, 1);
  const recordLen = u16(buf, 3);
  if (recordType !== 22) throw new Error('not_tls_handshake');
  if (buf.length < 5 + recordLen) throw new Error('incomplete_tls_record');

  let o = 5;
  const hsType = u8(buf, o); o += 1;
  const hsLen = u24(buf, o); o += 3;
  if (hsType !== 1) throw new Error('not_client_hello');
  const hsEnd = Math.min(buf.length, o + hsLen);

  const clientVersion = u16(buf, o); o += 2;
  o += 32; // random

  const sidLen = u8(buf, o); o += 1 + sidLen;
  if (o > hsEnd) throw new Error('bad_session_id');

  const cipherVecLen = u16(buf, o); o += 2;
  const cipherEnd = o + cipherVecLen;
  if (cipherEnd > hsEnd) throw new Error('bad_ciphers');
  const ciphers = [];
  while (o + 2 <= cipherEnd) {
    const v = u16(buf, o);
    if (!isGrease(v)) ciphers.push(v);
    o += 2;
  }

  const compLen = u8(buf, o); o += 1 + compLen;
  if (o > hsEnd) throw new Error('bad_compression');

  let extensions = [];
  let sni = '';
  let alpn = [];
  let groups = [];
  let ecPoints = [];
  let supportedVersions = [];
  let hasKeyShare = false;
  let hasSignatureAlgorithms = false;

  if (o + 2 <= hsEnd) {
    const extLen = u16(buf, o); o += 2;
    const extEnd = Math.min(hsEnd, o + extLen);
    while (o + 4 <= extEnd) {
      const type = u16(buf, o); o += 2;
      const len = u16(buf, o); o += 2;
      const dataEnd = o + len;
      if (dataEnd > extEnd) throw new Error('bad_extension');
      const data = buf.slice(o, dataEnd);
      o = dataEnd;

      if (!isGrease(type)) extensions.push(type);
      if (type === 0) sni = parseSni(data);
      if (type === 16) alpn = parseAlpn(data);
      if (type === 10) groups = parseU16List(data);
      if (type === 11) ecPoints = parseEcPointFormats(data);
      if (type === 43) supportedVersions = parseSupportedVersions(data);
      if (type === 51) hasKeyShare = true;
      if (type === 13) hasSignatureAlgorithms = true;
    }
  }

  const ja3 = [
    clientVersion,
    ciphers.join('-'),
    extensions.join('-'),
    groups.join('-'),
    ecPoints.join('-')
  ].join(',');

  return {
    recordVersion,
    clientVersion,
    ciphers,
    extensions,
    groups,
    ecPoints,
    supportedVersions,
    hasKeyShare,
    hasSignatureAlgorithms,
    sni,
    alpn,
    ja3,
    ja3Md5: md5(ja3)
  };
}

function parseSupportedVersions(data) {
  const out = [];
  if (data.length < 1) return out;
  const len = data[0];
  let o = 1;
  const end = Math.min(data.length, 1 + len);
  while (o + 2 <= end) {
    const v = data.readUInt16BE(o);
    if (!isGrease(v)) out.push(v);
    o += 2;
  }
  return out;
}

function verdict(fp, policy) {
  const allow = new Set(policy.allowJa3Md5 || []);
  const deny = new Set(policy.denyJa3Md5 || []);

  if (deny.has(fp.ja3Md5)) return { ok: false, reason: 'ja3_denied' };
  if (allow.has(fp.ja3Md5)) return { ok: true, reason: 'ja3_allowlisted' };
  if (policy.strictAllowlist) {
    return { ok: false, reason: allow.size === 0 ? 'strict_allowlist_empty' : 'ja3_not_allowlisted' };
  }

  const hasTls13 = fp.supportedVersions.includes(0x0304);
  const hasRequiredCoreExtensions =
    fp.extensions.includes(10) &&   // supported_groups
    fp.extensions.includes(13) &&   // signature_algorithms
    fp.extensions.includes(43) &&   // supported_versions
    fp.hasKeyShare;

  const alpnOk = policy.requireAlpnH2 ? fp.alpn.includes('h2') : fp.alpn.some(v => v === 'h2' || v === 'http/1.1');
  const sniOk = policy.requireSni ? Boolean(fp.sni) : true;
  const enoughCiphers = fp.ciphers.length >= (policy.minCipherSuites || 12);
  const enoughExtensions = fp.extensions.length >= (policy.minExtensions || 7);

  const browserLike = hasTls13 && hasRequiredCoreExtensions && alpnOk && sniOk && enoughCiphers && enoughExtensions;

  if (browserLike) return { ok: true, reason: 'browser_like_tls' };
  if (policy.learnMode || !policy.blockUnknown) return { ok: true, reason: 'learn_or_open_mode' };
  return {
    ok: false,
    reason: `tls_not_browser_like: tls13=${hasTls13}, coreExt=${hasRequiredCoreExtensions}, alpn=${fp.alpn.join('|') || '-'}, sni=${fp.sni || '-'}, ciphers=${fp.ciphers.length}, ext=${fp.extensions.length}`
  };
}

function denySocket(socket, reason, fp) {
  const ja3 = fp ? ` ja3=${fp.ja3Md5}` : '';
  console.log(`[tls-gate] DENY ${socket.remoteAddress}:${socket.remotePort}${ja3} reason=${reason}`);
  // TLS fatal handshake_failure alert. Если клиент не TLS, просто закрываем.
  try { socket.write(Buffer.from([21, 3, 3, 0, 2, 2, 40])); } catch {}
  socket.destroy();
}

function allowAndProxy(client, firstBytes, fp, reason) {
  console.log(`[tls-gate] ALLOW ${client.remoteAddress}:${client.remotePort} ja3=${fp.ja3Md5} sni=${fp.sni || '-'} alpn=${fp.alpn.join('|') || '-'} reason=${reason}`);

  const backend = net.connect({ host: BACKEND_HOST, port: BACKEND_PORT }, () => {
    backend.write(firstBytes);
    client.pipe(backend);
    backend.pipe(client);
  });

  backend.on('error', err => {
    console.log(`[tls-gate] backend error: ${err.message}`);
    client.destroy();
  });

  client.on('error', () => backend.destroy());
  client.on('close', () => backend.destroy());
  backend.on('close', () => client.destroy());
}

function expectedRecordLength(buf) {
  if (buf.length < 5) return null;
  if (buf[0] !== 22) return 5;
  return 5 + buf.readUInt16BE(3);
}

const server = net.createServer(client => {
  let buffered = Buffer.alloc(0);
  let decided = false;

  const timer = setTimeout(() => {
    if (!decided) denySocket(client, 'clienthello_timeout');
  }, 2500);

  client.on('data', chunk => {
    if (decided) return;
    buffered = Buffer.concat([buffered, chunk]);

    const expected = expectedRecordLength(buffered);
    if (expected === null || buffered.length < expected) return;

    clearTimeout(timer);
    decided = true;

    let fp;
    try {
      fp = parseClientHello(buffered);
    } catch (err) {
      return denySocket(client, err.message);
    }

    const policy = loadPolicy();
    const v = verdict(fp, policy);
    if (!v.ok) return denySocket(client, v.reason, fp);
    allowAndProxy(client, buffered, fp, v.reason);
  });

  client.on('error', () => {});
});

server.listen(FRONT_PORT, FRONT_HOST, () => {
  console.log(`[tls-gate] Front HTTPS: https://localhost:${FRONT_PORT}/`);
  console.log(`[tls-gate] Backend: ${BACKEND_HOST}:${BACKEND_PORT}`);
  console.log('[tls-gate] Edit tls-fingerprint-policy.json for learn/allow/deny policy.');
});
