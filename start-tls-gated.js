'use strict';

const { spawn } = require('child_process');
const path = require('path');

function run(name, file, extraEnv = {}) {
  const p = spawn(process.execPath, [path.join(__dirname, file)], {
    cwd: __dirname,
    env: Object.assign({}, process.env, extraEnv),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  p.stdout.on('data', d => process.stdout.write(`[${name}] ${d}`));
  p.stderr.on('data', d => process.stderr.write(`[${name}] ${d}`));
  p.on('exit', code => {
    console.log(`[${name}] exited with code ${code}`);
    process.exit(code || 0);
  });
  return p;
}

const backendPort = process.env.TLS_BACKEND_PORT || '3001';
const frontPort = process.env.TLS_FRONT_PORT || '3443';

const app = run('app', 'server.js', {
  PORT: backendPort,
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || `https://localhost:${frontPort}`
});

setTimeout(() => run('tls-gate', 'tls-fingerprint-proxy.js', {
  TLS_FRONT_PORT: frontPort,
  TLS_BACKEND_PORT: backendPort
}), 500);

process.on('SIGINT', () => {
  app.kill('SIGINT');
  process.exit(0);
});
