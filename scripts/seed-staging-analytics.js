#!/usr/bin/env node
'use strict';

const childProcess = require('node:child_process');
const path = require('node:path');
const { loadLocalEnvFile } = require('./load-local-env');

loadLocalEnvFile();

const env = {
  ...process.env,
  APP_ENV: process.env.APP_ENV || 'staging',
  NODE_ENV: process.env.NODE_ENV || 'staging',
  ALLOW_MOCK_DATA: process.env.ALLOW_MOCK_DATA || 'true',
  SEED_DAYS: process.env.SEED_DAYS || '90'
};

if (String(env.APP_ENV).toLowerCase() === 'production') {
  console.error('Refusing to run staging seed with APP_ENV=production. Use a staging database/env file.');
  process.exit(1);
}

const script = path.join(__dirname, 'seed-postgres-analytics.js');
const result = childProcess.spawnSync(process.execPath, [script], {
  cwd: path.resolve(__dirname, '..'),
  env,
  stdio: 'inherit'
});
process.exit(result.status || 0);
