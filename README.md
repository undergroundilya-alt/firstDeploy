# Ad Visibility Verification SaaS — v1.8 production-ready beta

Hardened beta SaaS platform for ad visibility verification and protected content access.

This is not just a bait-div anti-adblock script. The project includes:

- admin dashboard;
- companies and projects;
- dynamic customer SDK;
- WebCrypto ECDSA proof;
- canvas proof;
- server-side bait hit verification;
- server-gate API for protected content;
- restore flow after DOM tampering;
- neutral network ping vs ad resource probe;
- adaptive SDK performance budget;
- hardened JSON state with atomic writes;
- separated runtime sessions file;
- append-only NDJSON event logs;
- event write queue and dead-letter fallback;
- daily event rotation;
- backup and restore-check;
- restore-drill;
- encrypted project secrets;
- secret rotation with grace period;
- scoped API keys;
- PBKDF2 admin password storage;
- optional TOTP MFA;
- admin audit log;
- alerts log;
- global and project-level kill switches;
- project-level limits;
- strict CORS and trusted proxy handling;
- private docs and protected metrics;
- PostgreSQL schema and Render deploy scaffolding.

## Run locally

```bash
npm install
npm run certs
npm start
```

Default local dashboard:

```text
https://localhost:3443/admin
owner@example.com / admin123
```

For local HTTP behind a proxy-style run:

```bash
USE_HTTPS=false PUBLIC_BASE_URL=http://localhost:3443 npm start
```

## SMTP email sending

Registration and password-reset emails now use real SMTP when SMTP variables are configured. The app still writes every attempted email to `storage/email-outbox.json` as a delivery/debug log.

Minimal local SMTP setup:

```env
SMTP_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM="AdProof <your-email@gmail.com>"
SMTP_REPLY_TO=your-email@gmail.com
```

After changing dependencies or pulling this archive fresh, run:

```bash
npm install
```

Delivery status is visible in `/health`, `/readyz`, server logs, and `storage/email-outbox.json` with statuses such as `pending_smtp`, `sent`, `smtp_failed`, or `local_outbox_only`.

## Production-like Render mode

Render terminates TLS for you, so run Node over HTTP behind Render:

```env
NODE_ENV=production
USE_HTTPS=false
PUBLIC_BASE_URL=https://your-domain.com
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=<strong-password>
SESSION_SECRET=<random-64-chars>
ENCRYPTION_KEY=<random-64-chars>
BACKUP_DIR=/opt/render/project/src/backups
EVENT_LOG_DIR=/opt/render/project/src/data/events
AUDIT_LOG_DIR=/opt/render/project/src/data/audit
ALERT_LOG_DIR=/opt/render/project/src/data/alerts
METRICS_TOKEN=<random-token>
DOCS_PRIVATE=true
STRICT_PRODUCTION_GUARD=true
```

See `docs/29_POSTGRES_AND_RENDER_DEPLOY.md`.

## Main commands

```bash
npm run check
npm run restore-check
npm run restore-drill
npm run load-test
npm run export-events
npm run compact-events
```

## PostgreSQL path

The app still runs on hardened JSON/NDJSON storage in v1.8. PostgreSQL migration assets are included:

```text
db/postgres_schema.sql
deploy/docker-compose.postgres.yml
scripts/import-events-to-postgres.js
```

This gives you the code/schema to raise PostgreSQL when you are ready, without breaking the current beta runtime.

## Important production note

v1.8 is suitable for controlled production beta / pilot deployments with one Node process and careful backups. For high-load, billing, multi-server, multi-process or legally significant analytics, move runtime storage to PostgreSQL using the included schema.


## v1.9 commercial beta additions

This archive includes the requested P0/P1/P2 hardening layer for a small serious customer pool:

- persistent `STORAGE_ROOT` layout and Render persistent disk config;
- external backup hooks and scheduled restore drills;
- production-safe request errors and `X-Request-Id`;
- private docs and token-protected metrics in production;
- domain verification with `.well-known/avp-verify.txt`;
- project JSON export and offboarding delete flow;
- full API load-test flow;
- batch events and signed event envelopes;
- project plans, quotas and per-visitor event limits;
- path allow/deny rules and custom overlay copy;
- project status/integration health page;
- old NDJSON compression;
- PostgreSQL, Redis/KeyDB, ingestion worker and analytics worker scaffolding.

Important: PostgreSQL, Redis, CDN, object storage, billing provider, browser farm and penetration test are infrastructure/services, so the archive contains the code hooks, schemas and runbooks needed to connect them, not live accounts.
