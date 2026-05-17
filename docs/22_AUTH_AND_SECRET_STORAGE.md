# Auth and encrypted secrets

## Admin auth

v1.6 uses PBKDF2-SHA256 for new and upgraded admin password records.
Older v15 SHA256 records still work once; after successful login the record is upgraded to PBKDF2.

State-changing admin actions use CSRF tokens:

- logout
- create project
- update project
- manual backup

## Required production environment values

Set strong random values before public deployment:

```env
ADMIN_PASSWORD=long-unique-password
SESSION_SECRET=64-random-characters-minimum
ENCRYPTION_KEY=64-random-characters-minimum
```

## Project secrets

Project `secretKey` values are now stored as AES-256-GCM encrypted strings in the JSON state file:

```json
"secretKeyEnc": "enc:v1:..."
```

The dashboard can still show the decrypted secret to the owner because the backend needs to display it for client integration. Do not expose this value to frontend code.

## Key rotation warning

If `ENCRYPTION_KEY` changes after secrets have been created, old encrypted secrets cannot be decrypted. Before rotating the key, export or reissue client project secrets.
