'use strict';

const { test, expect } = require('@playwright/test');
const { getDemoProjectKey, waitForVisitorToken, loginAsAdmin, uiLog, uiStep, mask } = require('./helpers.cjs');

test.describe('Test client site and SDK UI behavior', () => {
  test('test-site launcher exposes scenarios and current project key', async ({ page }) => {
    await uiStep('Open test-site launcher and verify available scenarios', async () => {
      await page.goto('/test-site');
      await expect(page.getByRole('heading', { name: /Two-site SDK test bundle/i })).toBeVisible();
      await expect(page.getByRole('link', { name: /Open allowed customer site/i })).toBeVisible();
      await expect(page.getByRole('link', { name: /Simulated adblock/i })).toBeVisible();
      await expect(page.getByRole('link', { name: /Connection issue/i })).toBeVisible();
      await expect(page.getByRole('link', { name: /Open foreign script-tag site/i })).toBeVisible();
      await expect(page.locator('pre').first()).toContainText(/avp_pub_/);
      uiLog('Launcher heading is visible');
      uiLog('Allowed customer site, foreign script-tag site and scenario links are visible');
      uiLog('Current demo project public key is printed in pre block');
    });
  });



  test('foreign site cannot reuse another project script tag', async ({ page, request }) => {
    const projectKey = await getDemoProjectKey(page);

    await uiStep('Verify direct SDK request with evil Referer returns blocked stub', async () => {
      const response = await request.get(`/sdk/v1/${encodeURIComponent(projectKey)}.js`, {
        headers: { Referer: 'http://evil.example/article.html' }
      });
      expect(response.status()).toBe(200);
      const body = await response.text();
      expect(body).toContain('AVP SDK blocked by allowed-domain guard');
      expect(body).toContain('sdk_domain_not_allowed');
      uiLog('SDK endpoint returned blocked stub for evil.example Referer');
    });

    await uiStep('Open real foreign-host test page that injects the project script tag', async () => {
      await page.goto('/test-site');
      const current = new URL(page.url());
      const foreignUrl = `http://127.0.0.2:${current.port}/foreign-test-site?projectKey=${encodeURIComponent(projectKey)}`;
      await page.goto(foreignUrl);
      await expect(page.getByRole('heading', { name: /Can a different site reuse this project script/i })).toBeVisible();
      await expect(page.locator('pre').first()).toContainText(`<script`);
      await page.waitForFunction(() => Boolean(window.__AVP_DOMAIN_BLOCKED__), null, { timeout: 7000 });
      const blocked = await page.evaluate(() => window.__AVP_DOMAIN_BLOCKED__);
      expect(blocked.reason).toBe('sdk_domain_not_allowed');
      expect(blocked.host).toBe('127.0.0.2');
      const token = await page.evaluate(() => window.__AVP_VISITOR_TOKEN__ || '');
      expect(token).toBe('');
      await expect(page.locator('#status')).toContainText(/Blocked by server domain guard/i);
      uiLog('Foreign test site injected script tag but received blocked SDK stub');
    });
  });

  test('normal article loads SDK, creates visitor token, and renders ad slot', async ({ page }) => {
    const projectKey = await getDemoProjectKey(page);
    const apiCalls = [];
    page.on('request', request => {
      const url = request.url();
      if (url.includes('/api/v1/')) apiCalls.push(url);
    });

    await uiStep('Open normal article with SDK and visible ad slot', async () => {
      await page.goto(`/test-site/article?projectKey=${encodeURIComponent(projectKey)}`);
      await expect(page.getByRole('heading', { name: /Premium article with ad visibility verification/i })).toBeVisible();
      await expect(page.locator('#ad-slot')).toBeVisible();
      const protectedContent = page.locator('#protected-content');
      const hardLock = page.locator('.avp-hard-lock, [data-avp-lock="hard"]');
      await expect(protectedContent.or(hardLock).first()).toBeVisible();
      uiLog('Article heading and #ad-slot are visible; protected content or hard-lock state is present');
    });

    const token = await waitForVisitorToken(page);

    await uiStep('Verify SDK debug state and API calls from browser', async () => {
      await expect(page.locator('#debugBox')).toContainText('visitorToken: avp_vst_');
      expect(apiCalls.some(url => url.includes('/api/v1/session'))).toBeTruthy();
      expect(apiCalls.some(url => url.includes('/api/v1/challenge'))).toBeTruthy();
      uiLog('Debug box contains visitor token', mask(token));
      uiLog('Browser sent /api/v1/session request');
      uiLog('Browser sent /api/v1/challenge request');
    });
  });

  test('simulated connection issue keeps page usable and reports a reason in UI/debug state', async ({ page }) => {
    const projectKey = await getDemoProjectKey(page);

    await uiStep('Open article with simulated connection issue flag', async () => {
      await page.goto(`/test-site/article?projectKey=${encodeURIComponent(projectKey)}&simulateConnectionIssue=1`);
      await expect(page.getByRole('heading', { name: /Premium article/i })).toBeVisible();
      uiLog('Article still renders when connection issue simulation is enabled');
    });

    await waitForVisitorToken(page);

    await uiStep('Verify debug box reports connection issue and content remains usable', async () => {
      await expect(page.locator('#debugBox')).toContainText(/Simulated connection issue/i);
      const protectedContent = page.locator('#protected-content');
      const hardLock = page.locator('.avp-hard-lock, [data-avp-lock="hard"]');
      await expect(protectedContent.or(hardLock).first()).toBeVisible();
      uiLog('Debug box contains simulated connection issue marker');
      uiLog('Page exposes either protected content or the current hard-lock state, depending on validation outcome');
    });
  });

  test('hidden ad slot scenario is visible to the browser test as a real CSS state', async ({ page }) => {
    const projectKey = await getDemoProjectKey(page);

    await uiStep('Open article with hidden ad-slot case and verify CSS state', async () => {
      await page.goto(`/test-site/article?projectKey=${encodeURIComponent(projectKey)}&case=hide-slot`);
      await expect(page.getByRole('heading', { name: /Premium article/i })).toBeVisible();
      await expect(page.locator('#ad-slot')).toBeHidden();
      uiLog('Article renders while #ad-slot is hidden according to browser visibility check');
    });

    await waitForVisitorToken(page);
  });

  test('server-gate demo calls backend unlock route without exposing secret key in frontend', async ({ page }) => {
    const projectKey = await getDemoProjectKey(page);

    await uiStep('Open server-gate article and verify unlock button', async () => {
      await page.goto(`/test-site/article?projectKey=${encodeURIComponent(projectKey)}&case=server-gate`);
      await expect(page.locator('#serverUnlockBtn')).toBeVisible();
      uiLog('Server unlock button is visible in server-gate scenario');
    });

    await waitForVisitorToken(page);

    await uiStep('Click server unlock and verify backend response is used by UI', async () => {
      const [response] = await Promise.all([
        page.waitForResponse(resp => resp.url().includes('/test-site/backend-unlock') && resp.request().method() === 'POST'),
        page.locator('#serverUnlockBtn').click()
      ]);
      expect(response.status()).toBe(200);
      await expect(page.locator('#serverStatus')).toContainText(/success|allowed|reason/i);
      uiLog('Browser sent POST /test-site/backend-unlock');
      uiLog('Unlock response status is 200 and UI status text was updated');
    });

    await uiStep('Verify frontend HTML does not expose secret key', async () => {
      const html = await page.content();
      expect(html).not.toContain('avp_sec_');
      uiLog('No avp_sec_ secret key string found in page HTML');
    });
  });

  test('SDK events become visible in admin dashboard after browser interaction', async ({ page }) => {
    const projectKey = await getDemoProjectKey(page);

    await uiStep('Generate browser SDK event from connection issue scenario', async () => {
      await page.goto(`/test-site/article?projectKey=${encodeURIComponent(projectKey)}&simulateConnectionIssue=1`);
      await waitForVisitorToken(page);
      await page.waitForTimeout(500);
      uiLog('Browser opened scenario and SDK had time to send event');
    });

    await loginAsAdmin(page);

    await uiStep('Verify dashboard contains at least one SDK/API event marker', async () => {
      await expect(page.locator('body')).toContainText(/connection_issue|content_unlocked|visit/i);
      uiLog('Admin dashboard contains event text after browser interaction');
    });
  });
});
