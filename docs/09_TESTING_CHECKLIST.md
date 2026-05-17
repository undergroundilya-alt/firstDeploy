# 09. Beta testing checklist

## 1. Базовий запуск

- `npm start` запускається без помилок
- `https://localhost:3443/` відкриває landing
- `https://localhost:3443/admin` відкриває login
- login працює з `ADMIN_EMAIL` / `ADMIN_PASSWORD`
- `/health` повертає JSON з версією

## 2. Проєкти

- створити новий company/project
- перевірити allowed domains
- перевірити snippet
- відкрити demo customer page
- перевірити CSV export

## 3. SDK

- SDK вантажиться з `/sdk/v1/<publicKey>.js`
- створюється visitorToken
- protected content приховується до перевірки
- ad container рендериться
- `content_unlocked` записується в dashboard
- `overlay_shown` записується при simulated adblock

## 4. Симуляції

- `?simulateAdBlock=1`
- `?simulateConnectionIssue=1`
- ручне видалення ad container у DevTools
- зміна `display:none`
- зміна `visibility:hidden`
- зміна `opacity:0`

## 5. Browser matrix

- Chrome desktop
- Firefox desktop
- Edge desktop
- Android Chrome
- iOS Safari, якщо є доступ

## 6. Extensions matrix

- AdBlock
- uBlock Origin
- AdGuard
- privacy extensions
- custom test extension from `test-adblocker-extension/`

## 7. Server-gate

- отримати `window.__AVP_VISITOR_TOKEN__`
- викликати `/api/v1/server/verify`
- перевірити allowed true після content unlock
- перевірити allowed false без content unlock
- перевірити allowed false з неправильним secretKey

## 8. Security smoke test

- dashboard недоступний без login
- невідомий origin не проходить allowed domain
- API rate limit працює
- admin login rate limit працює
- secret key не з’являється у SDK
