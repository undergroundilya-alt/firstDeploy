# AdProof DB-first setup with Render PostgreSQL

This build is configured so `npm start` runs `scripts/start-db-mode.js`.
It uses PostgreSQL as the main storage for:

- project config: `avp_projects`, `avp_project_secrets`, `avp_companies`
- event analytics: `avp_events`, `avp_daily_stats`, `avp_usage_counters`
- client portal/auth: `avp_client_accounts`, `avp_client_sessions`, `avp_client_project_links`, reset tokens, leads and cancellations

The real database URL must live in `.env` or Render Environment variables. It is not hardcoded in the project.

## 1. Create local `.env`

Copy:

```bash
cp .env.db-first.example .env
```

On Windows, just duplicate `.env.db-first.example` and rename the copy to `.env`.

Then set:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE
POSTGRES_SSL=true
```

Render external PostgreSQL URLs usually need `POSTGRES_SSL=true`.

## 2. Create tables in the empty database

```bash
npm install
npm run db:setup
```

Expected result: JSON with `ok: true` and a list of `avp_*` tables.

## 3. Start the app

```bash
npm start
```

Expected startup lines:

```text
Client auth storage: Postgres/App DB (database required)
App DB: enabled=true configured=true connected=true source=DATABASE_URL
Event log dir: disabled (PostgreSQL direct event write)
Local state JSON write: disabled (PostgreSQL config source)
```

## 4. Open test links

Main launcher:

```text
http://localhost:3443/manual-test
```

Debug script map:

```text
http://localhost:3443/debug/test-site-scripts
```

Admin:

```text
http://localhost:3443/admin
```

Default login:

```text
owner@example.com / admin123
```

## 5. Two-site test matrix

Open `/manual-test` and run the four buttons:

```text
Site A localhost + Project A = PASS
Site A localhost + Project B = BLOCK
Site B 127.0.0.2 + Project B = PASS
Site B 127.0.0.2 + Project A = BLOCK
```

Blocked cases should return/record:

```text
sdk_domain_not_allowed
```

## 6. Useful database checks

In psql or Render Query Shell:

```sql
select table_name
from information_schema.tables
where table_schema='public' and table_name like 'avp_%'
order by table_name;
```

```sql
select name, public_key, allowed_domains from avp_projects order by created_at;
```

```sql
select type, reason, domain, count(*) from avp_events group by type, reason, domain order by count(*) desc;
```

## 7. Important security note

Never commit `.env` with `DATABASE_URL`. If a real database URL was pasted into a chat, issue a new password/connection string in Render after testing.
