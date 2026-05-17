# 14. Architecture overview

## Components

1. SaaS backend `server.js`
2. Admin dashboard `/admin`
3. Project SDK `/sdk/v1/<publicKey>.js`
4. Event ingestion `/api/v1/events`
5. Session API `/api/v1/session`
6. Ad fragment API `/api/v1/ad-fragment`
7. Server-side verification `/api/v1/server/verify`
8. Local storage file `data/saas-state.json`
9. Legacy v10 preserved stack `legacy-v10-original/`

## Flow

1. Client adds SDK snippet.
2. SDK creates visitor session.
3. SDK checks neutral ping and advertising probe.
4. SDK requests ad fragment.
5. SDK confirms visible ad container.
6. SDK unlocks content in soft-gate mode or only records analytics in observe-only mode.
7. Client backend can call server verification in server-gate mode.
8. Dashboard aggregates events.

## Why publicKey and secretKey

- publicKey is safe to expose in frontend.
- secretKey must stay on customer backend only.
- server-gate uses secretKey to avoid trusting frontend-only state.

## Data storage in beta

Data is stored in JSON for simplicity. This is convenient for studying the project, but production should use PostgreSQL or another durable database.
