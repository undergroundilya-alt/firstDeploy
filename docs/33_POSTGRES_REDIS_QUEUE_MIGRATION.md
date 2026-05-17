# PostgreSQL, Redis and queue migration plan

The current v1.9 package is suitable for a controlled commercial beta on one instance with persistent storage. For hundreds of customers or multiple instances, use this migration plan.

## PostgreSQL

Use `db/migrations/001_init.sql` as the starting schema. Core tables:

- `tenants`
- `companies`
- `projects`
- `project_secrets`
- `events`
- `usage_counters`

Why PostgreSQL is needed:

- transaction safety;
- indexed analytics queries;
- tenant isolation;
- billing-grade usage counters;
- concurrent writes;
- multi-process compatibility.

## Redis / KeyDB

Move these runtime pieces out of Node memory:

- admin sessions;
- visitor sessions;
- rate-limit buckets;
- event ingestion queue;
- proof attempt counters.

The scaffold file is `src/adapters/redis-queue-adapter.js`.

## Ingestion worker

`scripts/worker-ingestion.js` currently tails NDJSON files and keeps checkpoints. In the real P2 version, replace `processLine()` with:

- publish to Redis Streams/SQS/RabbitMQ; or
- insert into PostgreSQL; or
- both.

## Analytics worker

`scripts/analytics-aggregate.js` produces aggregate JSON from NDJSON logs. In P2, this becomes a scheduled worker that writes pre-aggregated rows into PostgreSQL.

## Deployment split

Recommended P2 services:

- `api`: sessions, proof, server-gate, dashboard API;
- `collector`: high-volume event ingestion;
- `worker-ingestion`: queue consumer;
- `worker-analytics`: aggregation jobs;
- `admin`: dashboard UI;
- `postgres`: durable DB;
- `redis`: sessions, rate limits, queue.
