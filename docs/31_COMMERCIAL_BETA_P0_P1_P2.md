# AVP v1.9 commercial beta checklist

This document is the single checklist for moving from production-ready beta to a small paid customer pool.

## P0 before first paid client

- Set `NODE_ENV=production`.
- Set a real `PUBLIC_BASE_URL` with HTTPS.
- Use strong `ADMIN_PASSWORD`, `SESSION_SECRET`, and `ENCRYPTION_KEY`.
- Keep `REQUIRE_MFA_IN_PRODUCTION=true`.
- Use `ALLOW_BOOT_WITHOUT_MFA=1` only for first boot; remove it after MFA is enabled.
- Mount persistent storage and set `STORAGE_ROOT` to that mount.
- Confirm `/readyz` shows the correct storage paths.
- Set `METRICS_TOKEN` and keep `METRICS_REQUIRE_TOKEN_IN_PRODUCTION=true`.
- Keep `DOCS_PRIVATE=true`.
- Configure external backup with either `EXTERNAL_BACKUP_DIR` or `EXTERNAL_BACKUP_COMMAND`.
- Run `npm run restore-drill` before onboarding clients.
- Run the full flow load test with `PROJECT_KEY=... npm run load-test`.
- Generate and verify customer domain tokens.
- Export project JSON before offboarding or deletion.

## P1 for 20–50 clients

- Use batch events. SDK v1.9 does this automatically when `hardening.eventBatching` is enabled.
- Use signed events. Default is audit-only; set `signedEventsStrict=true` per project after integration is stable.
- Set project plan and quota: `beta`, `pilot`, or `growth`.
- Use path allow/deny rules to avoid running the SDK on checkout, auth, admin, or sensitive pages.
- Customize overlay copy per project so the message fits the publisher's tone.
- Review `/admin/projects/:id/status` after each onboarding.
- Monitor alerts for `proof_failed_spike`, `bait_hit_success_rate_drop`, `http_429_rate_limited`, and `http_5xx`.
- Keep old NDJSON logs compressed and retained according to the data retention policy.

## P2 toward hundreds of clients

The zip contains scaffolding, not live infrastructure. For hundreds of clients, connect:

- PostgreSQL for tenants, projects, secrets, usage counters and event indexes.
- Redis/KeyDB for sessions, rate limits, queues and multi-instance state.
- An ingestion worker for event processing.
- An analytics aggregation worker for dashboards.
- CDN for stable SDK URLs.
- A separate collector endpoint when event volume becomes the bottleneck.
- Billing and usage metering.
- Security review, penetration testing and privacy review.
- Real browser tests with actual ad slots.
