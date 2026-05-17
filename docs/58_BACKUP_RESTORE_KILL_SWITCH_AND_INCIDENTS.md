# Backup, restore, kill switch and incidents

## Backups

Minimum production policy:

- daily Postgres backup
- weekly restore test on staging
- retention: 7 / 30 / 90 days depending on plan
- backup status recorded in `avp_backup_restore_checks`

## Restore test

A backup is only useful if it can be restored.

Weekly drill:

1. restore latest backup to staging
2. run migrations
3. run smoke tests
4. verify login/project/analytics screens
5. record result in `avp_backup_restore_checks`

## Kill switch

Fast rollback controls:

- project kill switch
- domain disable
- strict-mode disable
- overlay disable
- SDK version rollback
- experimental feature flag disable

Tables/fields:

- `avp_projects.kill_switch`
- `avp_feature_flags`
- `avp_kill_switch_events`
- `avp_sdk_versions`

## Incident response

Use `avp_incidents` and `avp_status_events` for operational history.

Incident statuses:

- investigating
- identified
- monitoring
- resolved

Severity:

- minor
- major
- critical

## Principle

If a new SDK behavior breaks a client site, disable the feature flag or rollback SDK version before debugging deeply.
