# Real browser testing and real ad slot integration

## Real browser matrix

Test at least:

- Chrome desktop;
- Firefox desktop;
- Edge desktop;
- Safari desktop if the customer has iOS/macOS traffic;
- Chrome Android;
- Samsung Internet Android;
- Safari iOS.

Test states:

- clean browser;
- common ad blocker enabled;
- network-level DNS blocking;
- slow network;
- hidden tab and return to tab;
- DOM tampering through DevTools;
- SPA navigation if the customer uses React/Vue/Next.

## Real ad slot integration

The demo ad container is not a production ad server. For real customers:

- coordinate with the customer's ad stack;
- avoid breaking ad network policies;
- do not fake ad impressions;
- keep the verification layer separate from ad serving contracts;
- document whether the service checks visibility of a placeholder, wrapper, or real creative container;
- prefer server-gate for protected content.

## Browser farm

The archive does not include a paid browser farm. Recommended future integrations:

- Playwright test suite;
- BrowserStack/Sauce Labs/LambdaTest;
- scheduled smoke tests after deployment;
- real ad slot test page per customer.
