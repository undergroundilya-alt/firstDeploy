# AVP v2.0 — cluster-ready commercial beta

This version keeps the original SaaS/dashboard flow but adds a production-oriented runtime layer for multi-server deployment.

## Main modes

### Single-node beta mode

```bash
npm install
npm start
```

Uses JSON/NDJSON storage and local runtime sessions. Suitable for demo, development and a very small pilot.

### Cluster mode

```bash
cp .env.production.example .env
# edit secrets and domain
cd deploy
PUBLIC_BASE_URL=https://your-domain.example \
ADMIN_EMAIL=owner@example.com \
ADMIN_PASSWORD='replace-with-long-password' \
SESSION_SECRET='replace-with-random-64-plus-chars' \
ENCRYPTION_KEY='replace-with-random-64-plus-chars' \
METRICS_TOKEN='replace-with-random-token' \
POSTGRES_PASSWORD='replace-with-strong-postgres-password' \
docker compose -f docker-compose.production.yml up --build
```

Cluster mode enables:

- Redis shared visitor sessions
- Redis distributed project/visitor rate limits
- Redis Streams event queue
- PostgreSQL migrations
- PostgreSQL durable event storage
- ingestion worker
- analytics worker

## Important environment flags

```env
CLUSTER_MODE=true
ENABLE_REDIS_RUNTIME=true
ENABLE_REDIS_EVENT_QUEUE=true
ENABLE_POSTGRES_STORAGE=true
POSTGRES_AUTO_MIGRATE=true
POSTGRES_BOOTSTRAP_FROM_JSON=true
POSTGRES_URL=postgres://avp:password@postgres:5432/avp
REDIS_URL=redis://redis:6379
```

## Why this is different from v19

In v19, `src/adapters/postgres-adapter.js` and `src/adapters/redis-queue-adapter.js` were scaffolds. In v2.0 they are real adapters. The API node can now use Redis for shared runtime state and push events to Redis Streams. The worker saves those events into PostgreSQL.

## Recommended high-load defaults

The earlier 2-second heartbeat is too expensive for high-load publishers. v2.0 changes defaults:

```env
DEFAULT_HEARTBEAT_INTERVAL_MS=20000
DEFAULT_RERENDER_INTERVAL_MS=60000
```

For very busy clients, use stricter server-gate only where needed and keep observe-only/soft-gate for low-value pages.

## Production note

This is still a commercial beta foundation. Before selling to serious high-load publishers, add:

- external managed PostgreSQL backups
- managed Redis persistence/monitoring
- CDN for SDK delivery
- WAF/reverse proxy
- full browser test matrix with real ad slots
- legal Privacy/DPA/retention pages
- incident response process
