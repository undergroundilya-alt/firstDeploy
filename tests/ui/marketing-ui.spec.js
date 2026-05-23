'use strict';

const { test, expect } = require('@playwright/test');
const { uiLog, uiStep } = require('./helpers.cjs');

test.describe('Marketing UI', () => {
  test('main marketing pages render and navigation works', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 900 });

    await uiStep('Open marketing home page and verify title/hero', async () => {
      await page.goto('/');
      await expect(page).toHaveTitle(/AdProof/i);
      await expect(page.getByRole('heading', { name: /Ad visibility checks your team can/i })).toBeVisible();
      await expect(page.locator('[data-nav]')).toBeVisible();
      uiLog('Home title, hero heading and desktop navigation are visible');
    });

    await uiStep('Use real navigation link from home to product page', async () => {
      await page.locator('[data-nav] a[href="product.html"]').click();
      await expect(page).toHaveURL(/\/product\.html$/);
      await expect(page.getByRole('heading', { name: /From SDK event to a clear dashboard/i })).toBeVisible();
      uiLog('Product page opened through header navigation');
    });

    const pages = [
      ['/security.html', /Secure beta logic/i, 'Security page'],
      ['/pricing.html', /Simple beta pricing/i, 'Pricing page']
    ];

    for (const [route, heading, label] of pages) {
      await uiStep(`Open ${label} and verify main heading`, async () => {
        await page.goto(route);
        await expect(page.getByRole('heading', { name: heading })).toBeVisible();
        uiLog(`${label} renders correctly`, route);
      });
    }
  });

  test('responsive menu opens and closes on mobile viewport', async ({ page }) => {
    await uiStep('Set 360×800 viewport and open marketing home', async () => {
      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: /Ad visibility checks/i })).toBeVisible();
      uiLog('Mobile viewport is active and home page renders');
    });

    await uiStep('Open mobile menu and verify expanded state', async () => {
      const menuButton = page.locator('[data-menu-toggle]');
      await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
      await menuButton.click();
      await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('body')).toHaveClass(/menu-open/);
      uiLog('Menu button toggled aria-expanded=false → true and body got menu-open class');
    });

    await uiStep('Click Docs link and verify mobile menu closes after navigation', async () => {
      await page.locator('[data-nav] a[href="docs.html"]').click();
      await expect(page).toHaveURL(/\/docs\.html$/);
      await expect(page.locator('body')).not.toHaveClass(/menu-open/);
      uiLog('Docs page opened and menu-open class was removed');
    });
  });

  test('marketing JavaScript interactions update visible content', async ({ page }) => {
    await uiStep('Verify static visibility decision block on home page', async () => {
      await page.goto('/');
      await expect(page.locator('.ai-summary')).toContainText('Visibility decision');
      await expect(page.locator('.debug-list')).toContainText('project key');
      await expect(page.locator('.debug-list')).toContainText('protected access');
      uiLog('Home demo block matches the current static, non-switchable product explanation');
    });

    await uiStep('Switch verification tab and verify panel content changes', async () => {
      await page.locator('[data-tab="verify"]').click();
      await expect(page.locator('[data-tab-panel]')).toContainText('Backend confirms the access state');
      uiLog('Verification tab became active and panel text changed');
    });

    await uiStep('Verify product page uses the current strict workflow copy', async () => {
      await page.goto('/product.html');
      await expect(page.getByRole('heading', { name: /Strict protection workflow/i })).toBeVisible();
      await expect(page.locator('body')).toContainText('Strict access path');
      uiLog('Product page no longer exposes old integration-mode switching');
    });

    await uiStep('Switch pricing billing mode to yearly', async () => {
      await page.goto('/pricing.html');
      await page.locator('[data-billing-mode="yearly"]').click();
      await expect(page.locator('[data-price]').first()).toHaveText('$39');
      uiLog('Pricing toggle updated first plan price to yearly amount', '$39');
    });

  });
});
