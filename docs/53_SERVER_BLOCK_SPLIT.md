# Server logic split: site, cabinet, emails

The old `server.js` was kept as the main executable entry point, but the code is now being split into block modules so future changes can be isolated safely.

## Current block files

```text
src/blocks/email-service.js
src/blocks/client-portal-block.js
src/blocks/site-block.js
```

## Emails

`src/blocks/email-service.js` owns:

```text
SMTP transport options
HTML email body rendering
outbox status updates
sent / failed / local fallback states
```

`server.js` calls it through:

```text
sendAppEmail(...)
```

This keeps registration, reset password and future unsubscribe/cancel emails on the same delivery path.

## Cabinet / client portal

`src/blocks/client-portal-block.js` owns:

```text
portal responsive CSS
client portal block map
account/cabinet UI responsive guard
```

`server.js` injects the responsive CSS into `appShell()`.

## Site / test sites

`src/blocks/site-block.js` owns:

```text
public marketing page list
two-site SDK test routes
responsive viewport matrix
```

Playwright uses this file for responsive tests so the UI matrix stays in one place.

## Next safe split

The next 2–3 safe extractions should be:

```text
src/blocks/client-portal-routes.js
src/blocks/public-site-routes.js
src/blocks/sdk-test-sites.js
```

Do this gradually. After each extraction run:

```bash
npm run ci:local
npm run test:ui
```

Do not split the security/session/proof logic and UI routes in the same commit. Keep one concern per commit.
