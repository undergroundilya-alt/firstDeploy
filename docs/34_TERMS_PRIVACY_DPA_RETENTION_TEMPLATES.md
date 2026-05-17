# Legal and privacy templates

This is not legal advice. Use it as a working draft for a lawyer.

## Terms of service — core points

- The product verifies ad visibility and protected content access events.
- The service does not guarantee that every ad blocker, filter, browser extension or network-level blocker can be detected.
- The customer is responsible for lawful use, consent banners, cookie notices and local privacy compliance.
- The customer must not use the service for sensitive profiling, discrimination or covert surveillance.
- The service may apply rate limits, quotas, kill switches and emergency suspension.
- Beta features can change and may have operational limits.

## Privacy notice — data categories

The system is designed for data minimization. It stores:

- project id and project name;
- event type and reason;
- timestamp;
- page URL, trimmed and length-limited;
- domain;
- browser label and short user-agent snippet;
- hashed visitor token;
- hashed IP/fingerprint value;
- technical event details.

Avoid storing:

- raw IP addresses;
- names;
- email addresses of visitors;
- payment card data;
- sensitive personal attributes;
- full browsing profiles.

## DPA points

- Customer acts as controller for its website visitors.
- AVP operator acts as processor for technical verification events.
- Subprocessors must be listed when using hosting, backup, monitoring or email providers.
- Retention should be limited. Suggested beta retention: 90 days for detailed events and longer only for aggregated statistics.
- Security measures: MFA, encrypted secrets, audit logs, rate limits, backup, restore drill, request IDs and metrics protection.

## Retention policy

Suggested starting point:

- detailed NDJSON events: 90 days;
- compressed archives: 90 days unless contract says otherwise;
- local backups: 24–48 backup files;
- audit log: 180 days;
- client exports: manually controlled;
- offboarded project package: per contract.
