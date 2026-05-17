'use strict';

const { test, expect } = require('@playwright/test');
const { responsiveViewports } = require('../../src/blocks/site-block');
const { uiLog, uiStep } = require('./helpers.cjs');

async function expectNoHorizontalOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body ? document.body.scrollWidth : 0
  }));
  expect(metrics.scrollWidth, `${label}: document should not overflow horizontally`).toBeLessThanOrEqual(metrics.clientWidth + 3);
  expect(metrics.bodyScrollWidth, `${label}: body should not overflow horizontally`).toBeLessThanOrEqual(metrics.clientWidth + 3);
  uiLog('No horizontal overflow', `${label} ${metrics.clientWidth}px`);
}

test.describe('Responsive layout smoke', () => {
  const pages = [
    ['/', /Ad visibility checks/i, 'marketing home'],
    ['/pricing.html', /Simple beta pricing/i, 'pricing'],
    ['/register', /Create your account/i, 'register'],
    ['/login', /Login/i, 'client login'],
    ['/test-site', /Two-site SDK test bundle/i, 'test launcher'],
    ['/test-site/article', /Premium article/i, 'allowed test article']
  ];

  for (const viewport of responsiveViewports) {
    test(`core pages fit ${viewport.name} ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const [route, heading, label] of pages) {
        await uiStep(`Open ${label} at ${viewport.name}`, async () => {
          await page.goto(route);
          await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
          await expectNoHorizontalOverflow(page, `${label}/${viewport.name}`);
        });
      }
    });
  }
});
