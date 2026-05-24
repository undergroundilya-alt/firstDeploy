(function(){
  var dbg=function(stage, detail){
    try{
      var t=(performance&&performance.now)?performance.now().toFixed(1)+'ms':'n/a';
      console.log('[adproof-header]', stage, Object.assign({t:t, path:location.pathname, htmlClass:document.documentElement.className}, detail||{}));
    }catch(e){}
  };
  window.__adproofHeaderLog=dbg;
  dbg('boot-script-start', {bodyReady:!!document.body});
  var loader=document.createElement('div');
  var resolved=false;
  var resolveAuth;
  window.__adproofAuthNavReady=new Promise(function(resolve){resolveAuth=resolve;});
  window.__adproofResolveAuthNav=function(reason){
    if(resolved){dbg('auth-ready-duplicate-ignored', {reason:reason||''});return;}
    resolved=true;
    dbg('auth-ready-resolved', {reason:reason||''});
    resolveAuth();
  };
  loader.className='page-loader';
  loader.innerHTML='<div class="page-loader-dot" aria-label="Loading"></div>';
  document.documentElement.classList.add('page-loading');
  document.documentElement.classList.add('auth-preload');
  function insertLoader(){
    if(!document.body){dbg('loader-insert-wait-body');return false;}
    if(!document.querySelector('.page-loader')) document.body.prepend(loader);
    dbg('loader-inserted', {bodyChildren:document.body.children.length});
    return true;
  }
  if(!insertLoader()){
    document.addEventListener('DOMContentLoaded',function(){dbg('domcontentloaded-for-loader');insertLoader();});
  }
  function hideLoader(){
    dbg('hide-loader-scheduled');
    setTimeout(function(){
      dbg('hide-loader-start');
      loader.classList.add('hide');
      document.documentElement.classList.remove('page-loading');
      document.documentElement.classList.remove('auth-preload');
      document.documentElement.classList.add('auth-ready');
      dbg('page-revealed');
      setTimeout(function(){loader.remove();dbg('loader-removed');},360);
    },100);
  }
  window.addEventListener('load',function(){
    dbg('window-load-wait-auth');
    window.__adproofAuthNavReady.then(hideLoader);
  });
  setTimeout(function(){
    if(!resolved) dbg('still-waiting-auth-after-1000ms', {slotText:(document.querySelector('[data-public-auth]')||{}).innerText||''});
  },1000);
  setTimeout(function(){
    if(!resolved) dbg('still-waiting-auth-after-3000ms', {slotText:(document.querySelector('[data-public-auth]')||{}).innerText||''});
  },3000);
})();
(function () {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const headerLog = (stage, detail) => {
    if (typeof window.__adproofHeaderLog === 'function') window.__adproofHeaderLog(stage, detail || {});
    else { try { console.log('[adproof-header]', stage, detail || {}); } catch (_) {} }
  };
  const profileLog = (stage, detail) => {
    try {
      const t = (performance && performance.now) ? performance.now().toFixed(1) + 'ms' : 'n/a';
      console.log('[adproof-profile-mobile]', stage, Object.assign({ t, path: location.pathname, w: window.innerWidth, menuOpen: document.body.classList.contains('menu-open') }, detail || {}));
    } catch (_) {}
  };

  const toast = $('[data-toast]');
  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  function markAuthNavReady(reason) {
    headerLog('mark-auth-nav-ready-called', { reason: reason || '' });
    if (typeof window.__adproofResolveAuthNav === 'function') window.__adproofResolveAuthNav(reason || 'initAuthNav');
  }


  function attachFloatingProfileMenus(root = document) {
    const profiles = $$('.nav-profile', root);
    profiles.forEach(profile => {
      if (profile.dataset.floatingBound === '1') return;
      const trigger = $('.nav-profile-trigger', profile);
      const sourceMenu = $('.nav-profile-menu', profile);
      if (!trigger || !sourceMenu) return;
      profile.dataset.floatingBound = '1';
      profileLog('bind-profile-menu', { triggerText: trigger.textContent || '', sourceText: sourceMenu.textContent || '' });

      // Keep the source menu out of layout. The visible popover is a separate
      // body-level portal, so it can never stretch the header or be clipped by it.
      sourceMenu.setAttribute('aria-hidden', 'true');
      sourceMenu.style.display = 'none';
      sourceMenu.style.visibility = 'hidden';
      sourceMenu.style.pointerEvents = 'none';

      const portal = document.createElement('div');
      portal.className = 'adproof-profile-floating-portal';
      portal.setAttribute('role', 'menu');
      portal.setAttribute('aria-hidden', 'true');
      document.body.appendChild(portal);

      let closeTimer = null;
      let isOpen = false;
      let pointerToggledAt = 0;
      let openedByPointer = false;

      function setImportant(el, prop, value) {
        try { el.style.setProperty(prop, value, 'important'); }
        catch (_) { el.style[prop] = value; }
      }
      function clamp(value, min, max) {
        return Math.max(min, Math.min(value, max));
      }
      function fillPortal() {
        portal.innerHTML = sourceMenu.innerHTML;
        portal.querySelectorAll('a,button').forEach(item => {
          setImportant(item, 'display', 'flex');
          setImportant(item, 'align-items', 'center');
          setImportant(item, 'justify-content', 'flex-start');
          setImportant(item, 'width', '100%');
          setImportant(item, 'min-height', '34px');
          setImportant(item, 'padding', '9px 11px');
          setImportant(item, 'margin', '0');
          setImportant(item, 'border', '0');
          setImportant(item, 'border-radius', '12px');
          setImportant(item, 'background', 'transparent');
          setImportant(item, 'color', '#111');
          setImportant(item, 'font-family', 'Inter, Arial, sans-serif');
          setImportant(item, 'font-size', '13px');
          setImportant(item, 'font-weight', '600');
          setImportant(item, 'line-height', '1.2');
          setImportant(item, 'text-align', 'left');
          setImportant(item, 'text-decoration', 'none');
          setImportant(item, 'box-sizing', 'border-box');
          setImportant(item, 'cursor', 'pointer');
          item.onmouseenter = function(){ setImportant(item, 'background', '#f3efe6'); setImportant(item, 'color', '#111'); };
          item.onmouseleave = function(){ setImportant(item, 'background', 'transparent'); setImportant(item, 'color', '#111'); };
          item.onfocus = function(){ setImportant(item, 'background', '#f3efe6'); setImportant(item, 'color', '#111'); };
          item.onblur = function(){ setImportant(item, 'background', 'transparent'); setImportant(item, 'color', '#111'); };
        });
      }
      function basePortalStyles() {
        const width = Math.min(188, Math.max(164, window.innerWidth - 24));
        setImportant(portal, 'position', 'fixed');
        setImportant(portal, 'z-index', '2147483647');
        setImportant(portal, 'width', Math.round(width) + 'px');
        setImportant(portal, 'max-width', 'calc(100vw - 24px)');
        setImportant(portal, 'min-width', '0');
        setImportant(portal, 'padding', '7px');
        setImportant(portal, 'border-radius', '16px');
        setImportant(portal, 'background', 'rgba(255,255,255,.985)');
        setImportant(portal, 'border', '1px solid rgba(20,20,20,.10)');
        setImportant(portal, 'box-shadow', '0 24px 70px rgba(0,0,0,.18)');
        setImportant(portal, 'box-sizing', 'border-box');
        setImportant(portal, 'overflow', 'hidden');
        setImportant(portal, 'transform', 'none');
        setImportant(portal, 'transition', 'none');
        setImportant(portal, 'animation', 'none');
        setImportant(portal, 'right', 'auto');
        setImportant(portal, 'bottom', 'auto');
        return width;
      }
      function hidePortalStyles() {
        setImportant(portal, 'display', 'none');
        setImportant(portal, 'visibility', 'hidden');
        setImportant(portal, 'opacity', '0');
        setImportant(portal, 'pointer-events', 'none');
      }
      function showPortalStyles() {
        setImportant(portal, 'display', 'block');
        setImportant(portal, 'visibility', 'visible');
        setImportant(portal, 'opacity', '1');
        setImportant(portal, 'pointer-events', 'auto');
      }
      function placePortal(reason) {
        fillPortal();
        const width = basePortalStyles();
        showPortalStyles();
        portal.setAttribute('aria-hidden', 'false');
        const rect = trigger.getBoundingClientRect();
        const gap = 8;
        const height = Math.min(Math.max(portal.offsetHeight || portal.scrollHeight || 120, 120), Math.max(120, window.innerHeight - 24));
        let top = rect.bottom + gap;
        let left = rect.left;
        // Desktop: align to the right edge of Profile. Mobile: keep it close to the tapped row.
        if (window.innerWidth > 820) left = rect.right - width;
        top = clamp(top, 12, Math.max(12, window.innerHeight - height - 12));
        left = clamp(left, 12, Math.max(12, window.innerWidth - width - 12));
        setImportant(portal, 'top', Math.round(top) + 'px');
        setImportant(portal, 'left', Math.round(left) + 'px');
        profileLog('place-portal', {
          reason: reason || '',
          rectLeft: Math.round(rect.left), rectRight: Math.round(rect.right),
          rectTop: Math.round(rect.top), rectBottom: Math.round(rect.bottom),
          top: Math.round(top), left: Math.round(left), width: Math.round(width), height: Math.round(height),
          portalDisplay: portal.style.display, portalZ: portal.style.zIndex
        });
      }
      function openMenu(reason) {
        clearTimeout(closeTimer);
        placePortal(reason || 'open');
        isOpen = true;
        profile.classList.add('profile-floating-active');
        trigger.setAttribute('aria-expanded', 'true');
        profileLog('open-portal', { reason: reason || '', html: portal.innerHTML.replace(/\s+/g, ' ').trim().slice(0, 160) });
      }
      function closeMenuNow(reason) {
        clearTimeout(closeTimer);
        hidePortalStyles();
        portal.setAttribute('aria-hidden', 'true');
        isOpen = false;
        openedByPointer = false;
        profile.classList.remove('profile-floating-active');
        trigger.setAttribute('aria-expanded', 'false');
        profileLog('close-portal', { reason: reason || '' });
      }
      function closeMenuSoon(reason) {
        clearTimeout(closeTimer);
        profileLog('close-portal-soon', { reason: reason || '' });
        closeTimer = setTimeout(() => closeMenuNow(reason || 'timer'), 80);
      }
      function toggleMenu(event, reason) {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }
        profileLog('toggle-portal', { reason: reason || '', isOpen, type: event && event.type, pointerType: event && event.pointerType });
        if (isOpen) closeMenuNow(reason || 'toggle');
        else openMenu(reason || 'toggle');
      }

      trigger.addEventListener('mouseenter', () => {
        if (window.matchMedia('(hover:hover)').matches) openMenu('mouseenter');
      });
      trigger.addEventListener('mouseleave', () => {
        if (!openedByPointer && window.matchMedia('(hover:hover)').matches) closeMenuSoon('mouseleave-trigger');
      });
      trigger.addEventListener('focus', (event) => {
        // Keyboard focus should open the menu, but mouse/touch focus must not
        // open first and then let the following click close it again.
        const suppressFocus = Date.now() - pointerToggledAt < 700;
        profileLog('trigger-focus', { suppressFocus, isOpen });
        if (!suppressFocus) openMenu('focus');
      });
      trigger.addEventListener('pointerdown', (event) => {
        profileLog('trigger-pointerdown', { pointerType: event.pointerType, isPrimary: event.isPrimary, isOpen });
        if (event.isPrimary === false) return;
        // Toggle directly on pointerdown for mouse/touch/pen. This prevents the
        // first click from only focusing Profile and the second click opening it.
        pointerToggledAt = Date.now();
        openedByPointer = true;
        toggleMenu(event, 'pointerdown');
      });
      trigger.addEventListener('click', (event) => {
        const suppress = Date.now() - pointerToggledAt < 900;
        profileLog('trigger-click', { suppress, isOpen });
        if (suppress) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        openedByPointer = true;
        toggleMenu(event, 'click');
      });
      trigger.addEventListener('touchstart', (event) => {
        profileLog('trigger-touchstart', { touches: event.touches ? event.touches.length : 0 });
      }, { passive: true });
      portal.addEventListener('mouseenter', () => clearTimeout(closeTimer));
      portal.addEventListener('mouseleave', () => {
        if (window.matchMedia('(hover:hover)').matches) closeMenuSoon('mouseleave-portal');
      });
      portal.addEventListener('pointerdown', (event) => { event.stopPropagation(); profileLog('portal-pointerdown', { pointerType: event.pointerType }); });
      portal.addEventListener('touchstart', (event) => { event.stopPropagation(); profileLog('portal-touchstart'); }, { passive: true });
      portal.addEventListener('click', (event) => { event.stopPropagation(); profileLog('portal-click', { target: event.target && event.target.textContent ? event.target.textContent.trim() : '' }); });
      portal.addEventListener('focusin', () => openMenu('focusin-portal'));
      portal.addEventListener('focusout', () => closeMenuSoon('focusout-portal'));
      document.addEventListener('pointerdown', (event) => {
        if (trigger.contains(event.target) || portal.contains(event.target)) return;
        closeMenuNow('document-pointerdown');
      }, { capture: true });
      document.addEventListener('click', (event) => {
        if (trigger.contains(event.target) || portal.contains(event.target)) return;
        closeMenuNow('document-click');
      });
      document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenuNow('escape'); });
      window.addEventListener('resize', () => { if (isOpen) placePortal('resize'); });
      window.addEventListener('scroll', () => { if (isOpen) placePortal('scroll'); }, { passive: true });
      window.__adproofCloseProfileMenus = function(){ closeMenuNow('global-close'); };
      hidePortalStyles();
    });
  }

  async function initAuthNav() {
    headerLog('initAuthNav-start');
    const nav = $('[data-nav]');
    if (!nav) { headerLog('initAuthNav-no-nav'); markAuthNavReady('no-nav'); return; }
    let slot = $('[data-public-auth]', nav);
    headerLog('initAuthNav-slot-found', { found: !!slot, initialText: slot ? slot.innerText : '' });
    const oldLoginLink = Array.from(nav.querySelectorAll('a')).find(a => /\/login$/.test(a.getAttribute('href') || ''));
    const oldCta = nav.querySelector('.nav-cta');

    // Backward-compatible migration for cached/static pages that still contain Login/Get access.
    if (!slot) {
      slot = document.createElement('span');
      slot.className = 'public-auth-slot';
      slot.setAttribute('data-public-auth', '');
      if (oldLoginLink) oldLoginLink.replaceWith(slot);
      else nav.appendChild(slot);
      if (oldCta) oldCta.remove();
      headerLog('initAuthNav-migrated-old-links', { slotText: slot.innerText });
    }

    const isLoginActive = !!oldLoginLink && oldLoginLink.classList.contains('active');
    slot.classList.remove('auth-loading');
    slot.classList.remove('auth-ready');

    function renderGuest() {
      headerLog('renderGuest-before', { previousText: slot.innerText });
      slot.innerHTML = `<a href="/login" class="${isLoginActive ? 'active' : ''}">Login</a><a class="nav-cta" href="/register">Get access</a>`;
      headerLog('renderGuest-after', { text: slot.innerText });
    }

    function renderClient() {
      const isHome = location.pathname === '/' || /\/index\.html$/.test(location.pathname);
      const dashboardItem = isHome ? '' : '<a href="/account">Dashboard</a>';
      headerLog('renderClient-before', { previousText: slot.innerText, isHome });
      slot.innerHTML = `<span class="nav-profile"><span class="nav-profile-trigger" tabindex="0">Profile</span><span class="nav-profile-menu">${dashboardItem}<a href="/account/profile">Personal data</a><button type="button" data-public-logout>Logout</button></span></span><a class="nav-cta" href="/account">Dashboard</a>`;
      attachFloatingProfileMenus(slot);
      headerLog('renderClient-after', { text: slot.innerText });
    }

    try {
      headerLog('auth-fetch-start', { url: '/api/client/session' });
      const controller = 'AbortController' in window ? new AbortController() : null;
      const authTimeout = setTimeout(function(){ if (controller) controller.abort(); }, 3500);
      const res = await fetch('/api/client/session', { credentials: 'same-origin', cache: 'no-store', signal: controller ? controller.signal : undefined });
      clearTimeout(authTimeout);
      headerLog('auth-fetch-response', { ok: res.ok, status: res.status });
      const data = res.ok ? await res.json() : null;
      headerLog('auth-fetch-data', { authenticated: !!(data && data.authenticated), hasUser: !!(data && data.user), email: data && data.user && data.user.email ? data.user.email : '' });
      if (data && data.authenticated && data.user) renderClient();
      else renderGuest();
      slot.classList.remove('auth-loading');
      slot.classList.add('auth-ready');
      markAuthNavReady('auth-fetch-complete');

      slot.addEventListener('click', async (event) => {
        const btn = event.target.closest('[data-public-logout]');
        if (!btn) return;
        event.preventDefault();
        const account = await fetch('/account', { credentials: 'same-origin' }).then(r => r.text()).catch(() => '');
        const token = (account.match(/name="csrf" value="([^"]+)"/) || [])[1] || '';
        const form = new URLSearchParams();
        form.set('csrf', token);
        await fetch('/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
        window.location.href = '/login';
      }, { once: false });
    } catch (err) {
      headerLog('auth-fetch-error', { name: err && err.name, message: err && err.message });
      renderGuest();
      slot.classList.remove('auth-loading');
      slot.classList.add('auth-ready');
      markAuthNavReady('auth-fetch-error');
    }
  }

  document.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-public-logout]');
    if (!btn) return;
    event.preventDefault();
    try {
      const account = await fetch('/account', { credentials: 'same-origin' }).then(r => r.text()).catch(() => '');
      const token = (account.match(/name="csrf" value="([^"]+)"/) || [])[1] || '';
      const form = new URLSearchParams();
      form.set('csrf', token);
      await fetch('/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
    } finally {
      window.location.href = '/login';
    }
  });

  function closeAllProfilePortalMenus() {
    $$('.profile-menu-portal-open').forEach(menu => menu.classList.remove('profile-menu-portal-open'));
    $$('.profile-floating-active').forEach(item => item.classList.remove('profile-floating-active'));
  }

  function initMenu() {
    const btn = $('[data-menu-toggle]');
    const nav = $('[data-nav]');
    if (!btn || !nav) return;
    btn.addEventListener('click', () => {
      const wasOpen = document.body.classList.contains('menu-open');
      if (wasOpen) {
        // Hide the full-width mobile menu immediately on close. This avoids the
        // one-frame flash where menu items briefly appear on the right edge.
        document.body.classList.add('menu-closing');
        document.body.classList.remove('menu-open');
        closeAllProfilePortalMenus();
        btn.setAttribute('aria-expanded', 'false');
        requestAnimationFrame(() => requestAnimationFrame(() => {
          document.body.classList.remove('menu-closing');
        }));
        return;
      }
      document.body.classList.remove('menu-closing');
      document.body.classList.add('menu-open');
      btn.setAttribute('aria-expanded', 'true');
    });
    nav.addEventListener('click', (event) => {
      if (event.target.closest('a')) {
        document.body.classList.remove('menu-open');
        closeAllProfilePortalMenus();
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function initReveal() {
    const items = $$('.reveal');
    if (!items.length) return;
    if (!('IntersectionObserver' in window)) {
      items.forEach(el => el.classList.add('visible'));
      return;
    }
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    items.forEach(el => io.observe(el));
  }

  function initCounters() {
    const counters = $$('[data-counter]');
    if (!counters.length) return;
    const run = (el) => {
      const target = Number(el.dataset.counter || 0);
      const suffix = el.dataset.suffix || '';
      const duration = 700;
      const start = performance.now();
      function tick(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(target * eased) + suffix;
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    };
    if (!('IntersectionObserver' in window)) return counters.forEach(run);
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          run(entry.target);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });
    counters.forEach(el => io.observe(el));
  }

  function initHomeDemo() {
    const btn = $('[data-refresh-demo]');
    const adState = $('[data-ad-state]');
    const summary = $('[data-demo-summary]');
    const debugList = $('[data-debug-list]');
    const tabs = $('[data-demo-tabs]');
    if (!btn || !adState || !summary || !debugList || !tabs) return;
    const states = [
      {
        title: 'Ad slot hidden',
        note: 'Reason: container height = 0px',
        ok: false,
        summary: 'Ad container was rendered, but became hidden before the visibility check. Strict verification was triggered for protected content.',
        views: {
          info: [['settings','200','ok'], ['gate.js','200','ok'], ['ad-slot','0px','bad'], ['server-verify','OK','ok'], ['content-unlock','sent','warn']],
          network: [['settings','200','ok'], ['gate.js','200','ok'], ['events','202','ok'], ['verify','200','ok'], ['dashboard','updated','ok']],
          events: [['visit','saved','ok'], ['overlay','saved','warn'], ['reason','hidden','bad'], ['unlock','pending','warn'], ['audit','logged','ok']],
          ai: [['summary','ready','ok'], ['impact','medium','warn'], ['next step','check CSS','ok'], ['owner view','updated','ok'], ['client view','updated','ok']]
        }
      },
      {
        title: 'Ad restored',
        note: 'Reason: slot visible after retry',
        ok: true,
        summary: 'Ad slot became visible after a delayed check. Content was unlocked and a restore event was saved for this page.',
        views: {
          info: [['settings','200','ok'], ['gate.js','200','ok'], ['ad-slot','visible','ok'], ['restore','saved','ok'], ['content-unlock','ok','ok']],
          network: [['settings','200','ok'], ['events','202','ok'], ['retry','done','ok'], ['verify','OK','ok'], ['metrics','updated','ok']],
          events: [['visit','saved','ok'], ['restore','saved','ok'], ['unlock','allowed','ok'], ['reason','resolved','ok'], ['dashboard','updated','ok']],
          ai: [['summary','ready','ok'], ['impact','low','ok'], ['next step','monitor','ok'], ['owner view','updated','ok'], ['client view','updated','ok']]
        }
      },
      {
        title: 'Domain mismatch',
        note: 'Reason: domain_not_allowed',
        ok: false,
        summary: 'SDK key is valid, but the current domain is not in allowed domains. Add this domain in project settings.',
        views: {
          info: [['settings','403','bad'], ['domain','blocked','bad'], ['events','queued','warn'], ['verify','skipped','warn'], ['dashboard','alert','bad']],
          network: [['settings','403','bad'], ['gate.js','200','ok'], ['events','queued','warn'], ['verify','blocked','bad'], ['alert','created','bad']],
          events: [['visit','saved','ok'], ['domain_check','failed','bad'], ['overlay','created','warn'], ['unlock','denied','bad'], ['audit','logged','ok']],
          ai: [['summary','ready','ok'], ['impact','high','bad'], ['next step','allow domain','ok'], ['owner view','alert','bad'], ['client view','blocked','bad']]
        }
      }
    ];
    let stateIndex = 0;
    let activeTab = 'info';

    function render() {
      const state = states[stateIndex];
      adState.classList.toggle('ok', state.ok);
      adState.innerHTML = `<strong>${state.title}</strong><small>${state.note}</small>`;
      summary.textContent = state.summary;
      const rows = state.views[activeTab] || state.views.info;
      debugList.innerHTML = rows.map((row, i) => `<div><b>${i+1}</b><span>${row[0]}</span><em class="${row[2]}">${row[1]}</em></div>`).join('');
    }

    btn.addEventListener('click', () => {
      stateIndex = (stateIndex + 1) % states.length;
      render();
    });

    tabs.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-demo-tab]');
      if (!tab) return;
      activeTab = tab.dataset.demoTab;
      $$('[data-demo-tab]', tabs).forEach(item => item.classList.toggle('active', item === tab));
      render();
    });

    render();
  }

  function initTabs() {
    const tabsRoot = $('[data-tabs]');
    const panel = $('[data-tab-panel]');
    if (!tabsRoot || !panel) return;
    const data = {
      detect: { pill:'Detect', title:'SDK detects that the ad container is hidden or failed to load', text:'Viewport, container size, page URL, session, visitor hash, and reason are captured.', code:'{ "eventType": "overlay", "reason": "ad_container_hidden" }' },
      verify: { pill:'Verify', title:'Backend confirms the access state', text:'In the strict flow, the customer backend verifies the session with a secret key instead of trusting frontend state only.', code:'POST /verify -> { "access": "allowed", "confidence": 0.92 }' },
      explain: { pill:'Explain', title:'Dashboard explains the reason in human language', text:'A PM sees the page, reason, frequency, and impact on unlock rate, not just a raw error.', code:'Top reason: domain_not_allowed · 34% of affected visits' },
      act: { pill:'Act', title:'The team fixes integration faster', text:'Update selectors, allowed domains, backend verification, or enable kill switch for safe rollback.', code:'killSwitch.enabled = true // emergency rollback' }
    };
    tabsRoot.addEventListener('click', (event) => {
      const button = event.target.closest('[data-tab]');
      if (!button) return;
      $$('[data-tab]', tabsRoot).forEach(btn => btn.classList.toggle('active', btn === button));
      const item = data[button.dataset.tab];
      panel.innerHTML = `<span class="pill">${item.pill}</span><h3>${item.title}</h3><p class="muted">${item.text}</p><pre><code>${item.code}</code></pre>`;
    });
  }

  function drawCharts() {
    $$('.mini-chart').forEach(canvas => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const values = (canvas.dataset.values || '').split(',').map(Number).filter(n => !Number.isNaN(n));
      if (!values.length) return;
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0,0,w,h);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,.12)';
      for (let y=30; y<h; y+=42) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
      const min = Math.min(...values), max = Math.max(...values);
      const pad = 22;
      const points = values.map((v,i) => {
        const x = pad + i * ((w - pad*2) / (values.length - 1));
        const y = h - pad - ((v - min) / (max - min || 1)) * (h - pad*2);
        return [x,y];
      });
      ctx.beginPath();
      points.forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
      ctx.strokeStyle = '#8ec8ff';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.lineTo(points[points.length-1][0], h-pad);
      ctx.lineTo(points[0][0], h-pad);
      ctx.closePath();
      const gradient = ctx.createLinearGradient(0,0,0,h);
      gradient.addColorStop(0, 'rgba(74,144,217,.35)');
      gradient.addColorStop(1, 'rgba(74,144,217,0)');
      ctx.fillStyle = gradient;
      ctx.fill();
      points.forEach(([x,y]) => { ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2); ctx.fillStyle = '#dff0ff'; ctx.fill(); });
    });
  }

  function initInsightDemo() {
    const btn = $('[data-generate-ai]');
    const msg = $('[data-ai-message]');
    if (!btn || !msg) return;
    const summaries = [
      'Insight summary: the ad container is present in the DOM, but its height becomes 0px on a mobile breakpoint. Check CSS for #ad-slot and lazy loading after layout changes.',
      'Insight summary: events are arriving, but server verify often denies access. The likely cause is a session id mismatch between SDK and backend.',
      'Insight summary: the customer domain does not match allowed domains for this project. Add the www version or configure a canonical domain.'
    ];
    let i = 0;
    btn.addEventListener('click', () => {
      const text = summaries[i++ % summaries.length];
      msg.textContent = '';
      let n = 0;
      const timer = setInterval(() => {
        msg.textContent = text.slice(0, n++);
        if (n > text.length) clearInterval(timer);
      }, 12);
    });
  }

  function initSecurityChecklist() {
    const root = $('[data-security-checklist]');
    if (!root) return;
    const score = $('[data-score]', root);
    const circle = $('.score-circle', root);
    const inputs = $$('input[type="checkbox"]', root);
    function update() {
      const checked = inputs.filter(input => input.checked).length;
      const percent = Math.round((checked / inputs.length) * 100);
      score.textContent = percent + '%';
      circle.style.background = `conic-gradient(var(--blue) ${percent * 3.6}deg, rgba(74,144,217,.18) 0deg)`;
    }
    inputs.forEach(input => input.addEventListener('change', update));
    update();
  }

  function initPricing() {
    const root = $('[data-billing]');
    if (!root) return;
    root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-billing-mode]');
      if (!button) return;
      const mode = button.dataset.billingMode;
      $$('[data-billing-mode]', root).forEach(btn => btn.classList.toggle('active', btn === button));
      $$('[data-price]').forEach(price => { price.textContent = '$' + price.dataset[mode]; });
      showToast(mode === 'yearly' ? 'Yearly billing: 20% discount' : 'Monthly billing');
    });
  }

  function initAccordion() {
    $$('[data-accordion]').forEach(root => {
      root.addEventListener('click', (event) => {
        const button = event.target.closest('.faq-item > button');
        if (!button) return;
        const item = button.parentElement;
        const content = button.nextElementSibling;
        const open = item.classList.toggle('open');
        content.style.maxHeight = open ? content.scrollHeight + 'px' : '0px';
      });
    });
  }

  function initCopyButtons() {
    $$('[data-copy]').forEach(button => {
      button.addEventListener('click', async () => {
        const target = $(button.dataset.copy);
        if (!target) return;
        const text = target.innerText.trim();
        try {
          await navigator.clipboard.writeText(text);
          showToast('Copied');
        } catch (error) {
          const area = document.createElement('textarea');
          area.value = text;
          document.body.appendChild(area);
          area.select();
          document.execCommand('copy');
          area.remove();
          showToast('Copied');
        }
      });
    });
  }

  function initBlogFilter() {
    const bar = $('[data-filter-bar]');
    if (!bar) return;
    bar.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-filter]');
      if (!btn) return;
      const filter = btn.dataset.filter;
      $$('[data-filter]', bar).forEach(item => item.classList.toggle('active', item === btn));
      $$('[data-category]').forEach(card => {
        card.classList.toggle('is-hidden', filter !== 'all' && card.dataset.category !== filter);
      });
    });
  }



  function initUrlToast() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('login') === 'success') showToast('Login successful');
    if (params.get('registered') === '1') showToast('Beta Trial activated');
    if (params.get('passwordReset') === '1') showToast('Password updated');
  }

  function initAdminPreview() {
    const root = $('[data-admin-tabs]');
    if (!root) return;
    root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-admin-tab]');
      if (!button) return;
      const name = button.dataset.adminTab;
      $$('[data-admin-tab]', root).forEach(item => item.classList.toggle('active', item === button));
      $$('[data-admin-panel]', root).forEach(panel => panel.classList.toggle('active', panel.dataset.adminPanel === name));
    });
  }

  function initLeadForm() {
    const form = $('[data-lead-form]');
    if (!form) return;
    const status = $('[data-form-status]', form);
    const saved = localStorage.getItem('adProtectLeadDraft');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        Object.keys(data).forEach(name => {
          const field = form.elements[name];
          if (field) field.value = data[name];
        });
      } catch (_) {}
    }
    form.addEventListener('input', () => {
      const data = Object.fromEntries(new FormData(form).entries());
      localStorage.setItem('adProtectLeadDraft', JSON.stringify(data));
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      if (!data.email || !data.email.includes('@')) {
        status.textContent = 'Please enter a valid email.';
        status.style.color = 'var(--bad)';
        return;
      }
      status.textContent = 'Request saved locally. Connect a backend endpoint for production.';
      status.style.color = 'var(--good)';
      showToast('Form handled locally');
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initAuthNav();
    attachFloatingProfileMenus(document);
    initMenu();
    initReveal();
    initCounters();
    initHomeDemo();
    initTabs();
    drawCharts();
    initInsightDemo();
    initSecurityChecklist();
    initPricing();
    initAccordion();
    initCopyButtons();
    initBlogFilter();
    initLeadForm();
    initAdminPreview();
    initUrlToast();
  });
})();
