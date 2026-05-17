# JMeter and high-load testing runbook

## What can be tested locally

A local laptop can test correctness and small traffic:

- health checks;
- SDK delivery;
- session/challenge/proof endpoint shape;
- event ingestion;
- basic rate-limit behavior;
- dashboard visibility after events.

It cannot honestly prove large production capacity.

## What needs real infrastructure

For serious load testing you need a real target stack:

- VPS or staging server;
- PostgreSQL reachable from that server;
- Redis if cluster/runtime mode is enabled;
- reverse proxy/CDN/TLS config close to production;
- monitoring for CPU, memory, DB connections, Redis latency, request latency and error rate.

## JMeter plan included

A starter JMeter plan is included here:

```text
load-tests/jmeter/adproof-api-smoke.jmx
```

It is intentionally light. It hits:

- `/health`;
- `/readyz`;
- `/test-site`;
- `/sdk/v1/${PROJECT_KEY}.js`;
- `/api/v1/session`.

## Suggested stages

1. 10 users for 2 minutes — smoke.
2. 50 users for 5 minutes — first bottlenecks.
3. 200 users for 10 minutes — staging capacity.
4. 1000+ users only on real infrastructure with Redis/Postgres monitoring.

Do not run a huge test against localhost and treat it as production capacity. It mostly tests your laptop.
