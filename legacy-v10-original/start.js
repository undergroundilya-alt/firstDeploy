'use strict';

const { spawn } = require('child_process');
const path = require('path');

function run(name, file) {
  const p = spawn(process.execPath, [path.join(__dirname, file)], {
    cwd: __dirname,
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

const app = run('app', 'server.js');
setTimeout(() => run('tls', 'tls-fingerprint-proxy.js'), 400);

process.on('SIGINT', () => {
  app.kill('SIGINT');
  process.exit(0);
});
