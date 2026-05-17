# 10. ТЗ для клієнта на підключення beta

## Мінімальний доступ

Клієнту не потрібно давати повний доступ до сайту. Для beta достатньо, щоб його розробник або адміністратор CMS вставив JS snippet у потрібний шаблон сторінки.

## Що потрібно від клієнта

1. URL сторінок, де треба виміряти рекламну видимість.
2. Selector рекламного контейнера, наприклад `#ad-slot`.
3. Selector захищеного блоку, наприклад `#protected-content`.
4. Дозвіл вставити один `<script>`.
5. Обрати режим: observe-only, soft-gate або server-gate.

## Observe-only snippet

```html
<div id="ad-slot"></div>

<script async src="https://YOUR-SAAS-DOMAIN/sdk/v1/PROJECT_PUBLIC_KEY.js"
  data-project-key="PROJECT_PUBLIC_KEY"
  data-ad-container-selector="#ad-slot"
  data-mode="observe-only"></script>
```

## Soft-gate snippet

```html
<div id="ad-slot"></div>
<div id="protected-content">Protected content here</div>

<script async src="https://YOUR-SAAS-DOMAIN/sdk/v1/PROJECT_PUBLIC_KEY.js"
  data-project-key="PROJECT_PUBLIC_KEY"
  data-protected-selector="#protected-content"
  data-ad-container-selector="#ad-slot"
  data-mode="soft-gate"></script>
```

## Server-gate

У цьому режимі контент не має бути повністю присутнім у DOM до дозволу backend. Клієнтський backend викликає Ваш SaaS endpoint `/api/v1/server/verify`.

## Рекомендація для перших клієнтів

Починати з observe-only на 7–14 днів. Це знижує страх клієнта, не блокує користувачів і дає перші цифри.
