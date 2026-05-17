# CI/CD, staging and production guardrails

## Goal

Every change should pass the same safety checks before it reaches staging or production:

1. syntax check
2. secret scan
3. API/backend tests
4. client portal tests
5. security scenario tests
6. Playwright UI/responsive tests

## Local pre-push gate

Install once per clone:

```bash
npm install
npm run setup:hooks
```

After that, every `git push` runs:

```bash
npm run ci:local
```

If this command fails, the push is blocked locally.

For the full browser gate before a serious push:

```bash
npx playwright install chromium
npm run ci:full
```

## GitHub Actions

The archive includes:

```text
.github/workflows/ci.yml
.github/workflows/deploy-staging.yml
.github/workflows/deploy-production.yml
```

`ci.yml` runs on every push and pull request.

`deploy-staging.yml` runs on the `staging` and `develop` branches. It tests first, then triggers the staging deploy hook if `RENDER_STAGING_DEPLOY_HOOK_URL` is configured in GitHub Secrets.

`deploy-production.yml` runs on version tags like `v1.0.0` or manual dispatch. It tests first, then triggers the production deploy hook if `RENDER_PRODUCTION_DEPLOY_HOOK_URL` is configured.

## Required GitHub branch protection

In GitHub repository settings, protect `main` and enable:

```text
Require a pull request before merging
Require status checks to pass before merging
Require branches to be up to date before merging
Required checks:
- Node checks and non-UI tests
- Playwright UI and responsive tests
```

This is the part that makes GitHub refuse bad merges. The workflow alone reports the failure; branch protection enforces it.

## Staging vs production

Use separate Render services and separate databases:

```text
staging app → staging Postgres
production app → production Postgres
```

Never use the same `DATABASE_URL` for both.

Staging can run mock analytics:

```bash
npm run stage:seed
```

Production blocks mock seed by default:

```env
ALLOW_MOCK_DATA=false
ALLOW_PRODUCTION_MOCK_SEED=false
```
