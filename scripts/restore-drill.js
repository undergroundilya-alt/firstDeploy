'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dataFile = path.resolve(root, process.env.DATA_FILE || './data/saas-state.json');
const backupDir = path.resolve(root, process.env.BACKUP_DIR || './backups');
const drillDir = path.resolve(root, './data/restore-drill');

function assert(cond, msg) { if (!cond) throw new Error(msg); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function validateState(s) {
  assert(s && typeof s === 'object' && !Array.isArray(s), 'state must be object');
  assert(Array.isArray(s.users), 'users[] missing');
  assert(Array.isArray(s.companies), 'companies[] missing');
  assert(Array.isArray(s.projects), 'projects[] missing');
  assert(s.projectStats && typeof s.projectStats === 'object', 'projectStats missing');
  for (const p of s.projects) {
    assert(p.id && p.publicKey, 'project missing id/publicKey');
    assert(['observe-only','soft-gate','server-gate'].includes(p.mode), `bad project mode: ${p.mode}`);
  }
  return true;
}
function latestBackup() {
  if (!fs.existsSync(backupDir)) return '';
  return fs.readdirSync(backupDir)
    .filter(f => /^saas-state-.*\.json$/.test(f))
    .map(f => path.join(backupDir, f))
    .sort((a,b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || '';
}

const source = latestBackup() || (fs.existsSync(dataFile) ? dataFile : '');
assert(source, 'No state file or backup found for restore drill');
fs.rmSync(drillDir, { recursive: true, force: true });
fs.mkdirSync(drillDir, { recursive: true });
const restored = path.join(drillDir, 'restored-saas-state.json');
fs.copyFileSync(source, restored);
const state = readJson(restored);
validateState(state);
console.log(JSON.stringify({ ok: true, source, restored, users: state.users.length, companies: state.companies.length, projects: state.projects.length, checkedAt: new Date().toISOString() }, null, 2));
