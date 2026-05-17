# AVP v2.1 — cluster-ready commercial beta

This package keeps the protective core from the previous version and adds a stronger high-load deployment layer around it.

## Core preserved

- Server-side verification with WebCrypto proof
- Canvas proof
- TLS fingerprint gate files preserved
- Neutral probe vs likely blocker distinction
- MutationObserver restoration
- Scheduled server rerender
- DOM obfuscation/noise
- Skeleton loader
- Heartbeat
- Dynamic SDK URL / polymorphic wrapper settings
- Signed event batching

## High-load beta additions

- PostgreSQL migrations fixed to create the real `avp_*` tables used by the adapter
- Redis required for cluster runtime sessions/rate limits/event stream
- PostgreSQL required for durable project config, events, daily stats, audit and alerts
- JSON reduced to config/bootstrap/dead-letter snapshot in cluster mode
- Batched PostgreSQL inserts for event ingestion
- Dashboard analytics sync from PostgreSQL
- Nginx/CDN-ready SDK delivery
- Production compose topology for multiple API instances
- Maintenance and load-test scripts

## Main production-like command

```bash
cp .env.production.example .env
# edit secrets and PUBLIC_BASE_URL

docker compose -f deploy/docker-compose.production.yml --env-file .env up -d --scale avp-api=2
```

## Validate code syntax

```bash
npm run check
```

## Test model for 5–10 clients

```bash
PROJECT_KEYS=avp_pub_1,avp_pub_2 PUBLIC_BASE_URL=https://your-domain.example LOAD_CLIENTS=10 LOAD_TABS_PER_CLIENT=5 LOAD_ACTIVE_SECONDS=300 npm run load-test:cluster-model
```
