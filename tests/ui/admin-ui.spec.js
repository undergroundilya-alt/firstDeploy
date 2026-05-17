'use strict';

const { test, expect } = require('@playwright/test');
const { loginAsAdmin, uiLog, uiStep } = require('./helpers.cjs');

test.describe('Admin UI', () => {
  test('unauthorized admin route redirects to login', async ({ page }) => {
    await uiStep('Open /admin without session and verify auth redirect', async () => {
      await page.goto('/admin');
      await expect(page).toHaveURL(/\/admin\/login$/);
      await expect(page.getByRole('heading', { name: /Owner dashboard login/i })).toBeVisible();
      uiLog('Unauthenticated visitor was redirected to /admin/login');
      uiLog('Login heading is visible, so protected dashboard was not exposed');
    });
  });

  test('admin can log in, open dashboard, and create a project', async ({ page }) => {
    await loginAsAdmin(page);

    await uiStep('Verify initial dashboard table and default demo project', async () => {
      await expect(page.locator('body')).toContainText('Protected Content Demo');
      await expect(page.locator('code').filter({ hasText: /avp_pub_/ })).toBeVisible();
      uiLog('Dashboard project table contains demo project');
      uiLog('Dashboard exposes public key code block, not secret key');
    });

    await uiStep('Open New Project form from dashboard CTA', async () => {
      await page.getByRole('link', { name: /Создать проект клиента/i }).click();
      await expect(page.getByRole('heading', { name: /Новый beta-проект клиента/i })).toBeVisible();
      await expect(page.locator('input[name="projectName"]')).toBeVisible();
      await expect(page.locator('textarea[name="allowedDomains"]')).toBeVisible();
      uiLog('New project page opened and required form fields are visible');
    });

    const projectName = `Playwright Project ${Date.now()}`;
    await uiStep('Fill project form with server-gate mode and allowed domains', async () => {
      await page.locator('input[name="companyName"]').fill('Playwright Publisher');
      await page.locator('input[name="contactEmail"]').fill('qa@example.com');
      await page.locator('input[name="projectName"]').fill(projectName);
      await page.locator('select[name="mode"]').selectOption('server-gate');
      await page.locator('textarea[name="allowedDomains"]').fill('localhost\n127.0.0.1');
      uiLog('Company, email, project name, server-gate mode and domains were filled', projectName);
    });

    await uiStep('Submit project form and verify project details page', async () => {
      await page.getByRole('button', { name: 'Создать проект' }).click();
      await expect(page).toHaveURL(/\/admin\/projects\/prj_/);
      await expect(page.getByRole('heading', { name: projectName })).toBeVisible();
      await expect(page.locator('body')).toContainText('Secret key нельзя вставлять во frontend');
      uiLog('Project details route opened after creation');
      uiLog('Security warning about secret key is visible on project page');
    });

    await uiStep('Return to dashboard and verify new project appears in table', async () => {
      await page.getByRole('link', { name: /Dashboard/i }).first().click();
      await expect(page.getByRole('heading', { name: /Beta SaaS dashboard/i })).toBeVisible();
      await expect(page.locator('body')).toContainText(projectName);
      uiLog('Dashboard shows newly created project', projectName);
    });
  });

  test('admin security center renders operational controls', async ({ page }) => {
    await loginAsAdmin(page);

    await uiStep('Open security center and verify operational controls', async () => {
      await page.goto('/admin/security');
      await expect(page.getByRole('heading', { name: /Security center/i })).toBeVisible();
      await expect(page.locator('body')).toContainText('MFA');
      await expect(page.locator('body')).toContainText('Global kill switch');
      await expect(page.locator('body')).toContainText('Admin audit log');
      uiLog('Security center heading is visible');
      uiLog('MFA block is visible');
      uiLog('Global kill switch block is visible');
      uiLog('Admin audit log table is visible');
    });
  });
});
