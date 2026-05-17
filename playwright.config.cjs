'use strict';

const { defineConfig, devices } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = Number(process.env.PLAYWRIGHT_PORT || 3457);
const HOST = '127.0.0.1';
const SERVER_HOST = process.env.PLAYWRIGHT_SERVER_HOST || '0.0.0.0';
const baseURL = `http://${HOST}:${PORT}`;
const storageRoot = process.env.PLAYWRIGHT_STORAGE_ROOT || path.join(os.tmpdir(), `avp-playwright-storage-${PORT}`);

// Keep Playwright runs isolated from local demo/admin data.
if (!process.env.PLAYWRIGHT_KEEP_STORAGE) {
  fs.rmSync(storageRoot, { recursive: true, force: true });
}
fs.mkdirSync(storageRoot, { recursive: true });

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.USE_HTTPS = 'false';
process.env.HOST = SERVER_HOST;
process.env.PORT = String(PORT);
process.env.PUBLIC_BASE_URL = baseURL;
process.env.STORAGE_ROOT = storageRoot;
process.env.DATA_FILE = path.join(storageRoot, 'saas-state.json');
process.env.RUNTIME_FILE = path.join(storageRoot, 'runtime-sessions.json');
process.env.BACKUP_DIR = path.join(storageRoot, 'backups');
process.env.EVENT_LOG_DIR = path.join(storageRoot, 'events');
process.env.AUDIT_LOG_DIR = path.join(storageRoot, 'audit');
process.env.ALERT_LOG_DIR = path.join(storageRoot, 'alerts');
process.env.BACKUP_INTERVAL_MS = '2147483647';
process.env.RESTORE_DRILL_INTERVAL_MS = '2147483647';
process.env.API_LIMIT_MAX = '1000';
process.env.DOCS_PRIVATE = 'false';
process.env.CLUSTER_MODE = 'false';
process.env.ENABLE_REDIS_RUNTIME = 'false';
process.env.ENABLE_REDIS_EVENT_QUEUE = 'false';
process.env.ENABLE_POSTGRES_STORAGE = 'false';

module.exports = defineConfig({
  testDir: './tests/ui',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1366, height: 900 }
  },
  webServer: {
    command: 'node server.js',
    url: `${baseURL}/health`,
    reuseExistingServer: false,
    timeout: 20_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: process.env
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } }
  ]
});
