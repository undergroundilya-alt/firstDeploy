'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function exists(file) { assert.ok(fs.existsSync(file), `${file} should exist`); }
function contains(file, text) {
  const body = fs.readFileSync(file, 'utf8');
  assert.ok(body.includes(text), `${file} should contain ${text}`);
}

const root = process.cwd();

console.log('▶ CI/CD contract: required workflow files exist');
for (const file of [
  '.github/workflows/ci.yml',
  '.github/workflows/deploy-staging.yml',
  '.github/workflows/deploy-production.yml',
  '.githooks/pre-push',
  '.env.staging.example',
  '.env.production.example'
]) exists(path.join(root, file));
console.log('✅ workflow and env files exist');

console.log('▶ CI/CD contract: package scripts are wired');
const pkg = readJson(path.join(root, 'package.json'));
for (const script of ['ci:local', 'ci:full', 'setup:hooks', 'secrets:scan', 'test:ci-contract', 'test:ui', 'architecture:audit']) {
  assert.ok(pkg.scripts[script], `package.json should define ${script}`);
}
console.log('✅ package scripts are present');

console.log('▶ CI/CD contract: workflows gate tests before deployment');
contains(path.join(root, '.github/workflows/ci.yml'), 'npm test');
contains(path.join(root, '.github/workflows/ci.yml'), 'npm run test:ui');
contains(path.join(root, '.github/workflows/deploy-staging.yml'), 'npm test');
contains(path.join(root, '.github/workflows/deploy-production.yml'), 'npm test');
console.log('✅ workflows include mandatory test gates');

console.log('▶ Stage/Prod contract: mock data is blocked in production example');
contains(path.join(root, '.env.production.example'), 'ALLOW_MOCK_DATA=false');
contains(path.join(root, '.env.production.example'), 'ALLOW_PRODUCTION_MOCK_SEED=false');
contains(path.join(root, '.env.staging.example'), 'ALLOW_MOCK_DATA=true');
console.log('✅ stage/prod env guard is documented');

console.log('▶ Server block contract: site, cabinet and emails are separated into modules/docs');
for (const file of [
  'src/blocks/email-service.js',
  'src/blocks/client-portal-block.js',
  'src/blocks/site-block.js',
  'docs/51_CICD_STAGE_PROD_BRANCH_RULES.md',
  'docs/52_RESPONSIVE_QA_MATRIX.md',
  'docs/53_SERVER_BLOCK_SPLIT.md',
  'docs/54_ARCHITECTURE_19_POINT_MASTER_PLAN.md',
  'docs/55_DB_SCHEMA_BLOCKS_AND_MIGRATION_006.md',
  'docs/56_SDK_CACHE_VERIFICATION_API_AND_FIRST_VISIT_UX.md',
  'docs/57_SUPPORT_COMPLAINTS_AND_ADMIN_PANEL.md',
  'docs/58_BACKUP_RESTORE_KILL_SWITCH_AND_INCIDENTS.md',
  'docs/59_DOMAIN_OWNERSHIP_PRIVACY_AND_RETENTION.md'
]) exists(path.join(root, file));
console.log('✅ modular block files and docs exist');



console.log('▶ Architecture contract: 19-point architecture pack is wired');
contains(path.join(root, 'db/migrations/006_architecture_foundation_19_points.sql'), 'avp_project_domains');
contains(path.join(root, 'db/migrations/006_architecture_foundation_19_points.sql'), 'avp_revenue_share_reports');
contains(path.join(root, 'db/migrations/006_architecture_foundation_19_points.sql'), 'avp_backup_restore_checks');
console.log('✅ architecture migration is present');

console.log('✅ CI/CD contract tests passed');
