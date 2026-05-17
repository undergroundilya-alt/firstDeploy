'use strict';

const { spawnSync } = require('child_process');

const commands = [
  ['npm', ['run', 'secrets:scan']],
  ['npm', ['run', 'check']],
  ['npm', ['run', 'architecture:audit']],
  ['npm', ['run', 'test:e2e']],
  ['npm', ['run', 'test:requested']],
  ['npm', ['run', 'test:client']],
  ['npm', ['run', 'test:security']],
  ['npm', ['run', 'test:ci-contract']]
];

for (const [cmd, args] of commands) {
  console.log(`\n[ci-local] $ ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    console.error(`[ci-local] failed: ${cmd} ${args.join(' ')}`);
    process.exit(result.status || 1);
  }
}

console.log('\n[ci-local] All local non-UI checks passed.');
console.log('[ci-local] For full visual gate run: npm run ci:full');
