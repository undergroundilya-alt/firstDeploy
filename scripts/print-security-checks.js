'use strict';

const checks = [
  ['Domain isolation', 'Allowed domains, Referer SDK guard, Origin/CORS guard, foreign script stub'],
  ['Project identity', 'Public key for SDK, secret key only for server-to-server verification'],
  ['Session gate', 'Visitor token, one-time challenge, lease status, backend unlock check'],
  ['Proof integrity', 'WebCrypto signature, canvas proof, nonce/seq/slot/poolToken, bait hit'],
  ['Visibility verification', 'IntersectionObserver, getBoundingClientRect, display/visibility/opacity checks'],
  ['Anti-tamper', 'MutationObserver on ad slot and body/document, restore or overlay event'],
  ['Heartbeat', 'Periodic heartbeat, lease refresh, heartbeat_lost analytics'],
  ['Scheduled rerender', 'Ad fragment rerender with fresh IDs/classes to expose hidden/removed ad states'],
  ['Overlay logic', 'Hard/soft overlay, reason saved to analytics'],
  ['Network classification', 'Connection issue vs probable network filter'],
  ['Event security', 'Signed client events, batch events, visitor and project rate limits'],
  ['Analytics', 'Visits, unique visitors, overlay shown, unlocks, domains, reasons, hourly/daily buckets'],
  ['Client portal', 'Google/email auth, password reset SMTP, marketing consent, project cards'],
  ['Plans/quotas', 'Beta, Classic, Enterprise, monthly/daily/event limits'],
  ['Offboarding', 'Backend cleanup/offboarding retained; website cancellation UI hidden; marketing unsubscribe planned for email footer'],
  ['Operations', 'Postgres migration, Redis runtime option, backup/restore drill, metrics, health/readyz'],
  ['Load testing', 'Node load scripts + JMeter plan template for API traffic on real VPS/DB/Redis']
];

console.log('\nAdProof product checks\n' + '='.repeat(28));
checks.forEach(([title, details], idx) => {
  console.log(`${String(idx + 1).padStart(2, '0')}. ${title}: ${details}`);
});
console.log('\nRun automated coverage: npm run test:security');
console.log('Run full lightweight suite: npm test');
console.log('Run browser UI suite: npm run test:ui');
