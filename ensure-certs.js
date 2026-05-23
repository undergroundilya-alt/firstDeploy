'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const certDir = path.join(__dirname, 'certs');
const keyPath = path.join(certDir, 'localhost-key.pem');
const certPath = path.join(certDir, 'localhost-cert.pem');

function exists() {
  return fs.existsSync(keyPath) && fs.existsSync(certPath);
}

function certHasRequiredSans() {
  if (!exists()) return false;
  const result = spawnSync('openssl', ['x509', '-in', certPath, '-noout', '-text'], { encoding: 'utf8' });
  if (result.status !== 0) return false;
  const text = `${result.stdout || ''}
${result.stderr || ''}`;
  return text.includes('DNS:localhost') && text.includes('IP Address:127.0.0.1') && text.includes('IP Address:127.0.0.2');
}

function ensureCerts() {
  if (exists() && certHasRequiredSans()) return { ok: true, generated: false, keyPath, certPath };
  if (exists() && !certHasRequiredSans()) {
    try { fs.unlinkSync(keyPath); } catch {}
    try { fs.unlinkSync(certPath); } catch {}
  }

  fs.mkdirSync(certDir, { recursive: true });

  const args = [
    'req',
    '-x509',
    '-newkey', 'rsa:2048',
    '-nodes',
    '-sha256',
    '-days', '365',
    '-keyout', keyPath,
    '-out', certPath,
    '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:127.0.0.2'
  ];

  const result = spawnSync('openssl', args, { stdio: 'inherit' });

  if (result.status === 0 && exists()) {
    console.log('[certs] Local self-signed certificate generated.');
    return { ok: true, generated: true, keyPath, certPath };
  }

  const command = `mkdir -p certs\nopenssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 365 -keyout certs/localhost-key.pem -out certs/localhost-cert.pem -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:127.0.0.2"`;

  console.error('\n[certs] Missing local HTTPS certificate and automatic generation failed.');
  console.error('[certs] Run this in Git Bash from the project folder:\n');
  console.error(command + '\n');
  process.exit(1);
}

module.exports = ensureCerts;
