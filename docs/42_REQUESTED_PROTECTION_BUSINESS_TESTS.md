# Requested protection and business test layer

This update adds a separate test layer for the requested protection, SaaS business, and safety-edge scenarios.

## New commands

```bash
npm run test:requested
npm test
```

`npm test` now runs syntax checks, the existing backend/API smoke suite, and the requested scenario suite.

## Implemented runtime/backend features

### Heartbeat lease endpoint

`POST /api/v1/heartbeat`

The SDK can now report whether the page is still in a valid state. A failed ad-zone state marks the session as failed and does not extend the lease.

### Lease status endpoint

`GET /api/v1/lease-status?projectKey=...&visitorToken=...`

Returns whether a visitor session currently has a fresh access lease.

### Hard lock screen

For blocking validation failures, the SDK can replace the current body with a hard lock screen. This is intentionally stronger than a normal overlay. Soft connection problems remain separate and do not immediately accuse the user of ad blocking.

### Lead capture backend

`POST /api/v1/leads`

Stores demo/contact form submissions in a separate `LEADS_FILE` JSON store.

### Client registration store

`POST /auth/register`

Stores client accounts in a separate `AUTH_DB_FILE` JSON store. This is intentionally separate from the admin owner login store.

### OAuth stubs

`GET /auth/google/start`
`GET /auth/github/start`

These fail safely with `501` until real OAuth credentials and callback flows are implemented.

### Billing/card verification stub

`POST /api/v1/billing/card-verification`

This fails safely with `501` unless a real billing provider adapter is configured. It does not pretend that card verification is complete.

### Trial status API

`GET /api/v1/trial-status?projectKey=...`

Returns a server-side trial countdown for frontend trial badges/banners.

## Important security notes

The project should not promise that frontend code cannot be modified. The real security model is:

- frontend collects signals
- backend validates session state
- protected content is not served or renewed without a fresh valid lease
- if the SDK/API is blocked, the lease is not renewed
- if the ad zone is invalid, the session becomes failed

The browser remains user-controlled. Therefore, the project must not rely on console blocking, overlay-only protection, or hidden frontend flags as the primary control.
