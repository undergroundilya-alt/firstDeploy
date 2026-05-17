# Monitoring and backup

## Health endpoints

- `/healthz` — process is alive and returns version, env and uptime.
- `/readyz` — checks that the data file path and backup directory are available.
- `/metrics` — Prometheus-style text metrics.

Example metrics:

```text
avp_up 1
avp_projects 1
avp_visits_total 25
avp_overlay_total 4
avp_unlocked_total 21
avp_server_verify_ok_total 12
```

## Local backups

The app creates local JSON backups automatically every 6 hours by default.

Environment variables:

```env
BACKUP_DIR=./backups
BACKUP_INTERVAL_MS=21600000
BACKUP_RETENTION=24
```

The dashboard also has a manual “Create backup now” button.

## Off-server backup

Local backup is not enough for production. Use rsync, object storage, a backup server or snapshot policy to copy `backups/` away from the app server.
