# Ad Visibility Verification SaaS — beta v1.4 full

Це повний beta-проєкт, зібраний на основі початкової v10-структури. Старі файли не видалені: вони залишені в корені та продубльовані в `legacy-v10-original/`. Основний запуск тепер відкриває SaaS-beta з dashboard, компаніями, проєктами, ключами інтеграції, SDK та server-to-server verification.

## Швидкий запуск

```bash
npm start
```

Відкрити:

```text
https://localhost:3443/
https://localhost:3443/admin
```

Логін за замовчуванням:

```text
owner@example.com
admin123
```

Для нормального тесту одразу змініть пароль:

```bash
ADMIN_EMAIL="you@example.com" ADMIN_PASSWORD="strong-password" npm start
```

## Що є в beta

- owner admin dashboard
- компанії-клієнти
- проєкти/сайти клієнтів
- public key для SDK
- secret key для server-side verification
- allowed domains
- observe-only / soft-gate / server-gate модель
- SDK endpoint `/sdk/v1/<PUBLIC_KEY>.js`
- protected content demo page
- event ingestion API
- ad fragment rendering API
- network probe
- overlay / content unlock / restore / connection issue events
- CSV export recent events
- rate limiting для login/API
- базові security headers
- локальний HTTPS
- документація для клієнтів і для Вас
- legacy v10 код збережений

## Основні режими

### observe-only
Сайт нічого не блокує. SDK лише збирає аналітику рекламної видимості. Найкращий режим для перших клієнтів.

### soft-gate
Контент на сторінці прихований до підтвердження рекламної видимості. Добре для демо, але не є максимальною production-захистом, бо контент може бути в DOM.

### server-gate
Найправильніший режим: backend клієнта не віддає повний контент, поки Ваш SaaS не підтвердить visitorToken через `/api/v1/server/verify`.

## Мінімальна інтеграція клієнта

Клієнт вставляє на сторінку:

```html
<div id="ad-slot"></div>
<div id="protected-content">
  Protected content here
</div>

<script async src="https://YOUR-SAAS-DOMAIN/sdk/v1/PROJECT_PUBLIC_KEY.js"
  data-project-key="PROJECT_PUBLIC_KEY"
  data-protected-selector="#protected-content"
  data-ad-container-selector="#ad-slot"
  data-mode="soft-gate"></script>
```

## Server-side verification

```http
POST /api/v1/server/verify
Content-Type: application/json

{
  "projectKey": "PROJECT_PUBLIC_KEY",
  "secretKey": "PROJECT_SECRET_KEY",
  "visitorToken": "TOKEN_FROM_CLIENT_SDK"
}
```

Відповідь:

```json
{
  "success": true,
  "allowed": true,
  "reason": "ad_visibility_confirmed"
}
```

## Legacy v10

Початкову TLS-gate демку можна запустити окремо:

```bash
npm run legacy
```

Вона збережена в:

```text
legacy-v10-original/
server.v10.original.js
start.v10.original.js
package.v10.original.json
```

## Важливо

Це сильна beta-основа, але ще не фінальний production SaaS. Перед реальними платними клієнтами бажано додати PostgreSQL, нормальну auth-систему, логування, reverse proxy, real TLS, backup, моніторинг, privacy/legal документи та пентест.


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
