# SLA, incident runbook and security review

## Beta SLA posture

For commercial beta, avoid promising enterprise SLA. Suggested wording:

- monitored best-effort beta;
- emergency kill switch available;
- incident response during agreed support hours;
- no guarantee against all browser extensions or network blockers;
- transparent reporting of verification failures and service downtime.

## Incident runbook

1. Check `/healthz` and `/readyz`.
2. Check `/metrics?token=...`.
3. Open Security center alerts.
4. Check disk usage on persistent storage.
5. Check recent 429/500 alerts.
6. If event queue is overflowing, reduce SDK event volume or switch noisy projects to observe-only.
7. If false blocking happens, enable project kill switch or global kill switch.
8. Create backup before manual state edits.
9. Run restore drill after recovery.
10. Write an incident note: start time, impact, cause, fix, prevention.

## Security review checklist

- MFA enabled for owner/admin.
- No demo credentials in production.
- Secrets are not exposed in frontend.
- Secret rotation tested.
- Metrics endpoint requires token.
- Docs private in production.
- Domain verification enabled.
- CSP present.
- Request IDs present.
- Production errors do not leak stack traces.
- Backups encrypted or stored in a protected external location.
- Audit log reviewed.
- Rate limits tested.
- Offboarding export/delete tested.

## Penetration test scope

- Admin login and CSRF.
- Role enforcement.
- Project domain isolation.
- Event forgery and signed events.
- Replay attempts against challenges.
- Secret leakage.
- XSS in project names, domains, page URLs and dashboard filters.
- Rate-limit bypass.
- Backup and export exposure.
