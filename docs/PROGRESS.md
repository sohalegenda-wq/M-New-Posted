# Прогресс и продолжение

Цель этого сеанса — первая рабочая версия, как разрешено master prompt. Не полная социальная платформа. Репозиторий исходно содержал только README.

| Этап                          | Статус                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| 1. Архитектура и конфигурация | React/Vite/Tailwind/Router/Query/Motion, Hono Workers, wrangler, CI                               |
| 2. D1 и аккаунты              | Миграция, auth, cookie/CSRF/rate limits, профиль/сессии/смена/удаление; recovery при mail secrets |
| 3. Социальное ядро            | Посты/ответы/медиа/цитаты/реакции/подписки/закладки/черновики/пины                                |
| 4. Ленты и поиск              | 3 режима, cursor/infinite/pull refresh, LIKE search, notifications                                |
| 5. Premium                    | Роли отдельно от уровней, grant/revoke/expiry/audit, баннер/статус/3 styles/лимиты/analytics      |
| 6. Admin                      | Серверные permissions, dashboard/users/roles/badges/reports/bans/appeals/audit/system             |
| 7. Messages и дополнения      | Текст/фото/чтение/удаление/reports/privacy, экспорт, PWA                                          |
| 8. Проверки                   | Unit/API/D1/typecheck/lint/build + Chromium desktop/mobile                                        |
| 9. GitHub и Cloudflare        | Код/Actions подготовлены; реальный Cloudflare deployment ожидает аккаунт/Secrets                  |

## Следующие шаги по приоритету

1. Подключить Cloudflare Free и production D1, выполнить smoke test HTTPS, bootstrap Owner; проверить CPU PBKDF2/квоты на реальной платформе.
2. Подтверждение email, полноценный RU/EN/KK без русских остатков, периодические уведомления об истечении Premium.
3. Запросы доступа в закрытые профили и подписчики, пагинация всех коллекций вместо документированных лимитов; FTS5 и нагрузочные измерения запросов ленты.
4. Опросы, пользовательские списки, отдельные публичные обсуждения и многочастный редактор цепочки.
5. Запланированные посты (существующий cron расширять с idempotent обработкой), безопасные link previews (SSRF-защита), granular notification settings.
6. R2 adapter только после проверки бесплатной доступности без платёжных данных; image decoding/resize/pixel limits, удаление медиа по запросу.
7. Дополнительное Premium-оформление: frames, анимации безопасных форматов, gift graphics, link page, порядок pins, скрытие tabs, feed/profile card themes; не обещать до реализации.
8. Owner UI для логотипа/лимитов/feature flags, отдельные publish restrictions и reply moderation, точная activity/online метрика.

Перед продолжением прочитайте README и SECURITY. Запускайте `npm ci`, `npm run check`; локальную базу не коммитьте и не копируйте в production. Все критические серверные сценарии проверяйте через Miniflare/D1. Разграничение прав должно оставаться на backend, Premium не эквивалентен роли. Не подменяйте недоступную функцию кнопкой без работающего backend.

## Проверка 11 ноября 2026

- TypeScript typecheck: пройден.
- ESLint: пройден, без предупреждений.
- Vitest: **26/26** (22 интеграционных теста Worker/D1 + 4 unit).
- Production build: пройден; маршруты Settings/Admin и библиотеки разделены на чанки.
- Playwright Chromium: **3/3** (desktop account/post/like/draft/profile/theme/admin denial; mobile; PWA privacy/offline).
- Wrangler deploy --dry-run: пройден, фактической публикации не было.
- Миграция `0001_core.sql`: применена локально (59 SQL-команд); отдельно проверена в изолированной D1 тестов. Remote не применялась.
- Проверены CSP/nosniff/referrer/permissions headers, responsive screenshots; горизонтального переполнения на ширине 390 px нет.
- Cloudflare resources: **0 создано**; `wrangler whoami` сообщает об отсутствии авторизации.
