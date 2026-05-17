# README Hardened v1.6

v1.6 объединяет v10/v15 защитную логику и добавляет operational/security слой без PostgreSQL.

## Главные изменения

- PBKDF2 admin password hashing.
- CSRF для admin POST.
- AES-256-GCM encrypted project secrets.
- Dynamic SDK bootstrap URL.
- TLS fingerprint gated startup mode: `npm run start:tls-gated`.
- DOM noise default 500–700.
- Backup engine.
- `/healthz`, `/readyz`, `/metrics`.
- Nginx/systemd/backup deployment examples.
- Privacy/legal templates.

## Что не изменилось

- JSON storage остаётся beta storage.
- Legacy v10 сохранён.
- Основной запуск: `npm start`.
- Старый запуск: `npm run legacy`.

## Важная пометка

Это не обещание абсолютной невозможности обхода. Browser extensions and filter rules evolve. Правильная коммерческая формулировка: система делает обход существенно сложнее за счёт server-side proof, одноразовых challenge, dynamic SDK, ререндера, heartbeat и аналитики событий.
