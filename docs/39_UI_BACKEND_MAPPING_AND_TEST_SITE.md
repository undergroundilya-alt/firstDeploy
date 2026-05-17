# UI ↔ backend mapping and test site

## Goal
This build combines the static commercial website UI with the existing SaaS backend, admin dashboard, SDK, project analytics, and a real test client site.

## Public / marketing UI
- `/` → public marketing homepage from `public-site/index.html`
- `/product.html` → product page
- `/ai.html` → AI summaries page
- `/security.html` → security page
- `/pricing.html` → pricing page
- `/docs.html` → public integration/docs marketing page
- `/blog.html` → blog page
- `/about.html` → company page
- `/support.html` → beta access/support page
- `/site/...` → same static frontend under a namespace

## Existing SaaS/admin UI
- `/platform` → original backend landing page
- `/admin/login` → admin login
- `/admin` → global SaaS dashboard
- `/admin/projects/new` → create client/project
- `/admin/projects/:id` → project analytics, keys, snippet, settings
- `/admin/projects/:id/status` → integration health
- `/admin/security` → MFA, audit log, alerts, kill switch
- `/docs` and `/docs/:file` → internal markdown documentation, private in production by default

## SDK/API
- `/sdk/v1/:publicKey/boot-*.js` → dynamic SDK bootstrap
- `/sdk/v1/:publicKey/*.js` → dynamic SDK payload
- `/api/v1/session` → create visitor session
- `/api/v1/challenge` → issue visibility/proof challenge
- `/api/v1/proof` → validate ad visibility/browser proof
- `/api/v1/events` and `/api/v1/events/batch` → ingest client events
- `/api/v1/server/verify` → server-to-server verification for real customer backends

## Test client site
- `/test-site` → test case launcher
- `/test-site/article` → real client-like page with SDK attached
- `/test-site/article?simulateAdBlock=1` → network/adblock simulation
- `/test-site/article?simulateConnectionIssue=1` → connection issue simulation
- `/test-site/article?case=hide-slot` → hidden ad container
- `/test-site/article?case=remove-after-unlock` → removes ad slot after unlock to test restore/overlay
- `/test-site/article?case=server-gate` → simulates backend unlock without exposing project secret in frontend
- `/test-site/backend-unlock` → local test backend route that checks visitorToken and records server verification events

## What to verify after each test
Open `/admin`, then the demo project, and check:
- visits
- content unlock rate
- overlay rate
- restored ad blocks
- reasons
- recent events
- top domains/pages
- server verification counters for server-gate test
