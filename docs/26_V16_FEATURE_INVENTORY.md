# v1.6 feature inventory

## Compared with basic bait-element tools

Basic tools usually do only two things:

1. detect a missing bait element;
2. show an overlay.

v1.6 is broader: it combines server verification, browser proof, ad fragment rendering, dashboard analytics, dynamic SDK delivery, restore logic, heartbeat, monitoring and beta SaaS onboarding material.

## Core protection flow

1. Browser creates an ECDSA WebCrypto session key.
2. Server creates a one-time challenge with nonce, slot id, sequence and pool token.
3. Browser renders the server ad fragment.
4. Bait pixel/script confirms the server saw the ad resource request.
5. Browser calculates canvas proof.
6. Browser signs the canonical payload.
7. Server verifies signature, challenge, canvas hash, visibility ratio and bait hit.
8. Content unlock is recorded.
9. Client backend may call server-to-server verify before releasing protected content.

## Runtime layers

- WebCrypto proof.
- Canvas proof.
- TLS fingerprint proxy: optional `npm run start:tls-gated` mode reads ClientHello/JA3-like fingerprint before proxying to the SaaS backend.
- Neutral connectivity vs ad resource probe.
- MutationObserver restore without immediate overlay for normal DOM tampering.
- Scheduled server rerender every 30 seconds.
- DOM noise pool with 500–700 generated elements.
- Skeleton/loader experience.
- Heartbeat for frozen/offline-like state.
- Dynamic SDK bootstrap and per-load dynamic SDK build.
- Polymorphic wrapper marker and per-response random build noise.

## SaaS layers

- Admin dashboard.
- Companies and projects.
- Public key / encrypted secret key.
- Allowed domains.
- Events and reasons.
- CSV export.
- Server-to-server verify endpoint.
- Health/readiness/metrics endpoints.
- Local backup.
- Deployment and privacy/legal docs.
