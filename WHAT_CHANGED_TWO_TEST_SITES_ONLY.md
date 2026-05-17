# What changed — two test sites only

- Removed `/customer-test-site` as a separate duplicate route.
- Removed duplicate foreign aliases `/test-site/foreign` and `/test-site/foreign-script`.
- Kept only:
  - `/test-site/article` — allowed customer test site;
  - `/foreign-test-site` — foreign script-tag reuse site.
- `/test-site` remains only as a launcher/menu, not as a separate test website.
- Added clear markers in `server.js` so the SDK script tag can be removed manually:
  - `AVP CUSTOMER SDK TAG`
  - `FOREIGN INJECTED SDK TAG`
- Updated Playwright UI checks and documentation.
