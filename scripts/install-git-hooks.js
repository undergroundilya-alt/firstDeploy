'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const hooksDir = path.join(process.cwd(), '.githooks');
const prePush = path.join(hooksDir, 'pre-push');
if (!fs.existsSync(prePush)) throw new Error('.githooks/pre-push is missing');

const result = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'inherit', shell: process.platform === 'win32' });
if (result.status !== 0) process.exit(result.status || 1);
console.log('Git hooks installed. pre-push will run npm run ci:local before every push.');
