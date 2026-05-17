(() => {
  'use strict';

  const SELECTORS = [
    '[data-gate-ad="1"]',
    '.adsbygoogle',
    '.adsbox',
    '.ad-banner',
    '.banner-ad',
    '.advertisement',
    '.sponsor',
    '.text-ad',
    '.pub_300x250',
    '[data-ad-client]',
    '[data-ad-slot]',
    '[aria-label="Advertisement"]'
  ];

  const STYLE_ID = 'local-test-adblocker-style';
  const DEFAULTS = { enabled: false, mode: 'hybrid' };

  let settings = { ...DEFAULTS };
  let observer = null;
  let busy = false;
  let interval = null;

  const storage = (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local)
    ? chrome.storage.local
    : null;

  function markEnabled() {
    document.documentElement.setAttribute('data-local-test-adblocker', 'enabled');
    document.documentElement.setAttribute('data-local-test-adblocker-mode', settings.mode || DEFAULTS.mode);
  }

  function unmarkEnabled() {
    document.documentElement.removeAttribute('data-local-test-adblocker');
    document.documentElement.removeAttribute('data-local-test-adblocker-mode');
  }

  function getSettings() {
    return new Promise(resolve => {
      if (!storage) return resolve({ ...DEFAULTS });
      storage.get(DEFAULTS, value => resolve({ ...DEFAULTS, ...(value || {}) }));
    });
  }

  function removeBlockingCss() {
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();
  }

  function injectBlockingCss() {
    if (!settings.enabled) return;
    if (settings.mode !== 'hide' && settings.mode !== 'hybrid') return;
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `${SELECTORS.join(',')} { display: none !important; visibility: hidden !important; opacity: 0 !important; }`;
    document.documentElement.appendChild(style);
  }

  function matchingElements() {
    const list = [];
    for (const selector of SELECTORS) {
      try { list.push(...document.querySelectorAll(selector)); }
      catch {}
    }
    return Array.from(new Set(list)).filter(el => el && el.isConnected);
  }

  function act() {
    if (!settings.enabled || busy) return;
    busy = true;

    try {
      injectBlockingCss();
      const elements = matchingElements();

      for (const el of elements) {
        if (settings.mode === 'remove' || settings.mode === 'hybrid') {
          el.remove();
          continue;
        }

        if (settings.mode === 'hide') {
          el.style.setProperty('display', 'none', 'important');
          el.style.setProperty('visibility', 'hidden', 'important');
          el.style.setProperty('opacity', '0', 'important');
          continue;
        }

        if (settings.mode === 'mutate') {
          el.className = 'blocked-by-local-test-adblocker';
          el.removeAttribute('data-gate-ad');
          el.removeAttribute('data-ad-client');
          el.removeAttribute('data-ad-slot');
          el.removeAttribute('aria-label');
          el.innerHTML = '';
        }
      }
    } finally {
      setTimeout(() => { busy = false; }, 60);
    }
  }

  function startObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => act());
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'data-gate-ad', 'data-ad-client', 'data-ad-slot', 'aria-label']
    });

    clearInterval(interval);
    interval = setInterval(act, 800);
  }

  function stopObserver() {
    if (observer) observer.disconnect();
    observer = null;
    clearInterval(interval);
    interval = null;
    removeBlockingCss();
    unmarkEnabled();
  }

  async function applySettings(nextSettings) {
    settings = { ...DEFAULTS, ...(nextSettings || {}) };

    if (!settings.enabled) {
      stopObserver();
      return;
    }

    markEnabled();
    if (settings.mode !== 'hide' && settings.mode !== 'hybrid') removeBlockingCss();
    startObserver();
    setTimeout(act, 100);
    setTimeout(act, 700);
    setTimeout(act, 1600);
  }

  getSettings().then(applySettings);

  if (storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      const next = { ...settings };
      if (changes.enabled) next.enabled = changes.enabled.newValue;
      if (changes.mode) next.mode = changes.mode.newValue;
      applySettings(next);
    });
  }

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || message.type !== 'LOCAL_TEST_ADBLOCKER_APPLY') return;
      applySettings(message.settings).then(() => sendResponse({ ok: true }));
      return true;
    });
  }
})();
