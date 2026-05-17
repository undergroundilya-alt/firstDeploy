# AVP v2.1 — cluster/high-load runbook

Цель этой версии — не менять защитную сердцевину v10/v20, а убрать узкие места вокруг неё для коммерческой beta-нагрузки.

## Рекомендуемая схема

Cloudflare / CDN / WAF
↓
Nginx / reverse proxy / load balancer
↓
2–3 API instances Node.js
↓
Redis
- visitor sessions
- distributed rate limits
- event stream
↓
1–2 ingestion workers
↓
PostgreSQL
- projects
- events
- daily stats
- audit
- alerts
↓
analytics worker

## Что обязательно для 5–10 тяжёлых клиентов

1. Не запускать high-load beta в одиночном JSON-режиме.
2. Запускать API в cluster mode: `CLUSTER_MODE=true`.
3. Redis обязателен: `ENABLE_REDIS_RUNTIME=true`, `ENABLE_REDIS_EVENT_QUEUE=true`.
4. PostgreSQL обязателен: `ENABLE_POSTGRES_STORAGE=true`.
5. JSON не должен быть источником event analytics: `PERSIST_EVENT_STATS_IN_JSON=false`.
6. SDK отдавать через CDN/Cloudflare или Nginx cache, API endpoints оставлять без кэша.
7. Указать корректный real client IP: за своим reverse proxy включить `TRUST_PROXY=true`.
8. Поднимать лимиты под модель клиента: `API_LIMIT_MAX`, `MAX_EVENTS_PER_PROJECT_PER_MINUTE`, `MAX_SESSIONS_PER_PROJECT_PER_MINUTE`.
9. Worker ingestion должен писать в PostgreSQL батчами: `WORKER_BATCH_SIZE=500`, `POSTGRES_EVENT_BATCH_SIZE=500`.
10. Ежедневно запускать maintenance/retention: `npm run postgres:maintenance`.

## Быстрый запуск compose

```bash
cp .env.production.example .env
# заполнить PUBLIC_BASE_URL, POSTGRES_PASSWORD, ADMIN_EMAIL, ADMIN_PASSWORD, SESSION_SECRET, ENCRYPTION_KEY, METRICS_TOKEN

docker compose -f deploy/docker-compose.production.yml --env-file .env up -d --scale avp-api=2
```

## Нагрузочная проверка под модель 5–10 клиентов

```bash
PROJECT_KEYS=avp_pub_1,avp_pub_2 \
PUBLIC_BASE_URL=https://your-domain.example \
LOAD_CLIENTS=10 \
LOAD_TABS_PER_CLIENT=5 \
LOAD_ACTIVE_SECONDS=300 \
LOAD_CONCURRENCY=30 \
npm run load-test:cluster-model
```

Этот тест не заменяет реальный browser test, но проверяет полный server flow: session, challenge, ad-fragment, bait-hit, proof, events/batch, heartbeat и scheduled_rerender events.

## Важная граница уверенности

Проект готовится как cluster-ready commercial beta. Для уверенного SLA на тяжёлых клиентов нужны реальные замеры на целевой инфраструктуре: CPU/RAM API nodes, Redis memory/latency, PostgreSQL insert rate, worker lag, 429 rate, p95/p99 latency и restore drill.
