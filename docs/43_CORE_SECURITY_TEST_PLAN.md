# Core security test plan — ordered checklist

This document is the practical checklist for testing the core AdProof protection chain. The plan is intentionally split into two layers:

- **Automated coverage**: stable checks that can be run with `npm test`, `npm run test:requested`, or Playwright.
- **Manual / semi-automated coverage**: scenarios that need a real browser extension, proxy, DevTools manipulation, or a real mobile blocker.

## 1. Normal scenario

Automated:
- SDK is delivered by project public key.
- Visitor session is created.
- Challenge is issued.
- Valid signed proof can unlock access server-side.
- Fresh lease becomes active after proof.
- Heartbeat with a visible ad keeps lease valid.
- Admin analytics records the flow.

Manual / Playwright:
- Open `/test-site/article` in a real browser.
- Confirm ad slot is visible.
- Confirm no hard lock appears in the normal case.

## 2. Heartbeat

Automated:
- SDK contains `/api/v1/heartbeat` integration.
- Heartbeat with `status=ok` and `adStatus=visible` keeps lease valid.
- Heartbeat with failed ad status marks session failed.
- Lease status denies access after failed heartbeat.

Manual:
- Block heartbeat endpoint in DevTools/network proxy and confirm hard lock / no new content.

## 3. Lease

Automated:
- Lease is denied before proof/heartbeat.
- Valid proof creates an active lease.
- Failed heartbeat revokes/invalidates lease.
- Lease status denies access after ad-zone mutation failure.

Manual:
- Wait for lease timeout and confirm protected content cannot continue without fresh verification.

## 4. MutationObserver

Automated:
- Generated SDK contains `MutationObserver` markers.
- Generated SDK contains body/documentElement observer markers.
- Failed heartbeat reason can represent mutation/ad-container removal and is recorded.

Playwright / manual:
- Delete ad iframe.
- Delete ad container.
- Delete wrapper.
- Delete sentinel.
- Confirm hard lock and analytics reason.

## 5. Ad zone integrity

Automated:
- SDK contains geometry/visibility checks: `getBoundingClientRect`, `IntersectionObserver`, display, visibility and opacity checks.
- Failed ad visibility heartbeat does not renew lease.

Playwright / manual:
- Set `height:0`.
- Set `width:0`.
- Set `display:none`.
- Set `visibility:hidden`.
- Set `opacity:0`.
- Move ad slot outside the visible layout.
- Confirm hard lock.

## 6. Hard lock

Automated:
- SDK contains `avp-hard-lock` and `data-avp-lock` markers.
- Failed validation leaves backend unlock denied.

Playwright / manual:
- Confirm body replacement / hard lock screen is shown.
- Confirm old page is not readable under the lock screen.
- Confirm deleting the lock screen does not create server-side access.

## 7. Request tampering

Automated:
- Tampered proof/signature is rejected with `signature_invalid`.
- Replay of an already-used proof is rejected with `challenge_missing_or_reused`.
- Project/domain mismatch is rejected from an unapproved origin.
- Secret key is not required in frontend proof flow.

Manual / Charles:
- Change `programLoaded`, `adStatus`, `visitorToken`, `projectKey`, domain/path and signature in a proxy.
- Confirm backend refuses unlock.

## 8. uBlock before load

Manual / extension:
- Enable uBlock or another blocker before page load.
- Open protected page.
- Expected: SDK/API/ad-zone verification cannot complete; hard lock or verification unavailable state appears; protected content is not delivered.

Automated approximation:
- Use hidden slot / failed ad status scenarios and confirm lease denial.

## 9. uBlock after load

Manual / extension:
- Open page normally.
- Let initial verification pass.
- Enable blocker or remove ad zone after unlock.
- Expected: heartbeat/ad integrity fails; lease is not renewed; hard lock appears; next protected content is denied.

Automated approximation:
- Valid proof + heartbeat OK, then failed heartbeat reason `mutation_observer_ad_container_removed` revokes lease.

## 10. AdProof server blocked

Manual / network:
- Keep normal internet working.
- Block only AdProof API/SDK domain.
- Expected: verification unavailable; heartbeat missing; access is not renewed; hard lock / access-required state.

Automated approximation:
- Lease is denied when server does not receive valid heartbeat/proof.

## 11. Protected content is not preloaded

Automated / static:
- Verify server-side unlock endpoint denies access without verified session.
- Verify lease is checked before backend unlock.

Manual:
- View source before verification.
- Confirm full protected content is not present in initial HTML for production mode.

## 12. New page requires verification

Manual / Playwright:
- Pass verification on one protected page.
- Navigate to another protected page.
- Confirm a fresh verification/lease is required.

Automated approximation:
- Token/domain/page context is included in proof and lease checks.

## 13. Analytics

Automated:
- Analytics records proof OK.
- Analytics records replay rejection.
- Analytics records heartbeat/ad-zone failure.
- Admin dashboard shows per-project reason area.

Manual:
- Confirm dashboard shows real event reasons after DevTools/uBlock scenarios.

## 14. Client/project/domain isolation

Automated:
- Wrong origin is rejected with `origin_not_allowed`.
- Events checked in isolated state file are tied to the expected project.
- Duplicate accounts are rejected.

Manual:
- Try to use one public key from another domain.
- Try to open another project by direct URL after login as a different account.

## 15. Mobile

Automated / Playwright:
- Mobile viewport tests exist for marketing and SDK pages.
- SDK contains mobile adaptive markers.

Manual real devices:
- Android browser / Firefox + uBlock.
- iOS Safari content blocker.
- Mobile hard lock screen readability.
- Mobile reload with blocker enabled.

## 16. Combined stress/tamper scenario

Manual / semi-automated:
- Open page normally.
- Pass initial validation.
- Delete ad iframe.
- Tamper heartbeat/proof in proxy.
- Block AdProof API.
- Delete hard lock screen.
- Reinsert old HTML manually.
- Navigate to another protected page.
- Reload with blocker enabled.

Expected:
- Current page returns to hard lock while SDK is alive.
- Lease is not renewed.
- New content is not returned.
- New page requires fresh verification.
- Analytics records the failure chain.

## Current automated coverage summary

Covered by `npm run test:requested`:
- Normal signed proof flow.
- Heartbeat OK / heartbeat failed.
- Lease before proof / after proof / after failed ad-zone state.
- SDK markers for MutationObserver, geometry, visibility, hard lock, rerender and mobile adaptive behavior.
- Tampered proof rejection.
- Replay proof rejection.
- Domain/origin isolation rejection.
- Analytics evidence in the isolated state file.
- Business/auth/billing stubs and admin security smoke checks.

Covered by Playwright UI tests:
- Marketing pages and responsive navigation.
- Admin login/security UI.
- Test-site SDK browser behavior.
- Server-gate demo without exposing secret key.

Not fully automatable without real external tooling:
- Real uBlock extension behavior.
- Real Charles MITM behavior on a user device.
- Real mobile content blocker behavior.
- A motivated user saving already-rendered HTML from their own browser.
