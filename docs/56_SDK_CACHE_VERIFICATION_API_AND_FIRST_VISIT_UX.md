# SDK cache, Verification API and first-visit UX

## Verification API

Verification API is the server-side judge. The SDK observes the page; the Verification API decides whether the browser proof is trustworthy.

Typical endpoints:

- `/api/visitor/session`
- `/api/visitor/challenge`
- `/api/verify`
- `/api/events`
- `/api/events/batch`
- `/api/unlock`

The server checks:

- project public key
- allowed/verified domain
- Origin / Referer
- visitor session
- short-lived challenge
- signed proof
- timestamp
- nonce/replay state
- rate limits
- suspicious events

## SDK cache model

Use a small boot script and a shared core.

```html
<script src="https://cdn.adproof.com/sdk/v1/avp_pub_xxx.js" async></script>
```

The boot script:

- validates project key
- checks domain eligibility
- loads cached core SDK
- loads short-lived project config
- starts verification

The shared core:

```text
/sdk/v1/avp-core.<hash>.js
```

Recommended cache:

```text
Cache-Control: public, max-age=31536000, immutable
```

Project config:

```text
/api/sdk/config?key=<publicKey>
Cache-Control: public, max-age=60, must-revalidate
```

Challenge/proof:

```text
Cache-Control: no-store
```

## First visit UX

Do not show technical text like “SDK loading” to normal visitors.

Preferred copy:

```text
Preparing protected content…
We’re setting up page verification. This usually takes a moment on the first visit.
```

For debug/test mode only:

```text
First visit detected. Loading AdProof SDK and initializing verification…
```

`localStorage` can be used for UX only, not for security:

```text
avp_sdk_seen:<publicKey>
```

If not present, show first-visit message. After successful initialization, store a timestamp.

Security remains server-side: localStorage can be deleted or forged.
