# Automated backend/API smoke tests

This project includes a reliable black-box E2E smoke suite that checks the SaaS backend, API endpoints, mapped UI pages, SDK delivery, test client site, admin authentication, CSRF protection, metrics, isolated persistence and production guard.

The suite is intentionally verbose: every meaningful check prints a short line explaining exactly what was verified.

## Commands

```bash
npm run check
npm run test:e2e
npm test
```

`npm test` runs syntax checks first and then starts an isolated HTTP server on a random local port. Test data is written into a temporary storage directory and removed after the run, so the real `storage/` folder is not modified.

## What the log now shows

Example output shape:

```text
Ad Visibility SaaS — verbose backend/API/admin smoke tests

▶ 1. Health, readiness and runtime mode
   ✓ Server started and answered /health — http://127.0.0.1:43121
   ✓ GET /health returns 200 and test environment — ok=true, env=test
   ✓ GET /readyz returns expected isolated demo state — projects=1, clusterMode=false

▶ 4. API contract: ping, sessions, challenge, ad fragment and event ingest
   ✓ GET /api/v1/ping accepts valid project key — success=true
   ✓ POST /api/v1/session creates visitor token and returns SDK settings — token=vtok_..., mode=soft-gate
   ✓ POST /api/v1/events ingests single SDK event — type=connection_issue

✅ E2E smoke/API/backend tests passed: 40+ explicit checks in 7 sections
```

## What is covered

### Server/backend readiness

- `/health` returns 200.
- `/health` confirms `NODE_ENV=test`.
- `/readyz` returns 200.
- `/readyz` confirms demo project count.
- `/readyz` confirms cluster mode is disabled for deterministic local tests.

### Public marketing UI served by backend

- `/`
- `/product.html`
- `/ai.html`
- `/security.html`
- `/pricing.html`
- `/blog.html`
- `/about.html`
- `/support.html`
- `/site/style.css`
- `/site/app.js`
- `/platform`

The test checks that each route returns 200 and is not empty. `/platform` is checked separately to make sure the old backend landing page still exists after mapping the new UI.

### Test client site and SDK delivery

- `/test-site` renders launcher page.
- Demo `avp_pub_...` public key is visible on launcher.
- `/test-site/article` normal scenario renders and connects SDK.
- `/test-site/article?simulateAdBlock=1` renders and connects SDK.
- `/test-site/article?simulateConnectionIssue=1` renders and connects SDK.
- `/test-site/article?case=hide-slot` renders and connects SDK.
- `/test-site/article?case=server-gate` renders and connects SDK.
- `/demo/customer/:publicKey` still renders and connects SDK.
- `/sdk/v1/:publicKey.js` includes `/api/v1/session` and `/api/v1/events` calls.
- `/sdk/v1/:publicKey/boot-test.js` dynamically injects the SDK script with `document.createElement` and `encodeURIComponent`.

### API contract

- `GET /api/v1/ping` accepts a valid project key.
- `POST /api/v1/session` rejects a missing project with `project_not_found`.
- `POST /api/v1/session` creates a visitor token for a valid project.
- Session response contains expected mode and selectors.
- `POST /api/v1/challenge` issues nonce/pool proof fields.
- `GET /api/v1/ad-fragment` returns safe ad fragment HTML with `data-avp-slot`.
- `POST /api/v1/events` ingests a single SDK event.
- `POST /api/v1/events/batch` rejects an empty batch.
- `POST /api/v1/server/verify` rejects a bad secret.
- `POST /test-site/backend-unlock` uses server-side verification and rejects unlock before confirmed proof.
- `OPTIONS /api/v1/session` handles CORS preflight.

### Admin/backend auth and CSRF

- `/admin` redirects to `/admin/login` without session.
- `/admin/login` renders login page.
- `POST /admin/login` authenticates the default test owner.
- `/admin` opens with authenticated session.
- `/admin/projects/new` returns project form and CSRF token.
- Admin POST without CSRF is rejected.
- `POST /admin/projects/create` creates a new server-gate project.
- New project appears in dashboard table.

### Metrics and persistence

- `/metrics` exposes `avp_up 1`.
- `/metrics` exposes expected project count after project creation.
- Isolated JSON state file is created in a temp directory.
- Project secrets are stored encrypted/secret-managed, not as plain frontend values.
- API activity is recorded in `globalEvents`.

### Production guard

- Starting the server with unsafe production defaults fails.
- The failure message includes `[production-guard] Refusing to start`.

## What is intentionally not covered here

These tests do not try to automate fragile visual browser behavior such as real extension-level ad blocking, IntersectionObserver visibility ratios, WebCrypto signing in a real browser context or CSS pixel-perfect layout. Those are covered later by Playwright/browser/manual scenarios, not by this backend/API smoke layer.
