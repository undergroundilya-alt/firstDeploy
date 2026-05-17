# Ad Visibility SaaS Beta v17 — JSON storage hardened

This build keeps the project on local JSON storage, but makes the beta storage layer safer and more useful before PostgreSQL is introduced.

## Main v17 additions

- Atomic JSON state write: temp file -> fsync -> rename.
- Append-only event log: `data/events/events-YYYY-MM-DD.ndjson`.
- Daily log rotation with retention.
- Backup restore-check validation.
- `npm run restore-check` command.
- Bounded recent events in memory and JSON state.
- Dashboard and `/readyz` show the new storage/event-log configuration.

## Why this matters

The JSON file is now treated as current state only, not as the complete analytics archive.

- Current state: `data/saas-state.json`
- Durable beta event history: `data/events/*.ndjson`
- Local backups: `backups/*.json`

This is suitable for closed beta pilots and demos, but it is still not meant for high load, billing-grade analytics, many clients, multi-process Node clusters or multi-server deployments.

## New commands

```bash
npm run check
npm run restore-check
npm start
```

## New env options

```env
EVENT_LOG_DIR=./data/events
EVENT_LOG_RETENTION_DAYS=90
MAX_GLOBAL_RECENT_EVENTS=1000
MAX_RECENT_PROJECT_EVENTS=300
```
