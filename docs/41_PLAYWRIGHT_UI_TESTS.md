# 41. Playwright UI tests

Этот слой тестов дополняет Node smoke/API tests и проверяет проект как пользователь в браузере.

Теперь UI-тесты тоже подробные: каждый тест разбит на `test.step`, а внутри шагов печатаются понятные строки о том, что именно было проверено.

## Чем отличается от `tests/e2e-smoke.test.js`

`tests/e2e-smoke.test.js` проверяет backend/API через HTTP-запросы: маршруты, JSON-контракты, admin auth, CSRF, storage и production guard.

Playwright UI tests открывают реальные страницы в Chromium: marketing UI, responsive menu, интерактивные блоки, admin login, создание проекта, test-site article, SDK visitorToken и server-gate demo.

## Команды

```bash
npm install
npx playwright install chromium
npm run test:ui
```

Для видимого браузера:

```bash
npm run test:ui:headed
```

Для отладки:

```bash
npm run test:ui:debug
```

Для полного набора проверок:

```bash
npm run test:all
```

## Как выглядят новые логи

Playwright запускается с `list` reporter, плюс внутри тестов есть явные сообщения:

```text
▶ Open marketing home page and verify title/hero
   ✓ Home title, hero heading and desktop navigation are visible
✅ Open marketing home page and verify title/hero

▶ Fill project form with server-gate mode and allowed domains
   ✓ Company, email, project name, server-gate mode and domains were filled — Playwright Project 176...
✅ Fill project form with server-gate mode and allowed domains

▶ Verify frontend HTML does not expose secret key
   ✓ No avp_sec_ secret key string found in page HTML
✅ Verify frontend HTML does not expose secret key
```

## Что покрыто в UI

### Marketing UI

- `/` opens and has correct title/hero.
- Desktop navigation from home to `/product.html` works.
- `/product.html` renders product heading.
- `/ai.html` renders AI heading.
- `/security.html` renders security heading.
- `/pricing.html` renders pricing heading.
- 360×800 mobile viewport is tested.
- Mobile menu button toggles `aria-expanded` from `false` to `true`.
- Body receives `menu-open` class.
- Clicking Docs link navigates to `/docs.html` and closes the mobile menu.
- Home demo widget changes visible state after click.
- Verification tab changes visible panel content.
- Product mode switcher changes visible content to `Server-gate`.
- Pricing toggle changes first price to yearly value.
- Blog filter hides non-selected category cards.

### Admin UI

- `/admin` without session redirects to `/admin/login`.
- Login heading is visible, so protected dashboard is not exposed.
- Admin login form accepts default test credentials.
- Dashboard is visible after login.
- Dashboard contains default `Protected Content Demo` project.
- Dashboard shows public key code block.
- New project form opens from dashboard CTA.
- Project name, company, email, mode and domains are filled through UI.
- Project is created through real form submit.
- Project details page opens.
- Secret key warning is visible on project page.
- Dashboard shows the newly created project.
- Security center opens.
- MFA block is visible.
- Global kill switch block is visible.
- Admin audit log block is visible.

### Test-site + SDK UI

- `/test-site` launcher renders.
- Normal scenario link is visible.
- Simulated adblock scenario link is visible.
- Connection issue scenario link is visible.
- Current `avp_pub_...` project key is visible.
- Normal article opens with heading, `#ad-slot` and `#protected-content`.
- SDK creates `window.__AVP_VISITOR_TOKEN__` with `avp_vst_...` token format.
- Debug box contains the visitor token.
- Browser sends `/api/v1/session`.
- Browser sends `/api/v1/challenge`.
- Simulated connection issue article still renders.
- Debug box contains connection issue marker.
- Protected content remains usable in deterministic test mode.
- Hidden slot scenario makes `#ad-slot` hidden in the browser.
- Server-gate article shows unlock button.
- Browser sends `POST /test-site/backend-unlock` after button click.
- UI status is updated from backend response.
- Frontend HTML does not contain `avp_sec_` secret key.
- After browser SDK interaction, admin dashboard contains event markers.

## Что пока не покрыто надёжно

- реальная работа внешних adblock-расширений Chrome
- pixel-perfect визуальные сравнения
- настоящая CDN/Cloudflare/nginx production-связка
- Redis/PostgreSQL cluster mode
- долгие нагрузочные сценарии

Эти проверки лучше держать отдельными наборами, чтобы UI-тесты оставались быстрыми и стабильными.
