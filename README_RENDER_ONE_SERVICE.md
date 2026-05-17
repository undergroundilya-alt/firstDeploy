# AdProof — Render one-service beta deploy

This build is prepared for a temporary Render trial where you want everything inside one web service.

## What is included in one service

- Public marketing site from `public-site/`
- Node backend from `server.js`
- Registration and login
- Client account portal
- Project creation
- SDK/API endpoints
- Local JSON storage for accounts, projects, runtime sessions, events, leads, and email outbox

## Important limitation

This is a beta shortcut. The local JSON database is not a real production database.

If the service has no persistent disk, data can be lost after redeploys, rebuilds, restarts, or instance replacement. For a serious launch, move client accounts and analytics to PostgreSQL.

## Render setup

1. Push this folder to GitHub.
2. In Render create a new Web Service from that repo.
3. Build command:

```bash
npm ci --omit=dev
```

4. Start command:

```bash
npm start
```

5. Environment variables:

Use `render.yaml` or copy values from `.env.render.example`.

Minimum values to set manually:

```text
PUBLIC_BASE_URL=https://YOUR_RENDER_SERVICE.onrender.com
ADMIN_EMAIL=your@email.com
ADMIN_PASSWORD=long-strong-password
SESSION_SECRET=long-random-secret-at-least-32-chars
ENCRYPTION_KEY=long-random-secret-at-least-32-chars
METRICS_TOKEN=long-random-token-at-least-32-chars
```

6. After deploy, open:

```text
/register
/login
/pricing.html
/admin
```

## Storage files

The temporary JSON database uses:

```text
storage/saas-state.json
storage/auth-accounts.json
storage/runtime-sessions.json
storage/email-outbox.json
storage/events/
storage/audit/
storage/backups/
```

## Later migration

When the beta proves useful, switch these variables back to PostgreSQL:

```text
ENABLE_APP_DB=true
ENABLE_POSTGRES_STORAGE=true
AUTH_REQUIRE_DATABASE_FOR_CLIENT_AUTH=true
DATABASE_URL=postgresql://...
```

## Render Docker HTTPS fix
This archive defaults production Docker deploys to `USE_HTTPS=false` because Render terminates TLS at the platform edge and forwards HTTP to the container. The app should not try to generate or load local `certs/localhost-*.pem` on Render.

If you still see `[certs] Missing local HTTPS certificate`, check Render → Environment and make sure there is no `USE_HTTPS=true`. Set it to `false`, then redeploy.
