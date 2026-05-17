# 07. Production gaps

Эта beta уже демонстрирует SaaS-модель, но ещё не является production SaaS.

## Что заменить перед production

1. JSON state -> PostgreSQL.
2. Inline admin auth -> нормальная auth-система.
3. Один owner -> multi-user roles.
4. Secret key в JSON -> encrypted secrets / secret rotation.
5. No rate limit -> rate limiter.
6. No billing -> Stripe/WayForPay/ручные инвойсы.
7. No legal docs -> Terms, Privacy Policy, DPA.
8. No CDN -> CDN для SDK.
9. No queue -> event queue / batch ingestion.
10. Local cert -> public TLS.
11. Basic dashboard -> фильтры, графики, экспорт.
12. No tenant isolation checks beyond IDs -> строгая multi-tenant isolation.

## Что улучшить в логике

- server-side proof flow;
- подписанные короткоживущие challenge tokens;
- batch events;
- bot filtering;
- revenue estimate model;
- configurable overlay texts;
- allowlist/denylist paths;
- per-project strictness rules;
- anomaly detection;
- integration with real ad slots.
