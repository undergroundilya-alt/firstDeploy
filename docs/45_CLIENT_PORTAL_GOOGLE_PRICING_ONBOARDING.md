# Client portal, Google login, pricing and onboarding update

This build adds the next MVP layer for testing the full AdProof flow with real client accounts.

## Added

- Public client pages:
  - `/register`
  - `/login`
  - `/account`
  - `/logout`
- Google login route:
  - `/auth/google/start`
  - `/auth/google/callback`
- Safe not-configured state when Google credentials are missing.
- Registration success popup.
- Login success popup.
- Local email outbox for registration confirmation simulation:
  - `storage/email-outbox.json`
- First-login onboarding block after registration.
- Client dashboard with:
  - account status
  - overlay analytics controls
  - standard / percent view
  - day / week / month / all-time period selector
  - small trend chart
  - project cards with gradient labels
- Project creation form with:
  - project name
  - website URL/domain without protocol
  - ad slot selector
  - element-to-lock selector
  - selector tutorial text
  - project color/gradient
- Pricing page update:
  - Get access — 1 month Beta Trial
  - Classic $50/mo
  - 25,000 hard-lock / overlay impressions included
  - custom usage after included volume
- Billing remains intentionally deferred until the product is validated by at least one company.

## Google OAuth setup

Set these environment variables:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
PUBLIC_BASE_URL=https://your-domain.example
```

Add this redirect URI in Google Cloud Console:

```text
https://your-domain.example/auth/google/callback
```

For local testing:

```text
http://localhost:3443/auth/google/callback
```

If credentials are not configured, `/auth/google/start` returns a safe not-configured response for API tests and a friendly page for browser users.

## Email sending

SMTP is now supported for registration and password-reset emails. Configure SMTP variables in `.env`, Render Environment, or another secret store. Every email attempt is still written to the local delivery/debug log:

```text
storage/email-outbox.json
```

Useful statuses: `sent`, `smtp_failed`, `smtp_failed_missing_dependency`, `smtp_not_configured`, `local_outbox_only`.

Minimal example:

```env
SMTP_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM="AdProof <your-email@gmail.com>"
```

## Billing status

Billing is intentionally not connected in this build. Use status fields for testing:

- `trial_active`
- `payment_required`
- `active`
- `past_due`
- `expired`

