# Client portal, auth DB and Render/PostgreSQL notes

This build adds public client pages:

- `/register` — create client account
- `/login` — client login
- `/account` — client portal, project list, project creation, SDK snippet
- `/logout` — client logout

The owner/admin dashboard remains separate:

- `/admin/login`
- `/admin`
- `/admin/security`

## Storage modes

### Local MVP mode

If no database is configured, the app stores client accounts, client sessions and project links in:

```text
storage/auth-accounts.json
storage/leads.json
storage/saas-state.json
```

This is good for local tests and simple demo runs.

### Render/PostgreSQL mode

For a Render/PostgreSQL deployment, set:

```env
DATABASE_URL=postgres://...
ENABLE_APP_DB=true
ENABLE_POSTGRES_STORAGE=true
POSTGRES_AUTO_MIGRATE=true
POSTGRES_BOOTSTRAP_FROM_JSON=true
POSTGRES_SSL=true
USE_HTTPS=false
TRUST_PROXY=true
PUBLIC_BASE_URL=https://your-render-service.onrender.com
```

Then run migrations:

```bash
npm run db:migrate
```

The migration `db/migrations/003_client_portal_auth_leads.sql` creates:

- `avp_client_accounts`
- `avp_client_sessions`
- `avp_client_project_links`
- `avp_leads`

The existing migrations keep project/event storage:

- `avp_companies`
- `avp_projects`
- `avp_project_secrets`
- `avp_events`
- `avp_daily_stats`

## What to test after deployment

1. Register a new client at `/register`
2. Login at `/login`
3. Open `/account`
4. Create a project with your test domain
5. Copy SDK snippet
6. Put snippet into the static test site
7. Open test site and verify SDK/session/heartbeat/events
8. Confirm events appear in `/admin`

## Current billing/OAuth status

The app currently includes safe stubs for:

- `/auth/google/start`
- `/auth/github/start`
- `/api/v1/billing/card-verification`

They intentionally return `not_configured` until real provider credentials are added.
