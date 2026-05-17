# v1.6 hardened beta changelog

This release keeps the project as a strong beta foundation, not a final production SaaS.
PostgreSQL was intentionally not added.

## Added in v1.6

- PBKDF2-SHA256 admin password hashing with legacy v15 hash compatibility.
- Admin CSRF tokens for state-changing dashboard POST actions.
- AES-256-GCM encryption at rest for project secret keys in the JSON state file.
- Manual and automatic local backups of the JSON state file.
- `/healthz`, `/readyz`, and `/metrics` endpoints for monitoring.
- `npm run start:tls-gated` launch mode for the main SaaS behind TLS fingerprint proxy.
- Dynamic SDK bootstrap URL: the visible install snippet points to a boot file which loads a fresh dynamic SDK build.
- Default DOM noise adjusted to the requested 500–700 range.
- Deployment examples for public TLS behind Nginx and a systemd service.
- Privacy/legal templates and operational documentation.

## Preserved from v15/v10

- Server-side WebCrypto proof verification.
- Canvas proof.
- Bait pixel/script server observation.
- uBlock vs connection issue split check.
- MutationObserver restore flow.
- Server ad fragment refresh every 30 seconds.
- DOM noise generation on every render/refresh.
- Skeleton/loader experience.
- Heartbeat layer.
- Dashboard, project keys, events, CSV export and server-to-server verify API.
- Legacy v10 original files.
