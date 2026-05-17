# 15. Security model

## What is protected

- admin dashboard access
- project settings
- secret keys
- event ingestion by allowed domain
- content release decision in server-gate mode

## Current beta protections

- HTTPS local certificates
- admin password
- HTTP-only secure admin cookie
- SameSite cookie
- allowed domains per project
- server-side secretKey verification
- basic API/login rate limiting
- basic security headers
- no secretKey in frontend SDK
- hashed visitor/IP diagnostic references

## Not yet production-grade

- no PostgreSQL
- no multi-user roles beyond owner model
- no 2FA
- no encrypted-at-rest secret storage
- no audit log for admin changes
- no queue/batch ingestion
- no WAF/CDN layer
- no external monitoring
- no formal penetration test

## Recommended production hardening

- PostgreSQL + migrations
- argon2/bcrypt for passwords
- separate auth provider or robust session store
- CSRF tokens for all admin POST forms
- encrypted project secrets
- secret rotation
- per-project event rate limits
- signed server-gate requests
- reverse proxy with real TLS
- logs + alerts
- backups
- privacy/data processing documents
