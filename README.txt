AdBlock TLS Console Guard v10

ЗАПУСК
1. Распаковать архив.
2. В папке проекта выполнить:
   npm start
3. Открывать только:
   https://localhost:3443/

ЧТО ИЗМЕНЕНО В v10

1. ДВОЙНАЯ ПРОВЕРКА uBlock vs плохой интернет
   При загрузке делаются два параллельных запроса:
   - На мой сервер (/api/ad-fragment)
   - На нейтральный сервер (google.com/favicon.ico)
   Если нейтральный ответил, мой нет → uBlock блокирует рекламу → показываем wall.
   Если оба не ответили → плохой интернет → молчим, не трогаем пользователя.

2. SKELETON LOADER
   Пока идёт проверка и загрузка рекламы, на месте баннера
   отображается красивый анимированный skeleton loader.
   Выглядит как нормальная загрузка, а не пустое место.

3. DOM OBFUSCATION (мусорные элементы)
   При каждой загрузке и каждом ререндере в DOM добавляется
   от 1000 до 1500 случайных невидимых элементов с похожими
   на рекламные классами и рандомными ID.
   Цель: автоматизировать блокировку по имени или вложенности
   становится крайне сложно или невозможно.
   Шум обновляется при каждом ререндере баннера.

4. Всё остальное из v9 сохранено без изменений.

ПРОВЕРКИ

Обычная загрузка:
https://localhost:3443/

Проверка первичной стены:
https://localhost:3443/?simulateAdBlock=1

Проверка вмешательства:
https://localhost:3443/?simulateTamper=aside
https://localhost:3443/?simulateTamper=container
https://localhost:3443/?simulateTamper=remove
https://localhost:3443/?simulateTamper=hide
https://localhost:3443/?simulateTamper=class
https://localhost:3443/?simulateTamper=html

ТЕСТОВОЕ РАСШИРЕНИЕ

Папка: test-adblocker-extension

Chrome/Edge: chrome://extensions/ → Developer mode → Load unpacked
Firefox: about:debugging#/runtime/this-firefox → Load Temporary Add-on → manifest.json
