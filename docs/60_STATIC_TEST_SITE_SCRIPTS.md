# Static customer tag + dynamic boot test scripts

The customer-facing script tag stays static and predictable:

```html
<script src="https://app.adproof.com/sdk/v1/<publicKey>.js" async data-project-key="<publicKey>"></script>
```

That is the tag a real publisher should paste into a website.

For manual QA, the two built-in test sites default to a dynamic boot URL again:

```text
/sdk/v1/<publicKey>/boot-xxxx.js
```

This means the test sites cover the dynamic bootstrap/chunk flow, while real customer integration still has a stable static tag.

## Startup logs

When `npm start` runs, the server prints both tags:

```text
[beta] Customer SDK tag stays static: /sdk/v1/<publicKey>.js
[beta] Test pages default to dynamic boot: /sdk/v1/<publicKey>/boot-xxxx.js
[beta] Test launcher: http://localhost:3443/test-site
[beta] Site A allowed host: http://localhost:3443/test-site/article?projectKey=<publicKey>&sdkMode=boot
[beta] Site B foreign host: http://127.0.0.2:3443/foreign-test-site?projectKey=<publicKey>&sdkMode=boot
[beta] Debug script map: http://localhost:3443/debug/test-site-scripts
[beta] Project testFirst (avp_pub_xxx)
[beta]   Customer stable tag: <script src="http://localhost:3443/sdk/v1/avp_pub_xxx.js" async data-project-key="avp_pub_xxx"></script>
[beta]   Test boot tag example: <script src="http://localhost:3443/sdk/v1/avp_pub_xxx/boot-xxxx.js" async data-project-key="avp_pub_xxx" data-sdk-mode="boot"></script>
```

## Debug endpoint

Open this in local/staging:

```text
http://localhost:3443/debug/test-site-scripts
```

It returns, per project:

```text
customerStableScriptTag
testBootScriptTagExample
siteAAllowedUrl
siteAAllowedStableUrl
siteBForeignUrl
siteBForeignStableUrl
allowedDomains
```

The endpoint is disabled in production.

## Manual cross-test logic

Two projects are easiest for the full test:

```text
Project A allowed domains: localhost
Project B allowed domains: 127.0.0.2
```

Expected behavior:

```text
Site A + Project A script = pass
Site A + Project B script = block
Site B + Project B script = pass
Site B + Project A script = block
```

Default boot-mode URLs:

```text
Site A: http://localhost:3443/test-site/article?projectKey=<publicKey>&sdkMode=boot
Site B: http://127.0.0.2:3443/foreign-test-site?projectKey=<publicKey>&sdkMode=boot
```

Stable-tag URLs:

```text
Site A: http://localhost:3443/test-site/article?projectKey=<publicKey>&sdkMode=stable
Site B: http://127.0.0.2:3443/foreign-test-site?projectKey=<publicKey>&sdkMode=stable
```

## Where to edit manually

Both test pages are generated from `server.js`.

Allowed customer site:

```text
testSiteArticlePage(project, url)
AVP CUSTOMER SDK TAG
```

Foreign script-reuse site:

```text
foreignTestSitePage(project, url)
FOREIGN INJECTED SDK TAG
```

Remove or replace the script tag in these sections when you want to simulate missing integration, stolen integration, or swapped project keys.
