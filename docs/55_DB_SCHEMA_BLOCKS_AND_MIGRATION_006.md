# Database schema blocks and migration 006

Migration `db/migrations/006_architecture_foundation_19_points.sql` is an additive architecture migration. It does not remove or rename existing tables. It creates the table groups needed by the 19-point architecture plan.

## Table groups added or completed

### Auth / consent

- `avp_marketing_consents`
- `avp_email_unsubscribes`

### Projects

- `avp_project_members`
- `avp_project_domains`
- `avp_project_settings`
- `avp_domain_verification_tokens`

### Analytics

- `avp_hourly_stats`
- `avp_page_sessions`
- `avp_page_stats`

### Billing

- `avp_plan_limits`
- `avp_subscriptions`
- `avp_usage_daily`
- `avp_invoices`
- `avp_revenue_share_reports`

### Support

- `avp_support_tickets`
- `avp_abuse_reports`
- `avp_user_complaints`

### System

- `avp_api_keys`
- `avp_webhook_deliveries`
- `avp_feature_flags`
- `avp_kill_switch_events`
- `avp_sdk_versions`
- `avp_data_retention_policies`
- `avp_incidents`
- `avp_status_events`
- `avp_backup_restore_checks`

## How to apply

```bash
npm run db:migrate
```

## Why this is safe

The migration uses `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS` and safe seed inserts with `ON CONFLICT DO NOTHING` for default plan limits.

## How to verify locally

```bash
npm run architecture:audit
npm run check
npm test
```
