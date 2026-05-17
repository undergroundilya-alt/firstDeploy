'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.resolve(ROOT, process.env.DATA_FILE || './data/saas-state.json');
const BACKUP_DIR = path.resolve(ROOT, process.env.BACKUP_DIR || './backups');
const EVENT_LOG_DIR = path.resolve(ROOT, process.env.EVENT_LOG_DIR || './data/events');

function validateStateShape(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('state_is_not_object');
  if (!Array.isArray(value.users)) throw new Error('state_users_missing');
  if (!Array.isArray(value.companies)) throw new Error('state_companies_missing');
  if (!Array.isArray(value.projects)) throw new Error('state_projects_missing');
  if (!value.projectStats || typeof value.projectStats !== 'object' || Array.isArray(value.projectStats)) throw new Error('state_projectStats_missing');
  if (value.globalEvents && !Array.isArray(value.globalEvents)) throw new Error('state_globalEvents_not_array');
  return true;
}

function checkJsonState(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const parsed = JSON.parse(raw);
  validateStateShape(parsed);
  return {
    file,
    sizeBytes: Buffer.byteLength(raw),
    version: parsed.version || 'unknown',
    users: parsed.users.length,
    companies: parsed.companies.length,
    projects: parsed.projects.length,
    recentGlobalEvents: Array.isArray(parsed.globalEvents) ? parsed.globalEvents.length : 0
  };
}

function checkNdjson(file, maxLines = 5000) {
  const raw = fs.readFileSync(file, 'utf8').trim();
  if (!raw) return { file, linesChecked: 0 };
  const lines = raw.split('\n');
  const start = Math.max(0, lines.length - maxLines);
  for (let i = start; i < lines.length; i++) {
    const row = JSON.parse(lines[i]);
    if (!row.time || !row.projectId || !row.type) throw new Error(`bad_event_line_${i + 1}`);
  }
  return { file, totalLines: lines.length, linesChecked: lines.length - start };
}

function latestBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => /^saas-state-.*\.json$/.test(f))
    .map(f => path.join(BACKUP_DIR, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    .slice(0, 5);
}

function latestEventLogs() {
  if (!fs.existsSync(EVENT_LOG_DIR)) return [];
  return fs.readdirSync(EVENT_LOG_DIR)
    .filter(f => /^events-\d{4}-\d{2}-\d{2}\.ndjson$/.test(f))
    .map(f => path.join(EVENT_LOG_DIR, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    .slice(0, 3);
}

function main() {
  const results = [];
  if (!fs.existsSync(DATA_FILE)) throw new Error(`DATA_FILE not found: ${DATA_FILE}`);
  results.push({ type: 'current_state', ...checkJsonState(DATA_FILE) });
  for (const file of latestBackups()) results.push({ type: 'backup', ...checkJsonState(file) });
  for (const file of latestEventLogs()) results.push({ type: 'event_log', ...checkNdjson(file) });
  console.log(JSON.stringify({ ok: true, checkedAt: new Date().toISOString(), results }, null, 2));
}

try { main(); }
catch (err) {
  console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
}
