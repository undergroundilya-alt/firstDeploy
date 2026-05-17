# Changelog

## 1.7.0-beta-json-hardened — 2026-05-05

- Added atomic state writes using temp file + fsync + rename.
- Added append-only NDJSON event logs in `data/events/events-YYYY-MM-DD.ndjson`.
- Added daily event log rotation and `EVENT_LOG_RETENTION_DAYS`.
- Added restore-check validation for current state, backups and event logs.
- Added `npm run restore-check`.
- Changed `globalEvents` into a bounded recent-events cache.
- Added configurable `MAX_GLOBAL_RECENT_EVENTS` and `MAX_RECENT_PROJECT_EVENTS`.
- Backup creation now validates the source state and created backup.

# v15 hardened beta

- Main SaaS SDK получил WebCrypto ECDSA proof.
- Добавлен одноразовый server challenge.
- Добавлен canvas proof в основной SDK.
- Добавлен server bait-hit через pixel/script endpoint.
- Добавлена server-side проверка signed proof перед content unlock.
- Добавлен DOM noise 1000–1500 элементов в основной SDK.
- Усилен MutationObserver + body-level watcher.
- Добавлен scheduled rerender каждые 30 секунд.
- Добавлен heartbeat/watchdog.
- Добавлен dynamic SDK route `/sdk/v1/:publicKey/:random.js`.
- Legacy v10 сохранён без удаления.

# Changelog

## v1.4.0-beta-full

- Збережено всі початкові v10-файли.
- Додано папку `legacy-v10-original/` з повною копією першого архіву.
- Основний запуск переведено на SaaS-beta server.
- Додано owner dashboard.
- Додано companies/projects/publicKey/secretKey.
- Додано SDK endpoint.
- Додано event ingestion API.
- Додано server-to-server verification endpoint.
- Додано allowed domains.
- Додано observe-only / soft-gate / server-gate логіку.
- Додано rate limiting для admin login та API.
- Додано базові security headers.
- Додано CSV export recent events.
- Додано документацію для onboarding, deployment, privacy, testing, security, release plan.

## 1.6.0-beta-hardened — 2026-05-05

- Added PBKDF2-SHA256 admin password hashing and legacy hash upgrade.
- Added CSRF protection for admin state-changing POST routes.
- Added AES-256-GCM encrypted storage for project secret keys.
- Added manual and automatic local JSON-state backups.
- Added `/healthz`, `/readyz`, and `/metrics` monitoring endpoints.
- Added dynamic SDK bootstrap route and per-page dynamic SDK loading.
- Adjusted default DOM noise pool to 500–700 generated elements.
- Added deployment examples: Nginx reverse proxy, systemd, backup cron.
- Added privacy/legal/auth/secrets/monitoring/deployment docs.
- PostgreSQL intentionally not added in this beta package.
