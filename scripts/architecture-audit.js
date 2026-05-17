'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = process.cwd();
function file(rel) { return path.join(root, rel); }
function read(rel) { return fs.readFileSync(file(rel), 'utf8'); }
function exists(rel) { assert.ok(fs.existsSync(file(rel)), `${rel} should exist`); }
function contains(rel, text) { assert.ok(read(rel).includes(text), `${rel} should contain ${text}`); }

const requiredDocs = [
  'docs/54_ARCHITECTURE_19_POINT_MASTER_PLAN.md',
  'docs/55_DB_SCHEMA_BLOCKS_AND_MIGRATION_006.md',
  'docs/56_SDK_CACHE_VERIFICATION_API_AND_FIRST_VISIT_UX.md',
  'docs/57_SUPPORT_COMPLAINTS_AND_ADMIN_PANEL.md',
  'docs/58_BACKUP_RESTORE_KILL_SWITCH_AND_INCIDENTS.md',
  'docs/59_DOMAIN_OWNERSHIP_PRIVACY_AND_RETENTION.md'
];

const requiredTables = [
  'avp_marketing_consents',
  'avp_email_unsubscribes',
  'avp_project_members',
  'avp_project_domains',
  'avp_project_settings',
  'avp_hourly_stats',
  'avp_page_sessions',
  'avp_page_stats',
  'avp_plan_limits',
  'avp_subscriptions',
  'avp_usage_daily',
  'avp_invoices',
  'avp_revenue_share_reports',
  'avp_support_tickets',
  'avp_abuse_reports',
  'avp_user_complaints',
  'avp_api_keys',
  'avp_webhook_deliveries',
  'avp_feature_flags',
  'avp_kill_switch_events',
  'avp_sdk_versions',
  'avp_domain_verification_tokens',
  'avp_data_retention_policies',
  'avp_incidents',
  'avp_status_events',
  'avp_backup_restore_checks'
];

const architectureTopics = [
  'One Postgres database',
  'Redis / queue',
  'SDK caching model',
  'Project config',
  'Server logic split',
  'Client dashboard',
  'Email system',
  'Support and complaints',
  'Security model',
  'Analytics pipeline',
  'CI/CD',
  'Stage / Prod',
  'Backups and restore',
  'Billing / plans',
  'Admin panel',
  'Kill switch',
  'SDK versioning',
  'Domain ownership verification',
  'Privacy, legal and retention'
];

console.log('▶ Architecture audit: required docs exist');
for (const doc of requiredDocs) exists(doc);
console.log('✅ architecture docs exist');

console.log('▶ Architecture audit: migration 006 exists and contains all foundation tables');
const migration = 'db/migrations/006_architecture_foundation_19_points.sql';
exists(migration);
for (const table of requiredTables) contains(migration, table);
console.log('✅ migration 006 contains required foundation tables');

console.log('▶ Architecture audit: 19-point master plan contains all topics');
for (const topic of architectureTopics) contains('docs/54_ARCHITECTURE_19_POINT_MASTER_PLAN.md', topic);
console.log('✅ 19 architecture topics are documented');

console.log('▶ Architecture audit: operational docs cover cache, verification, support, backup and retention');
contains('docs/56_SDK_CACHE_VERIFICATION_API_AND_FIRST_VISIT_UX.md', 'Verification API');
contains('docs/56_SDK_CACHE_VERIFICATION_API_AND_FIRST_VISIT_UX.md', 'Cache-Control');
contains('docs/57_SUPPORT_COMPLAINTS_AND_ADMIN_PANEL.md', 'avp_support_tickets');
contains('docs/58_BACKUP_RESTORE_KILL_SWITCH_AND_INCIDENTS.md', 'avp_backup_restore_checks');
contains('docs/59_DOMAIN_OWNERSHIP_PRIVACY_AND_RETENTION.md', 'adproof-verification');
console.log('✅ operational architecture docs are complete');

console.log('✅ Architecture audit passed');
