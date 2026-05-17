'use strict';
const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const backupDir = path.resolve(process.env.BACKUP_DIR || process.env.STORAGE_ROOT && path.join(process.env.STORAGE_ROOT, 'backups') || './storage/backups');
const externalDir = process.env.EXTERNAL_BACKUP_DIR ? path.resolve(process.env.EXTERNAL_BACKUP_DIR) : '';
const command = process.env.EXTERNAL_BACKUP_COMMAND || '';
function latestBackup() {
  if (!fs.existsSync(backupDir)) throw new Error(`backup_dir_missing:${backupDir}`);
  const files = fs.readdirSync(backupDir).filter(f => /^saas-state-.*\.json$/.test(f)).map(f => path.join(backupDir, f)).sort((a,b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  if (!files.length) throw new Error('no_state_backups_found');
  return files[0];
}
const file = process.argv[2] ? path.resolve(process.argv[2]) : latestBackup();
if (!fs.existsSync(file)) throw new Error(`backup_file_missing:${file}`);
if (externalDir) {
  fs.mkdirSync(externalDir, { recursive: true });
  fs.copyFileSync(file, path.join(externalDir, path.basename(file)));
  console.log(JSON.stringify({ ok: true, mode: 'copy', file, externalDir }));
} else if (command) {
  childProcess.execFileSync(command, [file], { stdio: 'inherit', timeout: 120000 });
  console.log(JSON.stringify({ ok: true, mode: 'command', file, command }));
} else {
  console.log(JSON.stringify({ ok: true, mode: 'dry-run', file, note: 'Set EXTERNAL_BACKUP_DIR or EXTERNAL_BACKUP_COMMAND to enable external backup upload.' }));
}
