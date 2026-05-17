# Ad Visibility Verification SaaS — v15 hardened beta

Это полный проект beta SaaS-платформы для проверки рекламной видимости, защиты рекламной монетизации и условной выдачи защищённого контента.

Главная цель v15: **не потерять сильную v10-логику**, а встроить её в основной SaaS-проект.

## Быстрый запуск

```bash
npm start
```

Открыть:

```text
https://localhost:3443/
https://localhost:3443/admin
```

Логин по умолчанию:

```text
owner@example.com
admin123
```

Лучше запускать так:

```bash
ADMIN_EMAIL="you@example.com" ADMIN_PASSWORD="strong-password" npm start
```

## Что есть

- SaaS dashboard.
- Компании и проекты клиентов.
- Public key / secret key.
- Install snippet.
- Observe-only / soft-gate / server-gate.
- WebCrypto proof.
- Canvas proof.
- One-time server challenge.
- Server bait-hit.
- Visibility proof.
- DOM noise.
- MutationObserver.
- Body-level watcher.
- Server restore.
- Scheduled rerender every 30 seconds.
- Heartbeat.
- uBlock vs bad internet check.
- Analytics.
- CSV export.
- Server-to-server verification.
- Legacy v10 preserved.
- TLS fingerprint proxy preserved.
- Test adblocker extension preserved.

## Legacy v10

Исходная версия из первого архива сохранена:

```text
legacy-v10-original/
```

Запуск:

```bash
npm run legacy
```

TLS proxy:

```bash
npm run legacy-tls-gate
```

## Production gaps

Для реального платного SaaS всё ещё нужно добавить:

- PostgreSQL вместо JSON-файла.
- Нормальную user/account auth.
- Encrypted secret storage.
- Reverse proxy.
- Public TLS certificate.
- Backups.
- Monitoring.
- Terms/privacy/DPA.
- CDN/edge delivery для SDK.
- Более аккуратную политику хранения событий.

Но v15 уже подходит как сильная beta-основа для демонстрации, изучения, локального тестирования и подготовки первых beta-клиентов.
