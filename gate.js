(function () {
  'use strict';
  window.__GATE_BOOTED__ = true;

  const AD_TIMEOUT = 3_000;
  const SERVER_RERENDER_INTERVAL = 30_000;
  const AD_FADE_MS = 320;
  const WATCHDOG_INTERVAL = 500;
  const RESTORE_THROTTLE = 250;
  const MAX_PERSISTENT_BLOCK_RESTORES = 4;
  const NOISE_MIN = 500;
  const NOISE_MAX = 700;
  const NEUTRAL_CHECK_URL = 'https://www.google.com/favicon.ico';
  const NEUTRAL_CHECK_TIMEOUT = 4000;
  const API_HEADERS = {
    'Content-Type': 'application/json',
    'X-Gate-Request': '1'
  };

  let wallShown = false;
  let keyPair = null;
  let runId = null;
  let mainObserver = null;
  let bodyObserver = null;
  let rerenderTimer = null;
  let watchdogTimer = null;
  let restoreTimer = null;
  let restoreInProgress = false;
  let restoreQueuedReason = null;
  let lastRestoreAt = 0;
  let internalMutation = false;
  let protectedMode = false;
  let persistentBlockCount = 0;

  let asideParent = null;
  let asideNextSibling = null;
  let containerParent = null;
  let containerNextSibling = null;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  function params() { return new URLSearchParams(location.search); }
  function hasParam(name) { return params().has(name); }
  function getParam(name) { return params().get(name); }

  function rnd(prefix) {
    const arr = new Uint32Array(2);
    crypto.getRandomValues(arr);
    return `${prefix}-${arr[0].toString(36)}-${arr[1].toString(36)}`;
  }

  // ── Skeleton loader ──────────────────────────────────────────────────────────
  function showSkeletonInContainer(container) {
    if (!container || !container.isConnected) return;
    const skeletonId = rnd('sk');
    container.innerHTML = `
      <div id="${skeletonId}" style="width:300px;height:250px;border-radius:8px;overflow:hidden;background:#e8e8e8;position:relative;">
        <div style="position:absolute;inset:0;background:linear-gradient(90deg,transparent 0%,rgba(255,255,255,.5) 50%,transparent 100%);animation:skPulse 1.4s infinite;"></div>
        <style>@keyframes skPulse{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}</style>
      </div>
    `;
  }

  // ── Noise / DOM obfuscation ──────────────────────────────────────────────────
  let noiseContainer = null;

  function generateNoise() {
    if (noiseContainer && noiseContainer.isConnected) noiseContainer.remove();
    noiseContainer = document.createElement('div');
    noiseContainer.style.cssText = 'display:none!important;position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;';
    noiseContainer.setAttribute('aria-hidden', 'true');

    const count = NOISE_MIN + Math.floor(Math.random() * (NOISE_MAX - NOISE_MIN));
    const frag = document.createDocumentFragment();
    const tagPool = ['div','span','p','section','article','nav','li','a','em','strong'];
    const prefixes = ['ad','banner','sponsor','promo','creative','slot','pub','media','block','unit','placement','display'];

    for (let i = 0; i < count; i++) {
      const el = document.createElement(tagPool[Math.floor(Math.random() * tagPool.length)]);
      const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
      const arr = new Uint32Array(3);
      crypto.getRandomValues(arr);
      el.id = `${prefix}-${arr[0].toString(36)}-${arr[1].toString(36)}`;
      el.className = [`${prefix}-${arr[2].toString(36)}`, 'adsbygoogle', rnd(prefix)].join(' ');
      el.setAttribute('data-slot', arr[0].toString(36));
      frag.appendChild(el);
    }

    noiseContainer.appendChild(frag);
    document.body.appendChild(noiseContainer);
  }

  // ── Dual network check: uBlock vs bad internet ───────────────────────────────
  // Returns: 'ok' | 'ublock' | 'no_internet'
  async function detectBlockerVsInternet() {
    function tryFetch(url, timeout) {
      return new Promise(resolve => {
        const ctrl = new AbortController();
        const t = setTimeout(() => { ctrl.abort(); resolve(false); }, timeout);
        fetch(url, { method: 'HEAD', mode: 'no-cors', cache: 'no-store', signal: ctrl.signal })
          .then(() => { clearTimeout(t); resolve(true); })
          .catch(() => { clearTimeout(t); resolve(false); });
      });
    }

    const [neutralOk, myOk] = await Promise.all([
      tryFetch(NEUTRAL_CHECK_URL, NEUTRAL_CHECK_TIMEOUT),
      tryFetch('/api/ad-fragment', NEUTRAL_CHECK_TIMEOUT)
    ]);

    if (!neutralOk && !myOk) return 'no_internet';
    if (neutralOk && !myOk) return 'ublock';
    return 'ok';
  }

  function withInternalMutation(fn) {
    internalMutation = true;
    try { return fn(); }
    finally { setTimeout(() => { internalMutation = false; }, 120); }
  }

  async function withInternalMutationAsync(fn) {
    internalMutation = true;
    try { return await fn(); }
    finally { setTimeout(() => { internalMutation = false; }, 120); }
  }

  function isLocalTestAdBlockerEnabled() {
    return document.documentElement.getAttribute('data-local-test-adblocker') === 'enabled';
  }

  function rememberAside(aside) {
    if (!aside || !aside.parentNode) return;
    asideParent = aside.parentNode;
    asideNextSibling = aside.nextSibling;
  }

  function rememberContainer(container) {
    if (!container || !container.parentNode) return;
    containerParent = container.parentNode;
    containerNextSibling = container.nextSibling;
  }

  function ensureAside() {
    const existing = document.querySelector('aside');
    if (existing && existing.isConnected) {
      rememberAside(existing);
      return existing;
    }

    const aside = document.createElement('aside');
    aside.setAttribute('data-gate-aside', '1');
    aside.innerHTML = '<div class="sidebar-label">Реклама</div><div id="ad-container"></div>';

    return withInternalMutation(() => {
      if (asideParent && asideParent.isConnected) {
        const ref = asideNextSibling && asideNextSibling.parentNode === asideParent ? asideNextSibling : null;
        asideParent.insertBefore(aside, ref);
      } else {
        const layout = document.querySelector('.layout') || document.body;
        layout.appendChild(aside);
      }
      rememberAside(aside);
      rememberContainer(aside.querySelector('#ad-container'));
      return aside;
    });
  }

  function ensureAdContainer() {
    const existing = document.getElementById('ad-container');
    if (existing && existing.isConnected) {
      rememberContainer(existing);
      rememberAside(existing.closest('aside'));
      return existing;
    }

    const aside = ensureAside();
    if (!aside) return null;

    const container = document.createElement('div');
    container.id = 'ad-container';

    return withInternalMutation(() => {
      const ref = containerNextSibling && containerNextSibling.parentNode === aside ? containerNextSibling : null;
      aside.insertBefore(container, ref);
      rememberContainer(container);
      rememberAside(aside);
      return container;
    });
  }

  function stopProtection() {
    if (mainObserver) mainObserver.disconnect();
    if (bodyObserver) bodyObserver.disconnect();
    if (rerenderTimer) clearInterval(rerenderTimer);
    if (watchdogTimer) clearInterval(watchdogTimer);
    if (restoreTimer) clearTimeout(restoreTimer);
    mainObserver = null;
    bodyObserver = null;
    rerenderTimer = null;
    watchdogTimer = null;
    restoreTimer = null;
  }

  function showWall() {
    if (wallShown) return;
    wallShown = true;
    stopProtection();

    const content = document.getElementById('content');
    if (content && !protectedMode) content.innerHTML = '';

    document.body.style.overflow = 'hidden';

    const overlay = document.createElement('div');
    overlay.id = 'access-wall';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'background:rgba(10,10,10,.96)',
      'z-index:2147483647', 'display:flex', 'align-items:center', 'justify-content:center',
      'font-family:Georgia,serif', 'pointer-events:all', 'padding:20px',
      'opacity:0', 'transition:opacity .35s ease'
    ].join(';');

    overlay.innerHTML = `
      <div id="access-wall-card" style="background:#fff;max-width:500px;width:100%;border-radius:16px;padding:42px 34px;text-align:center;box-shadow:0 30px 90px rgba(0,0,0,.55);opacity:0;transform:translateY(18px) scale(.97);transition:opacity .35s ease, transform .35s ease">
        <div style="font-size:52px;margin-bottom:18px">🚫</div>
        <h2 style="font-size:1.45rem;line-height:1.35;margin:0 0 14px;color:#111">Вимкніть AdBlocker</h2>
        <p style="font-size:.96rem;line-height:1.65;color:#555;margin:0 0 10px">Рекламний блок не завантажився або блокується тестовим розширенням.</p>
        <p style="font-size:.96rem;line-height:1.65;color:#555;margin:0 0 24px">Вимкніть AdBlock/uBlock або тестове розширення для цього сайту й оновіть сторінку.</p>
        <div style="background:#f7f7f7;border-radius:10px;padding:16px;margin-bottom:24px;text-align:left;font-size:.86rem;color:#333;line-height:1.8">
          <strong>Що зробити:</strong><br>
          1. Вимкніть блокувальник реклами або тестове розширення<br>
          2. Оновіть сторінку<br>
          3. Якщо проблема лишилась — відкрийте сайт у чистому профілі браузера
        </div>
        <button id="gate-reload" style="width:100%;border:0;border-radius:10px;background:#111;color:#fff;padding:15px 22px;font:1rem Georgia,serif;cursor:pointer">Я вимкнув — оновити</button>
      </div>
    `;

    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      const card = overlay.querySelector('#access-wall-card');
      if (card) {
        card.style.opacity = '1';
        card.style.transform = 'translateY(0) scale(1)';
      }
    });

    overlay.querySelector('#gate-reload').addEventListener('click', () => location.reload());

    const wallGuard = new MutationObserver(() => {
      if (!document.getElementById('access-wall')) document.body.appendChild(overlay);
      document.body.style.overflow = 'hidden';
    });
    wallGuard.observe(document.body, { childList: true });
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const s = getComputedStyle(el);
    if (s.display === 'none') return false;
    if (s.visibility === 'hidden') return false;
    if (parseFloat(s.opacity || '1') < 0.1) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 20) return false;
    if (r.bottom <= 0 || r.top >= window.innerHeight) return false;
    if (r.right <= 0 || r.left >= window.innerWidth) return false;
    return true;
  }

  function adElement() {
    const container = document.getElementById('ad-container');
    if (!container || !container.isConnected) return null;
    return container.querySelector('[data-gate-ad="1"]');
  }

  function adMissingOrHidden() {
    const ad = adElement();
    return !ad || !isVisible(ad);
  }

  function intersectionRatio(el, timeout = 1200) {
    return new Promise(resolve => {
      if (!('IntersectionObserver' in window)) {
        resolve(isVisible(el) ? 1 : 0);
        return;
      }

      let finished = false;
      let observer;
      const done = value => {
        if (finished) return;
        finished = true;
        if (observer) observer.disconnect();
        resolve(value);
      };

      observer = new IntersectionObserver(entries => {
        const entry = entries[0];
        if (!entry) return done(0);
        done(entry.isIntersecting ? entry.intersectionRatio : 0);
      }, { threshold: [0, 0.25, 0.5, 0.75, 1] });

      observer.observe(el);
      setTimeout(() => done(isVisible(el) ? 1 : 0), timeout);
    });
  }

  async function sha256hex(str) {
    const data = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function canvasProof(nonce) {
    const r = parseInt(nonce.slice(0, 2), 16);
    const g = parseInt(nonce.slice(2, 4), 16);
    const b = parseInt(nonce.slice(4, 6), 16);

    const canvas = document.createElement('canvas');
    canvas.width = 10;
    canvas.height = 10;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, 10, 10);

    const pixels = Array.from(ctx.getImageData(0, 0, 10, 10).data).join(',');
    return sha256hex(pixels + nonce);
  }

  function canonicalPayload(payload) {
    const out = {};
    Object.keys(payload).sort().forEach(key => { out[key] = payload[key]; });
    return JSON.stringify(out);
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  async function createSessionKey() {
    keyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign', 'verify']
    );
    return crypto.subtle.exportKey('jwk', keyPair.publicKey);
  }

  async function signPayload(payload) {
    if (!keyPair || !keyPair.privateKey) throw new Error('missing_private_key');
    const data = new TextEncoder().encode(canonicalPayload(payload));
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      keyPair.privateKey,
      data
    );
    return arrayBufferToBase64(signature);
  }

  function loadScript(src, timeout = 1500) {
    return new Promise(resolve => {
      const s = document.createElement('script');
      let done = false;
      const finish = ok => {
        if (done) return;
        done = true;
        s.remove();
        resolve(ok);
      };
      s.async = true;
      s.src = src;
      s.onload = () => finish(true);
      s.onerror = () => finish(false);
      setTimeout(() => finish(false), timeout);
      document.head.appendChild(s);
    });
  }

  async function networkBaitOk(challenge) {
    window.__gateBaitNetworkLoaded = 0;

    const q = `slotId=${encodeURIComponent(challenge.slotId)}&baitToken=${encodeURIComponent(challenge.baitToken)}&nonce=${encodeURIComponent(challenge.nonce)}&rnd=${Date.now()}`;
    const urls = [
      `/ads/banner.js?client=ca-pub-test&${q}`,
      `/pagead/js/adsbygoogle.js?client=ca-pub-test&${q}`,
      `/advertisement/creative.js?ad_slot=300x250&${q}`
    ];

    const results = await Promise.all(urls.map(url => loadScript(url)));
    return results.filter(Boolean).length >= 2 && window.__gateBaitNetworkLoaded >= 2;
  }

  function createInitialAdSlot(container, challenge) {
    if (!container || !container.isConnected) throw new Error('ad_container_missing');

    return withInternalMutation(() => {
      container.innerHTML = '';
      const ad = document.createElement('ins');

      // Рекламные маркеры оставлены специально: AdBlock/uBlock должны иметь, что блокировать.
      ad.id = `${challenge.slotId}-${rnd('creative')}`;
      ad.className = [
        'adsbygoogle', 'adsbox', 'ad', 'ad-banner', 'banner-ad',
        'advertisement', 'sponsor', 'text-ad', 'pub_300x250',
        rnd('creative'), rnd('placement')
      ].join(' ');

      ad.setAttribute('data-gate-ad', '1');
      ad.setAttribute('data-slot-id', challenge.slotId);
      ad.setAttribute('data-ad-client', 'ca-pub-0000000000000000');
      ad.setAttribute('data-ad-slot', challenge.slotId);
      ad.setAttribute('data-ad-format', 'rectangle');
      ad.setAttribute('aria-label', 'Advertisement');

      ad.style.cssText = [
        'display:flex', 'width:300px', 'height:250px', 'min-width:300px', 'min-height:250px',
        'background:linear-gradient(135deg,#4a90d9,#6ab4f5)',
        'border-radius:8px', 'align-items:center', 'justify-content:center', 'flex-direction:column',
        'gap:8px', 'box-shadow:0 4px 20px rgba(74,144,217,.3)', 'text-decoration:none',
        'overflow:hidden', 'position:relative'
      ].join(';');

      ad.innerHTML = `
        <span style="font-size:.7rem;color:rgba(255,255,255,.72);letter-spacing:2px;text-transform:uppercase">Advertisement</span>
        <span style="font-size:1rem;color:#fff;font-weight:bold">Ad slot</span>
        <span style="font-size:.75rem;color:rgba(255,255,255,.7)">300 × 250</span>
      `;

      container.appendChild(ad);
      return ad;
    });
  }

  async function createAndVerifyInitialAd(container, challenge) {
    const ad = createInitialAdSlot(container, challenge);
    await nextPaint();

    const [netOk, ratio] = await Promise.all([
      networkBaitOk(challenge),
      intersectionRatio(ad)
    ]);

    const domVisible = isVisible(ad) && ratio >= 0.5;
    return { ad, netOk, ratio, domVisible };
  }

  async function initGate() {
    runId = rnd('run');
    const publicKeyJwk = await createSessionKey();

    const res = await fetch('/api/init', {
      method: 'POST',
      headers: API_HEADERS,
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({ runId, publicKeyJwk })
    });

    const data = await res.json();
    if (!data.success || !data.challenge) throw new Error(data.reason || 'init_failed');
    return data.challenge;
  }

  async function signedContentOk(challenge, check) {
    const payload = {
      runId,
      kind: 'content',
      seq: challenge.seq,
      nonce: challenge.nonce,
      slotId: challenge.slotId,
      poolToken: challenge.poolToken,
      proof: await canvasProof(challenge.nonce),
      visibleRatioScaled: Math.round(check.ratio * 1000),
      baitNetworkOk: check.netOk,
      baitDomVisible: check.domVisible
    };

    const signature = await signPayload(payload);
    const res = await fetch('/api/ad-ok', {
      method: 'POST',
      headers: API_HEADERS,
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({ payload, signature })
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.reason || 'ad_ok_failed');
    return data;
  }

  async function fetchAdFragment(reason) {
    const res = await fetch('/api/ad-fragment', {
      method: 'POST',
      headers: API_HEADERS,
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({ reason: String(reason || 'restore').slice(0, 60) })
    });

    const data = await res.json();
    if (!data.success || !data.adHtml) throw new Error(data.reason || 'ad_fragment_failed');
    return data.adHtml;
  }

  function htmlToElement(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '').trim();
    const el = template.content.firstElementChild;
    if (!el) throw new Error('empty_ad_html');
    return el;
  }

  async function replaceAdHtml(adHtml) {
    const container = ensureAdContainer();
    if (!container) throw new Error('ad_container_missing');

    await withInternalMutationAsync(async () => {
      const nextAd = htmlToElement(adHtml);
      const oldChildren = Array.from(container.children);
      const hasOldVisual = oldChildren.length > 0;
      const originalNextStyle = nextAd.getAttribute('style') || '';

      if (!container.style.position) container.style.position = 'relative';
      if (!container.style.width) container.style.width = '300px';
      if (!container.style.minHeight) container.style.minHeight = '250px';

      oldChildren.forEach((node, index) => {
        node.setAttribute('data-gate-old-ad', '1');
        node.style.transition = `opacity ${AD_FADE_MS}ms ease`;
        node.style.opacity = node.style.opacity || '1';
        node.style.zIndex = String(index + 1);
        if (!node.style.position) node.style.position = 'relative';
      });

      const transitionStyle = hasOldVisual
        ? [
            originalNextStyle,
            'position:absolute', 'left:0', 'top:0', 'right:0', 'bottom:0',
            'z-index:50', 'opacity:0', 'transform:translateY(6px) scale(.985)',
            `transition:opacity ${AD_FADE_MS}ms ease, transform ${AD_FADE_MS}ms ease`
          ].join(';')
        : [
            originalNextStyle,
            'opacity:0', 'transform:translateY(6px) scale(.985)',
            `transition:opacity ${AD_FADE_MS}ms ease, transform ${AD_FADE_MS}ms ease`
          ].join(';');

      nextAd.setAttribute('data-gate-new-ad', '1');
      nextAd.style.cssText = transitionStyle;
      container.appendChild(nextAd);

      await nextPaint();
      nextAd.style.opacity = '1';
      nextAd.style.transform = 'translateY(0) scale(1)';
      oldChildren.forEach(node => { if (node.isConnected) node.style.opacity = '0'; });

      await sleep(AD_FADE_MS + 80);
      oldChildren.forEach(node => { if (node.isConnected) node.remove(); });

      if (nextAd.isConnected) {
        nextAd.removeAttribute('data-gate-new-ad');
        nextAd.style.cssText = originalNextStyle;
      }

      rememberContainer(container);
      rememberAside(container.closest('aside'));
    });
  }

  async function restoreAdStructure(reason) {
    if (wallShown || !protectedMode) return;

    restoreQueuedReason = reason || restoreQueuedReason || 'mutation';

    if (restoreInProgress) return;

    const wait = Math.max(0, RESTORE_THROTTLE - (Date.now() - lastRestoreAt));
    if (wait > 0) {
      if (!restoreTimer) {
        restoreTimer = setTimeout(() => {
          restoreTimer = null;
          restoreAdStructure(restoreQueuedReason || 'throttled');
        }, wait);
      }
      return;
    }

    const currentReason = restoreQueuedReason || reason || 'rerender';
    restoreQueuedReason = null;
    restoreInProgress = true;
    lastRestoreAt = Date.now();

    try {
      ensureAside();
      ensureAdContainer();

      const adHtml = await fetchAdFragment(currentReason);
      await replaceAdHtml(adHtml);
      // Обновляем шум при каждом ререндере
      generateNoise();
      await nextPaint();

      if (adMissingOrHidden()) {
        if (isLocalTestAdBlockerEnabled()) {
          showWall();
          return;
        }

        persistentBlockCount += 1;
        setTimeout(() => restoreAdStructure('still_missing_or_hidden'), 700);
      } else {
        persistentBlockCount = 0;
      }
    } catch (err) {
      if (isLocalTestAdBlockerEnabled()) {
        showWall();
        return;
      }
      setTimeout(() => restoreAdStructure('rerender_retry'), 900);
    } finally {
      restoreInProgress = false;
    }
  }

  function mutationTouchesProtectedArea(mutation) {
    const aside = document.querySelector('aside');
    const container = document.getElementById('ad-container');
    const ad = adElement();
    const target = mutation.target;

    if (!aside || !container) return true;
    if (target === aside || target === container) return true;
    if (aside.contains(target) || container.contains(target)) return true;
    if (ad && (target === ad || ad.contains(target))) return true;

    for (const node of mutation.addedNodes || []) {
      if (node.nodeType !== 1) continue;
      if (node === aside || node === container) return true;
      if (node.querySelector && (node.querySelector('aside') || node.querySelector('#ad-container') || node.querySelector('[data-gate-ad="1"]'))) return true;
    }

    for (const node of mutation.removedNodes || []) {
      if (node.nodeType !== 1) continue;
      if (node === aside || node === container) return true;
      if (node.querySelector && (node.querySelector('aside') || node.querySelector('#ad-container') || node.querySelector('[data-gate-ad="1"]'))) return true;
      if (node.matches && (node.matches('aside') || node.matches('#ad-container') || node.matches('[data-gate-ad="1"]'))) return true;
    }

    return false;
  }

  function armPostContentObservers() {
    if (mainObserver) mainObserver.disconnect();
    if (bodyObserver) bodyObserver.disconnect();

    ensureAside();
    const container = ensureAdContainer();
    if (!container) return restoreAdStructure('missing_container_on_arm');

    mainObserver = new MutationObserver(mutations => {
      if (internalMutation || wallShown || restoreInProgress) return;
      if (mutations.length) restoreAdStructure('ad_dom_mutation');
    });

    mainObserver.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
      attributeOldValue: false,
      characterDataOldValue: false
    });

    bodyObserver = new MutationObserver(mutations => {
      if (internalMutation || wallShown || restoreInProgress) return;
      if (mutations.some(mutationTouchesProtectedArea)) restoreAdStructure('protected_area_mutation');
    });

    bodyObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
      attributeOldValue: false,
      characterDataOldValue: false
    });
  }

  function startPostContentProtection() {
    protectedMode = true;
    armPostContentObservers();

    rerenderTimer = setInterval(() => {
      if (wallShown || document.visibilityState !== 'visible') return;
      restoreAdStructure('timer_30s_server_rerender');
    }, SERVER_RERENDER_INTERVAL);

    watchdogTimer = setInterval(() => {
      if (wallShown || document.visibilityState !== 'visible') return;
      if (!adMissingOrHidden()) return;
      if (isLocalTestAdBlockerEnabled()) return showWall();
      restoreAdStructure('watchdog_missing_or_hidden');
    }, WATCHDOG_INTERVAL);
  }

  function scheduleLocalTamperSimulation() {
    const mode = getParam('simulateTamper');
    if (!mode) return;

    setTimeout(() => {
      if (mode === 'aside') {
        const aside = document.querySelector('aside');
        if (aside) aside.remove();
        return;
      }

      if (mode === 'container') {
        const container = document.getElementById('ad-container');
        if (container) container.remove();
        return;
      }

      const ad = adElement();
      if (!ad) return;
      if (mode === 'remove') ad.remove();
      else if (mode === 'hide') ad.style.setProperty('display', 'none', 'important');
      else if (mode === 'class') ad.className = 'changed-by-test-script';
      else if (mode === 'html') ad.innerHTML = '<strong>changed by test script</strong>';
      else ad.remove();
    }, 1800);
  }

  window.addEventListener('DOMContentLoaded', async () => {
    const container = ensureAdContainer();
    if (!container) return showWall();
    rememberContainer(container);
    rememberAside(container.closest('aside'));

    // Сразу показываем skeleton пока идёт проверка
    showSkeletonInContainer(container);
    // Генерируем мусорные элементы для запутывания автоматизации
    generateNoise();

    const started = Date.now();

    try {
      if (hasParam('simulateAdBlock')) {
        await sleep(AD_TIMEOUT);
        return showWall();
      }

      // Двойная проверка: uBlock vs плохой интернет
      const networkStatus = await detectBlockerVsInternet();
      if (networkStatus === 'ublock') {
        const elapsed = Date.now() - started;
        await sleep(Math.max(0, AD_TIMEOUT - elapsed));
        return showWall();
      }
      // 'no_internet' — молчим, не мешаем пользователю
      // 'ok' — продолжаем

      const challenge = await initGate();
      const check = await createAndVerifyInitialAd(container, challenge);

      if (!check.netOk || !check.domVisible || check.ratio < 0.5) {
        const elapsed = Date.now() - started;
        await sleep(Math.max(0, AD_TIMEOUT - elapsed));
        return showWall();
      }

      const data = await signedContentOk(challenge, check);
      if (!data.html || !data.adHtml) throw new Error('content_failed');

      document.getElementById('content').innerHTML = data.html;
      await replaceAdHtml(data.adHtml);

      // Обновляем шум после успешной загрузки
      generateNoise();

      startPostContentProtection();
      scheduleLocalTamperSimulation();
    } catch (err) {
      const elapsed = Date.now() - started;
      await sleep(Math.max(0, AD_TIMEOUT - elapsed));
      showWall();
    }
  });
})();
