# Domain ownership, privacy and retention

## Domain ownership verification

Do not permanently trust manually typed allowed domains.

Supported future methods:

1. DNS TXT

```text
adproof-verification=<token>
```

2. Well-known file

```text
https://example.com/.well-known/adproof-verification.txt
```

3. Meta tag

```html
<meta name="adproof-verification" content="<token>">
```

Tables:

- `avp_project_domains`
- `avp_domain_verification_tokens`

Statuses:

- pending
- verified
- failed
- blocked

## Privacy and retention

Before production clients, prepare:

- Terms of Service
- Privacy Policy
- Acceptable Use Policy
- Data Processing Addendum template
- Data retention policy
- Cookie/tracking explanation

Suggested defaults:

```text
Raw events: 30-90 days
Hourly/daily aggregates: 12-24 months
Support tickets: as needed
Deleted accounts: delete or anonymize
```

Tables:

- `avp_data_retention_policies`
- `avp_audit_log`
- `avp_user_complaints`
