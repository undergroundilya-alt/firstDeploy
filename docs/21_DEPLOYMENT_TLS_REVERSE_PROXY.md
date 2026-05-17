# Deployment, public TLS and reverse proxy

The Node app still runs with a local HTTPS certificate for beta/dev convenience.
For public use, terminate real TLS at a reverse proxy and keep Node behind it.

## Recommended beta deployment

1. Create a dedicated Linux user, for example `avp`.
2. Place the project in `/opt/avp`.
3. Copy `.env.example` to `.env` and set strong values:
   - `NODE_ENV=production`
   - `PUBLIC_BASE_URL=https://avp.example.com`
   - `ADMIN_PASSWORD`
   - `SESSION_SECRET`
   - `ENCRYPTION_KEY`
4. Run the Node app locally on `127.0.0.1:3443` or another private port.
5. Put Nginx/Caddy/Traefik in front of it.
6. Use Let's Encrypt or another public CA certificate on the reverse proxy.
7. Monitor `/healthz`, `/readyz`, and `/metrics`.
8. Sync `backups/` off-server.

## Included examples

- `deploy/nginx-avp.conf`
- `deploy/systemd-avp.service`
- `deploy/backup-cron.example`

## Important limitation

This is still a beta JSON-storage version. It is useful for demos, controlled pilots and founder-led beta onboarding, but high-volume production should later move to PostgreSQL or another durable database.
