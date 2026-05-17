# Test sites moved to editable templates

## What changed

The two manual SDK test pages are now separated from `server.js` into editable HTML templates:

- `src/test-sites/site-a-article.html`
- `src/test-sites/site-b-foreign.html`

`server.js` still controls routing, project lookup, public keys and SDK tag generation, but the page markup and visible test content can now be edited without digging through a long template string in `server.js`.

## Routes

- Site A / allowed customer site: `/test-site/article?projectKey=<publicKey>&sdkMode=boot`
- Site B / foreign stolen-script test: `/foreign-test-site?projectKey=<publicKey>&sdkMode=boot`

## Markers to search

In Site A template:

- `AVP CUSTOMER SDK TAG`

In Site B template:

- `FOREIGN INJECTED SDK TAG`

These are the exact places where you can remove, replace or inspect the SDK script tag for manual testing.

## Server helpers

`server.js` now renders these templates through:

- `renderTestSiteTemplate()`
- `testSiteArticlePage()`
- `foreignTestSitePage()`

## Expected cross-site matrix

- Site A + Project A key = pass when `localhost` is allowed
- Site A + Project B key = block when `localhost` is not allowed for Project B
- Site B + Project B key = pass when `127.0.0.2` is allowed
- Site B + Project A key = block when `127.0.0.2` is not allowed for Project A
