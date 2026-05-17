'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const ignoredDirs = new Set(['.git', 'node_modules', 'storage', 'playwright-report', 'test-results', 'certs', 'legacy-v10-original']);
const ignoredFiles = new Set(['package-lock.json']);
const patterns = [
  { name: 'Google OAuth secret', regex: /GOCSPX-[A-Za-z0-9_-]{20,}/g },
  { name: 'Gmail app password in env', regex: /^SMTP_PASS=(?!your-app-password|REPLACE|CHANGE|PASTE|$)[A-Za-z0-9]{12,}$/gm },
  { name: 'Render/Postgres URL with password', regex: /postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@[^\s"']+/g },
  { name: 'Private key block', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g }
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (!ignoredFiles.has(entry.name)) out.push(full);
  }
  return out;
}

const findings = [];
for (const file of walk(root)) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const ext = path.extname(file).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.zip', '.pdf'].includes(ext)) continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const pattern of patterns) {
    const matches = text.match(pattern.regex) || [];
    for (const match of matches) {
      if (/STAGING_USER:STAGING_PASSWORD|PROD_USER:PROD_PASSWORD|USER:PASSWORD|user:password|avp:password|change_me|\$\{POSTGRES_PASSWORD\}|your-app-password|your-new-secret|REPLACE_WITH|PASTE_|CHANGE_|EXAMPLE/i.test(match)) continue;
      findings.push(`${pattern.name} in ${rel}: ${match.slice(0, 80)}...`);
    }
  }
}

if (findings.length) {
  console.error('Potential secrets found. Remove them before commit/push:');
  for (const f of findings) console.error(` - ${f}`);
  process.exit(1);
}
console.log('No obvious secrets found in tracked project files.');
