# PostgreSQL и Render deploy

## Что уже добавлено

- `db/postgres_schema.sql` — полноценная PostgreSQL-схема для пользователей, компаний, проектов, secrets, sessions, events, daily stats, audit log и alerts.
- `deploy/docker-compose.postgres.yml` — локальный PostgreSQL 16 с автоприменением схемы.
- `render.yaml` — стартовая конфигурация для Render web service.
- `scripts/import-events-to-postgres.js` — scaffold для будущего импорта NDJSON events в PostgreSQL.

## Локальный PostgreSQL

```bash
cd deploy
docker compose -f docker-compose.postgres.yml up -d
```

Подключение:

```bash
psql postgres://avp:change_me_strong_password@localhost:5432/avp
```

Проверка таблиц:

```sql
\dt
SELECT * FROM avp_project_summary;
```

## Render web service

Для Render рекомендуется запускать приложение за reverse proxy без self-signed HTTPS внутри Node:

```env
NODE_ENV=production
USE_HTTPS=false
HOST=0.0.0.0
PORT=<Render sets this automatically>
PUBLIC_BASE_URL=https://your-domain.com
ADMIN_EMAIL=your@email.com
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

## Custom domain

1. Создать Web Service на Render.
2. Подключить GitHub repository или загрузить проект.
3. Указать `npm ci` как build command.
4. Указать `npm start` как start command.
5. Поставить `USE_HTTPS=false`.
6. В Render добавить Custom Domain.
7. В DNS своего домена прописать CNAME/A records, которые даст Render.
8. В `PUBLIC_BASE_URL` указать финальный домен, например:

```env
PUBLIC_BASE_URL=https://adverify.example.com
```

## Когда реально переходить на PostgreSQL runtime

Переход нужен, когда появляются:

- больше одного Node-процесса;
- несколько серверов;
- биллинг;
- юридически значимые отчёты;
- десятки клиентов;
- высокая частота events;
- необходимость сложной аналитики за месяцы.

До этого v1.8 можно использовать как controlled production beta при одном процессе и аккуратных backup/restore процедурах.
