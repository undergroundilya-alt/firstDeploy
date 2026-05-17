# Client onboarding checklist

## Before integration

- Confirm customer domain.
- Confirm protected content selector.
- Confirm ad container selector.
- Choose project mode: observe-only, soft-gate or server-gate.
- Generate domain verification token.
- Verify `.well-known/avp-verify.txt`.
- Set plan and quotas.
- Set path allow/deny rules.
- Customize overlay message if needed.

## Integration steps

1. Add the ad container to the page template.
2. Add the protected content selector.
3. Insert the SDK snippet.
4. Open the page without blockers.
5. Confirm `session_created`, `challenge_issued`, `bait_hit`, `proof_ok`, and `content_unlocked` events.
6. Test with the test blocker extension or simulated query parameters.
7. Confirm overlay reason is recorded.
8. If using server-gate, integrate `/api/v1/server/verify` on the customer's backend.

## Go-live checks

- Project status page has no critical warning.
- Domain is verified.
- Metrics endpoint is protected.
- Backup exists and restore drill passes.
- Client has received the privacy note and integration limits.
- First 24 hours are monitored manually.
