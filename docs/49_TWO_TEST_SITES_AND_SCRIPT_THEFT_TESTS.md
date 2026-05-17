# Two test sites and script-tag theft tests

This build intentionally keeps only two test websites for SDK integration checks.

## Site 1 — allowed customer site

Route:

```text
/test-site/article?projectKey=<publicKey>
```

Open as:

```text
http://localhost:3443/test-site/article?projectKey=<publicKey>
```

Purpose:

- loads the real project SDK;
- creates visitor session;
- renders the ad slot;
- checks visibility, mutation observer, heartbeat and unlock proof;
- sends events to project analytics.

Manual script-tag removal test:

- File: `server.js`
- Function: `testSiteArticlePage(project, url)`
- Search marker:

```text
AVP CUSTOMER SDK TAG
```

Remove/comment the script tag near that marker, restart the server, and the allowed test site should no longer create a visitor token or send SDK events.

## Site 2 — foreign script-tag reuse site

Route:

```text
/foreign-test-site?projectKey=<publicKey>
```

Open allowed-host variant:

```text
http://localhost:3443/foreign-test-site?projectKey=<publicKey>
```

Open foreign-host variant:

```text
http://127.0.0.2:3443/foreign-test-site?projectKey=<publicKey>
```

Purpose:

- intentionally injects another project's SDK script tag;
- verifies that the server refuses to return the real SDK when the page host is not in allowed domains;
- expects a blocked stub and event reason `sdk_domain_not_allowed`.

Manual foreign script-tag removal test:

- File: `server.js`
- Function: `foreignTestSitePage(project, url)`
- Search marker:

```text
FOREIGN INJECTED SDK TAG
```

Remove/comment the generated `injectedSnippet`, restart the server, and the foreign page should no longer call the SDK endpoint.

## Launcher

The launcher is not a third test site. It is only a menu:

```text
/test-site
```

## Playwright coverage

File:

```text
tests/ui/test-site-sdk.spec.js
```

Covered checks:

- launcher exposes only the allowed customer site and foreign script-tag site;
- direct SDK request with a bad Referer returns blocked stub;
- browser opening `127.0.0.2` foreign site receives `sdk_domain_not_allowed`;
- no normal visitor token is created on the foreign host;
- normal allowed article still creates a visitor session and calls `/api/v1/session` and `/api/v1/challenge`.
