# 12. Privacy and data minimization draft

## Principle

Beta should collect only the data needed to measure ad visibility, diagnose blocking scenarios and provide aggregate analytics to the site owner.

## Recommended collected data

- projectId
- event type
- reason code
- timestamp
- page URL, preferably without sensitive query params
- origin/domain
- hashed visitor token
- hashed IP/fingerprint
- user-agent shortened for diagnostics

## Do not collect by default

- full IP logs for long-term storage
- names/emails of website visitors
- form contents
- cookies from customer websites
- personal profile data
- sensitive page data

## Retention for beta

Recommended beta retention:

- raw recent events: 7–30 days
- aggregate counters: longer
- export on request
- deletion on client request

## Client-facing wording

The beta service measures whether the advertising container on a protected page was delivered and visible. The system stores technical diagnostic events and aggregate statistics. It is not designed to identify individual users or track browsing across unrelated websites.
