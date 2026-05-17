# Support, complaints and admin panel

## Why this matters

AdProof can affect access to protected content. If a publisher integrates it incorrectly or a visitor is blocked unexpectedly, the product needs an operational feedback loop.

## Public/support endpoints to build

- `/support`
- `/report-issue`
- `/report-adproof`
- `/unsubscribe`

## Complaint categories

- page blocked incorrectly
- overlay never disappears
- ad slot not visible
- privacy concern
- unsubscribe issue
- billing issue
- publisher abuse or wrong implementation
- security/report vulnerability

## Database tables

- `avp_support_tickets`
- `avp_abuse_reports`
- `avp_user_complaints`

## Admin panel should show

- ticket list
- project/domain/page context
- visitor/session hash
- user agent
- timestamp
- related raw events
- status: new / reviewing / resolved
- internal notes

## Operational rule

Every user complaint should be traceable to a project, domain, page, event timeline and account when possible.
