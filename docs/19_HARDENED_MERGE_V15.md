# v15 Hardened Merge — что именно добавлено

Эта версия объединяет две ветки:

1. **legacy v10** — исходная сильная демка с WebCrypto, canvas proof, DOM noise, MutationObserver, server rerender и TLS proxy. Она сохранена без удаления в `legacy-v10-original/` и запускается через `npm run legacy`.
2. **main SaaS beta** — основной продуктовый запуск через `npm start`: компании, проекты, ключи, SDK, dashboard, server-to-server verification и аналитика.

В v15 ключевая защита из v10 перенесена в основной SaaS SDK, чтобы основная beta-версия не была слабее старой демки.

## Реализовано в основном SaaS SDK

- WebCrypto ECDSA P-256 ключ на один браузерный запуск.
- Одноразовый server challenge для proof-flow.
- Подписанный payload: challenge nonce, slotId, poolToken, видимость рекламы, canvas proof.
- Canvas proof: браузер рисует nonce-зависимый canvas, считает SHA-256 и отправляет proof.
- Server bait-hit: рекламный фрагмент содержит pixel-hit, сервер должен увидеть хотя бы один bait-hit.
- Visibility proof: проверяется фактическая видимость рекламного слота через DOM + IntersectionObserver.
- DOM noise: генерируется 1000–1500 скрытых шумовых элементов с рекламоподобными class/id.
- MutationObserver: отслеживает удаление/скрытие/изменение рекламного контейнера после открытия контента.
- Body-level watcher: реагирует не только на изменение самого контейнера, но и на удаление контейнера целиком.
- Server restore: при вмешательстве SDK запрашивает новый ad-fragment у сервера.
- Scheduled rerender: каждые 30 секунд SDK получает новый рекламный фрагмент с сервера.
- Heartbeat: регулярная проверка связи и видимости рекламы; при потере heartbeat показывается overlay.
- uBlock vs bad internet: нейтральный ping + network probe различают вероятную блокировку и проблему соединения.
- Dynamic SDK route: кроме `/sdk/v1/PUBLIC_KEY.js` поддержан `/sdk/v1/PUBLIC_KEY/RANDOM.js`.
- Polymorphic wrapper beta: при каждой выдаче SDK добавляется случайный wrapper-marker/dead-data.
- Server-to-server verification: backend клиента может проверить visitorToken перед выдачей контента.

## Важное ограничение

Это сильная beta-основа, а не абсолютная защита. В браузере невозможно честно обещать «невозможно обойти вообще». Корректная формулировка: система значительно усложняет обход, связывает доступ к контенту с server-side proof-flow и даёт аналитику попыток обхода.

## Главные маршруты

- `/` — landing/demo продукта.
- `/admin` — dashboard владельца продукта.
- `/demo/customer/:publicKey` — демо-страница клиента.
- `/sdk/v1/:publicKey.js` — основной SDK.
- `/sdk/v1/:publicKey/:random.js` — динамический SDK route.
- `/api/v1/session` — создание visitor session.
- `/api/v1/challenge` — одноразовый challenge.
- `/api/v1/ad-fragment` — серверный рекламный фрагмент.
- `/api/v1/bait-hit` — серверный bait-hit pixel/script.
- `/api/v1/proof` — WebCrypto + canvas + visibility proof.
- `/api/v1/server/verify` — проверка visitorToken backend’ом клиента.

## Как тестировать

1. Запустить `npm start`.
2. Открыть `https://localhost:3443/admin`.
3. Открыть demo customer page.
4. Проверить нормальный сценарий: loader → ad fragment → proof → content unlocked.
5. Проверить `?simulateAdBlock=1`.
6. Проверить `?simulateConnectionIssue=1`.
7. После открытия контента удалить `#ad-slot` или скрыть его через DevTools.
8. Проверить, что сначала идёт restore, а после повторных вмешательств — overlay.
9. Оставить страницу открытой и убедиться, что scheduled rerender пишет события.
10. Проверить `/api/v1/server/verify` с `window.__AVP_VISITOR_TOKEN__`.
