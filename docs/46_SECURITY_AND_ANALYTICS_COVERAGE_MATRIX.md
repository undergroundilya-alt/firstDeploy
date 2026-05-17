# AdProof — full security and analytics coverage matrix

This file is a practical checklist for manual checks, Playwright checks and API checks. It is intentionally written as a product QA map: every feature must have a visible test-site scenario, an API assertion or both.

## 1. Core product protections

| Area | What exists in product | Manual place to test | Automated coverage |
|---|---|---|---|
| Allowed domains | SDK delivery checks Referer; API checks Origin/CORS | `/foreign-test-site` | `npm run test:security` |
| Foreign script reuse | Wrong host gets blocked SDK stub, not real SDK | `/foreign-test-site` using localhost vs 127.0.0.2 | `npm run test:security`, `npm run test:ui` |
| Public/secret keys | Public SDK key in frontend; secret key only for backend verify examples | Admin project page, test-site server-gate | `npm run test:requested` |
| Visitor session | Server creates visitor token and stores session state | `/test-site/article` | `npm run test:security` |
| One-time challenge | Challenge includes nonce, seq, slotId, poolToken, bait token | API flow | `npm run test:requested`, `npm run test:security` |
| Signed proof | Edited/forged proof payload is rejected | API flow | `npm run test:security` |
| Canvas/bait proof | Server expects canvas proof and bait hit before unlock | API flow | `npm run test:requested` |
| Lease status | Protected content remains denied until proof/heartbeat is valid | `/test-site/backend-unlock` | `npm run test:security` |
| Heartbeat | Periodic heartbeat keeps lease fresh; failed heartbeat creates reason | Normal/hidden ad slot scenario | `npm run test:security`, `npm run test:ui` |
| Mutation observer | Removed/hidden ad container triggers restore or overlay | `case=remove-after-unlock`, `case=hide-slot` | `npm run test:ui`, `npm run test:security` SDK marker audit |
| Visibility checks | IntersectionObserver + geometry + display/visibility/opacity | normal + hidden slot | `npm run test:ui`, `npm run test:security` |
| Scheduled rerender | Ad fragment is rerendered periodically with fresh markup | normal scenario | `npm run test:security` SDK marker audit |
| Hard lock / overlay | If ad is hidden/blocked, overlay appears and event reason is saved | simulated adblock, hidden slot | `npm run test:ui` |
| Connection issue split | Neutral/network failure can be marked as connection issue, not adblock | `simulateConnectionIssue=1` | `npm run test:ui` |
| Rate limits | API, visitor events, sessions and project events are rate-limited | API/load scripts | `scripts/load-test.js`, JMeter plan |
| Quotas | Plan limits are enforced at project/account level | account/project pages | `npm run test:client` |

## 2. SaaS/account checks

| Area | What exists | Manual test | Automated coverage |
|---|---|---|---|
| Google OAuth account | Google account is stored as client account | `/login` → Google | debug: `/debug/auth-accounts` |
| Email/password signup | Full name, company, phone, email, password | `/register` | `npm run test:client` |
| Marketing consent | Checkbox writes consent to DB/logical fallback | `/register` | `npm run test:client` |
| SMTP reset | Reset token + email delivery log | `/reset-password` + `/debug/email-outbox` | `npm run test:client` |
| Profile dropdown | Header uses current account name dynamically | public pages after login | `npm run test:ui` |
| Project persistence | Projects are restored from Postgres for same account | `/account` | `npm run test:client` |
| Project cards | Your projects display as cards with SDK snippet + Analytics | `/account` | `npm run test:client` |
| Email unsubscribe / offboarding backend | Backend keeps cancellation/offboarding logic, but cancellation UI is not exposed on the public/client website | backend route/debug only | `npm run test:client` |

## 3. Analytics checks

| Metric | Meaning | Where shown |
|---|---|---|
| Visits | Page/session visits collected from SDK/API | Account cards, Analytics |
| Unique visitors | Unique visitor session count | Admin/project stats |
| Overlay shown | Overlay/hard-lock events | Account cards, Analytics |
| Rate | Overlay / visits | Account cards, Analytics |
| Events | Total telemetry events | Analytics |
| Unlocks | Content unlocked events | Analytics |
| Domains | Event source domain breakdown | Analytics |
| Hour/day buckets | Today uses hourly buckets; week/month/all use daily buckets | Analytics chart + table |
| Reasons | hidden slot, tamper, heartbeat lost, origin denied, etc. | Admin/project stats |

## 4. Test commands

```bash
npm run security:checks
npm run test:security
npm test
npm run test:ui
```

For a visible browser run:

```bash
npm run test:ui:headed
```

For mock analytics data:

```bash
SEED_CLEAR=true SEED_DAYS=90 npm run seed:analytics
npm start
```

Then open the account project card and switch Analytics between Today / Week / Month / All time. The same seeded dataset is filtered by time; you do not need separate seeds for week/month.
