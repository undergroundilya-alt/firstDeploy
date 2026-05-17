# Staging mock analytics

Mock analytics must be created only against a staging/local database, not production.

Recommended flow:

```bash
npm install
npm run db:migrate
npm run stage:seed
npm start
```

`npm run stage:seed` defaults to:

- `APP_ENV=staging`
- `ALLOW_MOCK_DATA=true`
- `SEED_DAYS=90`

The product UI should then use the existing database rows and filter them by period:

- Today
- Week
- Month
- All time

Do not reseed separately for each period. One 90-day seed is enough for the frontend/backend analytics filters.

Production safety:

- `scripts/seed-postgres-analytics.js` refuses to run when `APP_ENV=production` or `NODE_ENV=production` unless `ALLOW_PRODUCTION_MOCK_SEED=true` is deliberately set.
- Keep `ALLOW_PRODUCTION_MOCK_SEED=false` in production.
- Use a separate Render/Postgres database for staging.
