# Changelog v1.8.0-production-ready-beta

## Added

- production startup guard;
- HTTP mode for Render/reverse proxy via `USE_HTTPS=false`;
- separated `runtime-sessions.json`;
- admin audit logs;
- alert logs;
- TOTP MFA;
- project secret rotation;
- scoped project API keys;
- global/project kill switches;
- SDK versioning and canary percentage;
- stricter CORS and trusted proxy IP handling;
- protected metrics and private docs mode;
- enhanced JSON validation and state corruption quarantine;
- event write queue with dead-letter fallback;
- project-level rate/abuse limits;
- dashboard top domains and browser breakdowns;
- adaptive SDK performance budget;
- restore-drill;
- load-test;
- export/compact NDJSON event utilities;
- PostgreSQL schema and Render deploy scaffolding.

## Preserved from v1.7

- WebCrypto ECDSA proof;
- canvas proof;
- server-side bait hit verification;
- dynamic SDK bootstrap;
- server-gate endpoint;
- restore flow after DOM tamper;
- scheduled rerender;
- heartbeat;
- neutral network ping vs ad resource probe;
- encrypted project secrets;
- PBKDF2 admin password;
- CSRF protection;
- JSON atomic write;
- backup and restore-check;
- NDJSON daily events;
- TLS fingerprint gate files.

## Storage note

The main app still runs without PostgreSQL. PostgreSQL assets are provided as migration target for the next stage.
