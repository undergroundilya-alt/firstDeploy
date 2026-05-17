# AVP v1.8 — production-ready beta checklist

Эта версия добавляет production-слои поверх v1.7, не удаляя WebCrypto/canvas proof, server-gate, dynamic SDK, restore-flow, TLS fingerprint gate, dashboard, JSON atomic write, NDJSON event logs, backups и restore-check.

## 1. Production mode guard
В `server.js` добавлен строгий startup guard для `NODE_ENV=production`: проверяет `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `ENCRYPTION_KEY`, `PUBLIC_BASE_URL`, backup/event dirs, metrics access и TLS/reverse-proxy режим. Можно временно ослабить через `STRICT_PRODUCTION_GUARD=false`.

## 2. Разделение persistent state и runtime sessions
`data/saas-state.json` хранит конфигурацию, компании, проекты и counters. Runtime-сессии сохраняются отдельно в `data/runtime-sessions.json` и не загрязняют persistent backup.

## 3. Admin audit log
Добавлен append-only audit log: `data/audit/admin-audit-YYYY-MM-DD.ndjson`. Пишутся login success/fail, logout, backup, export, project create/update, secret rotation, API-key creation, MFA и kill switch.

## 4. Secret rotation
В карточке проекта добавлен `Rotate server secret`. Старый ключ получает grace period, новый показывается один раз в admin UI. Secrets хранятся как encrypted AES-256-GCM records.

## 5. Scoped API keys
У проекта есть ключи типов `server_verify`, `events_ingest`, `analytics_readonly`. В UI можно создать новый scoped key. `server/verify` принимает `secretKey` или `apiKey` типа `server_verify`.

## 6. MFA для admin
Добавлен TOTP MFA без внешних зависимостей. В `/admin/security` можно сгенерировать secret, добавить в Authenticator и включить MFA. Для production можно включить `REQUIRE_MFA_IN_PRODUCTION=true`.

## 7. Роли пользователей
Модель пользователей поддерживает роли: `owner`, `admin`, `analyst`, `support`, `client_readonly`. Сейчас основной UI рассчитан на owner/admin, но модель уже заложена.

## 8. Alerts и security logging
Добавлен alert log: `data/alerts/alerts-YYYY-MM-DD.ndjson`. Срабатывает при state corruption, failed writes, event queue overflow, proof spikes, heartbeat spikes, bad server secret и missing bait hit.

## 9. Restore drill
Добавлен `npm run restore-drill`: берёт последний backup или текущий state, восстанавливает во временную папку и валидирует структуру.

## 10. Усиленная JSON schema validation
`validateStateShape()` теперь проверяет пользователей, роли, проекты, режимы, домены, массивы и size guard для recent events.

## 11. Data corruption quarantine
Повреждённый state переносится в `data/corrupted/`. В production сервер не создаёт молча новый state, а пытается восстановиться из последнего валидного backup или останавливается.

## 12. Закрытые metrics
`/metrics` теперь требует `METRICS_TOKEN` или allowlist IP через `METRICS_ALLOW_IPS`.

## 13. Private docs
В production `/docs` по умолчанию закрыт за admin login через `DOCS_PRIVATE=true`.

## 14. Строгий CORS
В production запрещены `Origin:null`, wildcard domains и non-HTTPS origin. Allowed domains остаются project-aware.

## 15. Trust proxy
`X-Forwarded-For` используется только если request пришёл от trusted proxy из `TRUST_PROXY_IPS`.

## 16. SDK versioning
SDK поддерживает `/sdk/v1/...` и `/sdk/v2/...`. У проекта есть поля `sdkVersion` и `sdkChannel`.

## 17. Canary rollout
У проекта есть `canaryPercent`. Bootstrap может отправлять часть трафика на `v2` SDK.

## 18. Kill switch
Есть глобальный kill switch в `/admin/security` и project-level kill switch/enable в настройках проекта.

## 19. UX fallback levels
В проекте есть `fallbackPolicy`: `gentle`, `balanced`, `strict`. SDK уже разделяет connection issue, network filter, proof failure и persistent tamper.

## 20. Legal/privacy пакет
Добавлены и обновлены docs для privacy/legal/commercial checklist. Позиционирование — ad visibility verification и protected content access, а не агрессивное противостояние пользователю.

## 21. Performance budget
SDK получил adaptive behavior: меньше DOM noise на mobile, pause timers when hidden, rerender on visibility return.

## 22. Browser compatibility matrix
См. `docs/30_BROWSER_COMPATIBILITY_MATRIX.md`.

## 23. Load/stress tests
Добавлен `npm run load-test` для базовой проверки ping endpoint с concurrency.

## 24. Queue-like event buffer
Event log теперь пишет через in-memory queue + flush + dead-letter fallback при overflow/failure.

## 25. NDJSON export/compact/import scaffold
Добавлены `npm run export-events`, `npm run compact-events`, `scripts/import-events-to-postgres.js`.

## 26. Dashboard по дням и breakdowns
В project dashboard есть daily stats, top domains, browser breakdown, recent events, reasons.

## 27. История событий не держится вся в памяти
State хранит только recent events/counters. Полная история — в `data/events/events-YYYY-MM-DD.ndjson`.

## 28. Project-level limits
Добавлены per-project limits: sessions/min, events/min, proof attempts per visitor.

## 29. Abuse protection
Invalid origin, bad visitor token, excessive proof attempts, bad server secret и rate limit пишутся как abuse/security events.

## 30. Product positioning policy
README/docs используют более безопасное позиционирование: `ad visibility verification`, `publisher monetization protection`, `server-side content eligibility check`, `consent-aware access gate`.

## Важное ограничение
v1.8 остаётся JSON/NDJSON-first. PostgreSQL-схема и deploy scaffolding добавлены как следующий миграционный слой, но основной runtime ещё не переписан на SQL adapter.
