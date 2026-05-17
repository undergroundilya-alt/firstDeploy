# 17. Operations runbook

## Start

```bash
ADMIN_EMAIL="you@example.com" ADMIN_PASSWORD="strong-password" npm start
```

## Reset demo data

```bash
npm run reset-demo
```

## Check syntax

```bash
npm run check
```

## Backup data

```bash
cp data/saas-state.json backups/saas-state-$(date +%F-%H%M).json
```

## Typical beta incident

### Dashboard unavailable

- check process
- check port 3443
- check cert files
- check logs

### SDK not loading on customer site

- check HTTPS URL
- check publicKey
- check allowedDomains
- check browser console
- check CORS response

### Too many overlays

- switch project to observe-only
- check connection issue ratio
- check ad container selector
- check if ad slot is hidden by site CSS
- review recent events

### Secret leaked

- create a new project or rotate secret manually in data file
- invalidate old secret
- notify customer
