# Domain verification and offboarding

## Domain verification

Production origin checks now require two layers:

1. The domain must be listed in the project allowed domains.
2. In production, the domain must also be verified unless `domainVerification.requiredInProduction=false` is deliberately set.

Recommended process:

1. Open the project in the admin dashboard.
2. In Domain verification, enter the customer's domain and generate a token.
3. Ask the customer to create this file:

```text
https://customer-domain.example/.well-known/avp-verify.txt
```

4. The file must contain the generated token, for example:

```text
avp-domain-verification=verify_xxxxxxxxx
```

5. Click verify in the dashboard.
6. Open Project status and confirm the verified domain appears.

## Offboarding

Before deleting a project:

1. Export CSV if the client needs a spreadsheet.
2. Export JSON if you need a complete local evidence package.
3. Save the JSON export outside the app server if the client has a retention requirement.
4. In the project page, type `DELETE` in the offboarding form.

The delete flow removes:

- the project config;
- project statistics;
- active visitor sessions for that project.

It also saves a local offboarding export in the backup directory before deletion.
