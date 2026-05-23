# AdProof manual two-site SDK test

This build keeps the existing `/test-site` and `/foreign-test-site` routes, but adds a clearer manual demo for cross-domain script-tag reuse.

## What changed

- New launcher: `/manual-test`
- New visual pages:
  - `/manual-test/site-a` — should be opened as `localhost`
  - `/manual-test/site-b` — should be opened as `127.0.0.2`
- In development mode the server automatically creates two local projects:
  - `Manual Test Site A — localhost only`, allowed domains: `localhost`
  - `Manual Test Site B — 127.0.0.2 only`, allowed domains: `127.0.0.2`
- The matrix verifies four combinations:
  - Site A + Project A = PASS
  - Site A + Project B = BLOCK
  - Site B + Project B = PASS
  - Site B + Project A = BLOCK
- Stable customer tags are used for manual testing: `/sdk/v1/<publicKey>.js`
- The stable customer SDK response is `no-store` and checks the page `Referer`, then loads a dynamic boot script. This avoids a cached allowed SDK hiding a domain-guard failure.
- Local self-signed HTTPS certificates now include `127.0.0.2` in SAN.

## Recommended local launch

For the simplest manual browser testing, use HTTP:

```bash
USE_HTTPS=false PUBLIC_BASE_URL=http://localhost:3443 ENABLE_POSTGRES_STORAGE=false ENABLE_APP_DB=false npm start
```

PowerShell:

```powershell
$env:USE_HTTPS="false"
$env:PUBLIC_BASE_URL="http://localhost:3443"
$env:ENABLE_POSTGRES_STORAGE="false"
$env:ENABLE_APP_DB="false"
npm start
```

Then open:

```text
http://localhost:3443/manual-test
```

## HTTPS launch

The normal `npm start` still works with local HTTPS:

```bash
npm start
```

Open:

```text
https://localhost:3443/manual-test
```

If the browser complains about the local self-signed certificate on `127.0.0.2`, open the `127.0.0.2` URL once and accept the local certificate for testing.

## Main checks

1. Open `/manual-test`.
2. Run the four matrix buttons.
3. PASS rows should create a visitor token and unlock content after ad visibility verification.
4. BLOCK rows should show `sdk_domain_not_allowed` and should not deliver the real SDK.
5. Open `/admin` and check recent events/reasons.
6. On a PASS page, open DevTools, delete `#ad-slot`, and verify that heartbeat/MutationObserver reacts with restore or lock behavior.

## Debug map

Open:

```text
/debug/test-site-scripts
```

It lists all project keys, stable customer tags, boot examples, and manual Site A/Site B URLs.
