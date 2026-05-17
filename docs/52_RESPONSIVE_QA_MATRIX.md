# Responsive QA matrix

## Viewports covered by Playwright

```text
desktop-wide:      1440 × 900
tablet-landscape:  1024 × 768
tablet-portrait:    768 × 1024
phone-large:         390 × 844
phone-small:         360 × 800
```

The responsive smoke test checks:

```text
/
/pricing.html
/register
/login
/test-site
/test-site/article
```

For each viewport it verifies:

```text
main heading is visible
page does not overflow horizontally
test site/article still renders
forms stay inside viewport
portal header stays within content width
```

Run it with all UI tests:

```bash
npm run test:ui
```

Run visibly:

```bash
npm run test:ui:headed
```

## Manual responsive checklist

After `npm start`, open Chrome DevTools and check:

```text
360 × 800 phone
390 × 844 phone
768 × 1024 tablet portrait
1024 × 768 tablet landscape
1366 × 900 desktop
```

Key pages:

```text
http://localhost:3443/
http://localhost:3443/pricing.html
http://localhost:3443/register
http://localhost:3443/login
http://localhost:3443/account
http://localhost:3443/test-site
http://localhost:3443/test-site/article
http://127.0.0.2:3443/foreign-test-site
```

Watch for:

```text
horizontal scroll
broken cards
hidden buttons
modal too tall
SDK snippet overflowing
project cards wider than screen
header links escaping container
```
