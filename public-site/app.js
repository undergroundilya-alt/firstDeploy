(function(){
  var loader=document.createElement('div');
  loader.className='page-loader';
  loader.innerHTML='<div class="page-loader-dot" aria-label="Loading"></div>';
  document.documentElement.classList.add('page-loading');
  if(document.body){document.body.prepend(loader);}else{document.addEventListener('DOMContentLoaded',function(){document.body.prepend(loader);});}
  window.addEventListener('load',function(){setTimeout(function(){loader.classList.add('hide');document.documentElement.classList.remove('page-loading');setTimeout(function(){loader.remove();},360);},160);});
})();
(function () {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const toast = $('[data-toast]');
  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
  }


  async function initAuthNav() {
    const nav = $('[data-nav]');
    if (!nav) return;
    try {
      const res = await fetch('/api/client/session', { credentials: 'same-origin', cache: 'no-store' });
      const data = await res.json();
      if (!data || !data.authenticated || !data.user) return;
      const loginLink = Array.from(nav.querySelectorAll('a')).find(a => /\/login$/.test(a.getAttribute('href') || ''));
      if (!loginLink) return;
      const profile = document.createElement('span');
      profile.className = 'nav-profile';
      const name = (data.user.name || data.user.email || 'Account').trim();
      profile.innerHTML = `<span class="nav-profile-trigger" tabindex="0">Profile</span><span class="nav-profile-menu"><a href="/account">${name.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</a><button type="button" data-public-logout>Logout</button></span>`;
      loginLink.replaceWith(profile);
      const cta = nav.querySelector('.nav-cta');
      if (cta) cta.href = '/account';
      profile.addEventListener('click', async (event) => {
        const btn = event.target.closest('[data-public-logout]');
        if (!btn) return;
        event.preventDefault();
        const account = await fetch('/account', { credentials: 'same-origin' }).then(r => r.text()).catch(() => '');
        const token = (account.match(/name="csrf" value="([^"]+)"/) || [])[1] || '';
        const form = new URLSearchParams();
        form.set('csrf', token);
        await fetch('/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
        window.location.href = '/login';
      });
    } catch (_) {}
  }

  function initMenu() {
    const btn = $('[data-menu-toggle]');
    const nav = $('[data-nav]');
    if (!btn || !nav) return;
    btn.addEventListener('click', () => {
      const open = document.body.classList.toggle('menu-open');
      btn.setAttribute('aria-expanded', String(open));
    });
    nav.addEventListener('click', (event) => {
      if (event.target.closest('a')) {
        document.body.classList.remove('menu-open');
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

  function initAI() {
    const btn = $('[data-generate-ai]');
    const msg = $('[data-ai-message]');
    if (!btn || !msg) return;
    const summaries = [
      'AI summary: the ad container is present in the DOM, but its height becomes 0px on a mobile breakpoint. Check CSS for #ad-slot and lazy loading after layout changes.',
      'AI summary: events are arriving, but server verify often denies access. The likely cause is a session id mismatch between SDK and backend.',
      'AI summary: the customer domain does not match allowed domains for this project. Add the www version or configure a canonical domain.'
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
    initMenu();
    initReveal();
    initCounters();
    initHomeDemo();
    initTabs();
    drawCharts();
    initAI();
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
