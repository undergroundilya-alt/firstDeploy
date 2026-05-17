'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const dir = path.resolve(root, process.env.EVENT_LOG_DIR || './data/events');
const outDir = path.resolve(root, './data/events-compacted');
fs.mkdirSync(outDir, { recursive: true });
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.ndjson')).sort() : [];
for (const f of files) {
  const seen = new Set();
  const out = [];
  for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split(/\n+/)) {
    if (!line.trim()) continue;
    const key = require('crypto').createHash('sha1').update(line).digest('hex');
    if (!seen.has(key)) { seen.add(key); out.push(line); }
  }
  fs.writeFileSync(path.join(outDir, f), out.join('\n') + (out.length ? '\n' : ''), 'utf8');
}
console.log(JSON.stringify({ ok: true, files: files.length, outDir }, null, 2));
