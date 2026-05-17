'use strict';

const { expect, test } = require('@playwright/test');

function uiLog(message, details) {
  const suffix = details ? ` — ${details}` : '';
  console.log(`   ✓ ${message}${suffix}`);
}

async function uiStep(title, fn) {
  return await test.step(title, async () => {
    console.log(`▶ ${title}`);
    const result = await fn();
    console.log(`✅ ${title}`);
    return result;
  });
}

function mask(value, left = 12) {
  if (!value || typeof value !== 'string') return String(value);
  return value.length <= left ? value : `${value.slice(0, left)}…`;
}

async function loginAsAdmin(page) {
  await uiStep('Admin login: open login page, fill credentials, reach dashboard', async () => {
    await page.goto('/admin/login');
    await expect(page.getByRole('heading', { name: /Owner dashboard login/i })).toBeVisible();
    uiLog('Login page heading is visible');

    await page.locator('input[name="email"]').fill(process.env.ADMIN_EMAIL || 'owner@example.com');
    await page.locator('input[name="password"]').fill(process.env.ADMIN_PASSWORD || 'admin123');
    uiLog('Admin credentials were filled in the form', `email=${process.env.ADMIN_EMAIL || 'owner@example.com'}`);

    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: /Beta SaaS dashboard/i })).toBeVisible();
    uiLog('Dashboard is visible after login');
  });
}

async function getDemoProjectKey(page) {
  return await uiStep('Read demo project public key from /test-site launcher', async () => {
    await page.goto('/test-site');
    const text = await page.locator('pre').first().innerText();
    const match = text.match(/avp_pub_[A-Za-z0-9_-]+/);
    expect(match, 'Demo project public key should be visible on /test-site').toBeTruthy();
    uiLog('Demo public key found', mask(match[0]));
    return match[0];
  });
}

async function waitForVisitorToken(page) {
  const token = await uiStep('Wait until SDK creates window.__AVP_VISITOR_TOKEN__', async () => {
    await page.waitForFunction(() => Boolean(window.__AVP_VISITOR_TOKEN__), null, { timeout: 10_000 });
    const tokenValue = await page.evaluate(() => window.__AVP_VISITOR_TOKEN__);
    expect(tokenValue).toMatch(/^avp_vst_/);
    uiLog('Visitor token exists in browser context', mask(tokenValue));
    return tokenValue;
  });
  return token;
}

module.exports = {
  loginAsAdmin,
  getDemoProjectKey,
  waitForVisitorToken,
  uiLog,
  uiStep,
  mask
};
