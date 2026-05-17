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

function ensureCerts() {
  if (exists()) return { ok: true, generated: false, keyPath, certPath };

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
    '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'
  ];

  const result = spawnSync('openssl', args, { stdio: 'inherit' });

  if (result.status === 0 && exists()) {
    console.log('[certs] Local self-signed certificate generated.');
    return { ok: true, generated: true, keyPath, certPath };
  }

  const command = `mkdir -p certs\nopenssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 365 -keyout certs/localhost-key.pem -out certs/localhost-cert.pem -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"`;

  console.error('\n[certs] Missing local HTTPS certificate and automatic generation failed.');
  console.error('[certs] Run this in Git Bash from the project folder:\n');
  console.error(command + '\n');
  process.exit(1);
}

module.exports = ensureCerts;
