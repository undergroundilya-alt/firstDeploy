# V17 JSON storage hardening

Version 1.7 keeps the beta SaaS on local JSON storage, but removes the most dangerous weaknesses of a simple JSON-state prototype.

## What changed

1. Atomic state writes
- `server.js` no longer writes `data/saas-state.json` directly.
- State is written to a temporary file first.
- The temporary file is flushed with `fsync` and then moved into place with `rename`.
- This lowers the chance of a corrupted JSON state file after a crash or power loss.

2. Append-only event log
- Every recorded event is also appended to `data/events/events-YYYY-MM-DD.ndjson`.
- The dashboard still keeps only recent events in memory and in the JSON state.
- The NDJSON log becomes the durable event history for beta analytics and later import into PostgreSQL.

3. Daily event rotation
- Event logs rotate automatically by UTC day.
- File format: `events-2026-05-05.ndjson`.
- Old logs are cleaned according to `EVENT_LOG_RETENTION_DAYS`.

4. Restore-check validation
- Backups are validated after creation.
- `npm run restore-check` validates the current state, latest backups and latest event logs.
- The server refuses to silently trust malformed state files.

5. Limited in-memory event history
- `globalEvents` is now only a recent-events cache.
- Default global recent limit: `MAX_GLOBAL_RECENT_EVENTS=1000`.
- Default per-project recent limit: `MAX_RECENT_PROJECT_EVENTS=300`.
- Full historical events should be read from NDJSON logs or later from a real database.

## New environment variables

```env
EVENT_LOG_DIR=./data/events
EVENT_LOG_RETENTION_DAYS=90
MAX_GLOBAL_RECENT_EVENTS=1000
MAX_RECENT_PROJECT_EVENTS=300
```

## Operational commands

```bash
npm run check
npm run restore-check
npm start
```

## Honest limitation

This is still not a replacement for PostgreSQL. It is a safer beta storage layer for 1-5 pilots, demos and early validation. For high load, many clients, billing, legal-grade reporting or multi-server deployment, use a real database.
