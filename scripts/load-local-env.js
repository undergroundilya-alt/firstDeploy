'use strict';

const fs = require('fs');
const path = require('path');

function loadLocalEnvFile(rootDir = path.resolve(__dirname, '..')) {
  const envPath = path.join(rootDir, '.env');
  if (!fs.existsSync(envPath)) return { loaded: false, path: envPath };

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  let count = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;

    const eqIndex = trimmed.indexOf('=');
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
      count += 1;
    }
  }

  return { loaded: true, path: envPath, count };
}

module.exports = { loadLocalEnvFile };
