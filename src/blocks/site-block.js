'use strict';

const publicSitePages = [
  '/', '/product.html', '/ai.html', '/security.html', '/pricing.html', '/docs.html', '/blog.html', '/about.html', '/support.html'
];

const testSiteRoutes = [
  '/test-site',
  '/test-site/article',
  '/foreign-test-site'
];

const responsiveViewports = [
  { name: 'desktop-wide', width: 1440, height: 900 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'phone-large', width: 390, height: 844 },
  { name: 'phone-small', width: 360, height: 800 }
];

module.exports = { publicSitePages, testSiteRoutes, responsiveViewports };
