# AdProof architecture foundation — 19-point master plan

This document turns the architecture discussion into an explicit project checklist. It is intentionally practical: every point has a project area, data/storage impact, runtime impact and test/operations impact.

## 1. One Postgres database, separate logical table blocks

Use one primary Postgres database as the source of truth. Do not split users and projects into separate databases at this stage. Split by table families instead:

- Auth/accounts: `avp_client_accounts`, `avp_client_sessions`, `avp_password_reset_tokens`, `avp_marketing_consents`, `avp_email_unsubscribes`
- Companies/projects: `avp_companies`, `avp_projects`, `avp_project_members`, `avp_project_domains`, `avp_project_settings`
- Events/analytics: `avp_events`, `avp_hourly_stats`, `avp_daily_stats`, `avp_page_stats`, `avp_page_sessions`, `avp_visitor_sessions`
- Billing/plans: `avp_subscriptions`, `avp_plan_limits`, `avp_usage_daily`, `avp_invoices`, `avp_revenue_share_reports`
- Support/complaints: `avp_support_tickets`, `avp_abuse_reports`, `avp_user_complaints`
- System: `avp_audit_log`, `avp_api_keys`, `avp_webhook_deliveries`, `avp_feature_flags`, `avp_sdk_versions`, `avp_incidents`, `avp_status_events`

Migration `006_architecture_foundation_19_points.sql` creates the missing tables as an additive foundation.

## 2. Redis / queue as runtime, not as the source of truth

Redis is for short-lived runtime state:

- visitor sessions
- challenges
- nonce/replay protection
- rate limits
- heartbeat state
- event queue buffer
- quota counters

Postgres remains the durable source of truth. If Redis is down, strict verification may degrade, but the product should not silently fake success.

## 3. SDK caching model

Split SDK delivery into:

1. Tiny project boot script: `/sdk/v1/<publicKey>.js`
2. Shared immutable SDK core: `/sdk/v1/avp-core.<hash>.js`
3. Project config: `/api/sdk/config?key=<publicKey>`

The boot script stays small and project-specific. The SDK core is heavy and cacheable across websites. Project config is short-lived.

Recommended headers:

```text
SDK core:       Cache-Control: public, max-age=31536000, immutable
Project boot:   Cache-Control: public, max-age=300
Project config: Cache-Control: public, max-age=60, must-revalidate
Challenge/proof: no-store
```

## 4. Project config must not be permanently cached

Allowed domains, overlay mode, strict mode, copy, quotas and kill switches must update quickly. Use short cache, ETag or config version fields.

## 5. Server logic split

Long-term direction:

```text
src/routes/site.routes.js
src/routes/auth.routes.js
src/routes/account.routes.js
src/routes/project.routes.js
src/routes/sdk.routes.js
src/routes/verify.routes.js
src/routes/analytics.routes.js
src/routes/admin.routes.js
src/routes/support.routes.js

src/services/email.service.js
src/services/auth.service.js
src/services/project.service.js
src/services/sdk.service.js
src/services/verify.service.js
src/services/analytics.service.js
src/services/billing.service.js
src/services/consent.service.js
src/services/audit.service.js

src/db/postgres.js
src/db/repositories/*.js
```

Current project already starts this with `src/blocks/email-service.js`, `src/blocks/client-portal-block.js`, `src/blocks/site-block.js`.

## 6. Client dashboard blocks

Minimum dashboard areas:

- Profile: name, email, provider, marketing preference, password actions
- Projects: project cards, domains, SDK snippet, mode, status, quota usage
- Analytics: visits, overlay rate, tamper events, recovered impressions, hourly/daily trends
- Billing: plan, limits, invoices, revenue-share reports
- Support: tickets, complaints, integration help

## 7. Email system

Separate service emails from marketing emails.

Service emails can be sent without marketing consent:

- registration/welcome
- password reset
- password changed
- trial activated
- security alerts
- billing/account deletion

Marketing emails require consent:

- product updates
- tips
- case studies
- promotions

Every marketing email needs an unsubscribe link backed by `avp_email_unsubscribes`.

## 8. Support and complaints

The product needs a support intake before real deployment:

- `/support`
- `/report-issue`
- `/report-adproof`

Support tables:

- `avp_support_tickets`
- `avp_abuse_reports`
- `avp_user_complaints`

Admin should show project, domain, timestamp, page URL, visitor/session hash and status.

## 9. Security model

Core safety principles:

- allowed domain check
- domain ownership verification
- public key / secret key separation
- short-lived challenge
- nonce / replay protection
- signed proof
- Origin / Referer checks
- event signing
- rate limits
- heartbeat
- mutation observer
- foreign script guard
- no global sensitive visitor token in production
- audit log
- secret rotation

Client-side JavaScript can be inspected. The goal is not invisibility. The goal is that a browser cannot convincingly prove `fake-success` without the correct domain/session/challenge/proof/nonce/time chain.

## 10. Analytics pipeline

Raw events should be stored, then aggregated:

```text
raw events -> queue/worker -> hourly/daily stats -> dashboard
```

Raw event examples:

- `visit`
- `sdk_loaded`
- `ad_visible`
- `ad_hidden`
- `ad_removed`
- `overlay_shown`
- `unlock_attempt`
- `content_unlocked`
- `heartbeat_failed`
- `mutation_detected`
- `foreign_script_blocked`
- `unsigned_event_rejected`
- `forged_proof_rejected`

Dashboards should mostly read aggregates when traffic grows.

## 11. CI/CD

Three gates:

1. Local pre-push: `npm run ci:local`
2. GitHub Actions on push/PR: non-UI tests + Playwright responsive smoke
3. Scheduled synthetic checks every 30-60 minutes against staging/production

Bad tests should block merges/deploys.

## 12. Stage / Prod separation

Staging allows:

- mock data
- debug endpoints
- test emails
- Playwright synthetic tests
- experimental SDK flags

Production must enforce:

- no mock seed
- no open debug endpoints
- rate limits
- security headers
- real SMTP
- real backup/monitoring
- strict secret handling

## 13. Backups and restore

Backups are not enough. Restore tests matter.

Minimum:

- daily Postgres backup
- weekly restore test on staging
- backup retention policy
- restore runbook
- visible restore status in `avp_backup_restore_checks`

If restore test fails, treat it as a production risk.

## 14. Billing / plans

Plans should be data-backed, not only static pricing text.

Suggested starting plans:

- Beta Trial: 30 days, 1 project, 100k protected visits/month
- Classic: $49/month, up to 3 projects, 300k-500k protected visits/month
- Enterprise: custom fixed / revenue-share / hybrid terms

Track usage in `avp_usage_daily` and revenue-share evidence in `avp_revenue_share_reports`.

## 15. Admin panel

Admin is separate from the client dashboard. It should show:

- clients
- projects
- domains
- usage
- errors
- security events
- support tickets
- email delivery status
- marketing consent
- subscription/cancellation events
- revenue-share reports
- audit log
- key rotation
- kill switch controls

## 16. Kill switch and feature flags

Add fast rollback levers:

- disable project
- disable domain
- disable strict mode
- disable overlay
- switch SDK version
- disable an experimental check

Use `avp_feature_flags`, `avp_kill_switch_events`, project `kill_switch` and `sdk_channel`.

## 17. SDK versioning and rollback

SDK must be versioned and rollback-friendly:

```text
/sdk/v1/<publicKey>.js
/sdk/v1/avp-core.<hash>.js
/sdk/v2/<publicKey>.js
```

Project-level fields:

- `sdk_version`
- `sdk_channel`: stable / beta / experimental
- `canary_percent`

## 18. Domain ownership verification

Allowed domains should become verified domains, not just text in a form.

Verification methods:

- DNS TXT record
- `.well-known/adproof-verification.txt`
- meta tag

Domain statuses:

- pending
- verified
- failed
- blocked

Tables:

- `avp_project_domains`
- `avp_domain_verification_tokens`

## 19. Privacy, legal and retention

Before real clients, add:

- Terms
- Privacy Policy
- Acceptable Use Policy
- Data retention policy
- DPA template for bigger clients
- cookie/tracking explanation

Recommended retention starting point:

- raw events: 30-90 days
- aggregates: 12-24 months
- support tickets: as needed
- deleted accounts: delete or anonymize

## Final target flow

```text
Publisher site
  -> tiny project boot script
  -> cached SDK core
  -> project config API
  -> visitor session + challenge
  -> visibility / heartbeat / mutation checks
  -> signed proof
  -> Verification API
  -> Redis runtime / queue
  -> Postgres raw events
  -> worker aggregates
  -> dashboard / billing / reports
```
