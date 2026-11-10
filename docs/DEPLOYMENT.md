# Развёртывание

## Бесплатный стек

Cloudflare Workers **Free**, Workers Static Assets, D1 **Free**, один суточный cron. R2 / Durable Objects / платные realtime / AI API не подключены. У Free есть квоты запросов, CPU, чтений/записей/размера D1. При исчерпании квоты сервис может отвечать ошибкой; проект сам не повышает тариф. Проверяйте актуальные квоты и план в Dashboard; отсутствие платежей не означает бесконечную нагрузку.

## Первый запуск

1. Node 24, `npm ci`, `npx wrangler login`, `npx wrangler whoami`.
2. `npx wrangler d1 create m-new-posted` на Free. Вставить UUID в wrangler.jsonc или выполнить configure-d1 с переменной CLOUDFLARE_D1_DATABASE_ID. Не меняйте binding DB и database_name без синхронного обновления scripts.
3. `npm run db:remote`. Миграция `0001_core.sql` создаёт все таблицы и permissions/tier metadata/settings, **без пользователей/паролей/постов**.
4. `npm run check` и `npm run test:e2e` после `npm run db:local`; затем `npm run deploy`.
5. Настройте workers.dev subdomain аккаунта в Dashboard, если ещё отсутствует. Фактический URL выдаёт Wrangler. Имя сайта — m-new-posted; адрес включает субдомен аккаунта. Проверьте HTTPS URL, `/api/platform`, регистрацию, создание/удаление поста и вход с другого браузера.
6. Зарегистрируйте владельца. Получите ID через доверенный D1 query, выполните `npm run owner -- UUID --remote --confirm`. Не запускайте bootstrap для случайного первого посетителя. Проверьте возвращённую строку и `/admin`; не назначайте Owner по публичному username.
7. Опционально почта: `npx wrangler secret put MAIL_API_KEY`, `MAIL_FROM`, `APP_ORIGIN`. Resend sender требует подтверждённого домена; без провайдера смена пароля работает, recovery честно недоступен.

## GitHub Actions

В Settings / Secrets and variables / Actions:

| Вид      | Имя                       | Значение                                                          |
| -------- | ------------------------- | ----------------------------------------------------------------- |
| Secret   | CLOUDFLARE_API_TOKEN      | Scoped API token нужного аккаунта, Workers Scripts Edit + D1 Edit |
| Secret   | CLOUDFLARE_ACCOUNT_ID     | ID аккаунта                                                       |
| Variable | CLOUDFLARE_D1_DATABASE_ID | UUID production D1                                                |
| Variable | ENABLE_CLOUDFLARE_DEPLOY  | true                                                              |

Environment production можно создать заранее, с выбранными владельцем правилами согласования. Основная ветка — main. CI без cloud-секретов работает отдельно. Production workflow проверяет typecheck/lint/unit/API/build/browser, применяет remote migrations и деплоит. Если ENABLE_CLOUDFLARE_DEPLOY не равен true, deployment job пропускается; это ожидаемо до подключения аккаунта.

Идентификатор D1 не является секретом и может храниться в конфиге. GitHub/Cloudflare токены — секреты; они не нужны в frontend и никогда не записываются в tracked файлы. Владелец самостоятельно вводит значения в настройках, не в чате.

## Обновления

Новые таблицы/индексы оформляйте миграциями 0002+, не исправляйте применённую 0001. На production сначала приватный backup и совместимая миграция, затем Worker. Для разработки используйте локальную базу; preview не должен иметь production binding. Сейчас отдельная preview-база не создаётся автоматически.

## Откат

`npx wrangler deployments list` показывает версии. `npx wrangler rollback VERSION_ID` возвращает Worker; данные D1 не откатываются. Изменения схемы должны сохранять совместимость с предыдущим Worker. При повреждении данных используйте D1 Time Travel: сначала `npx wrangler d1 time-travel info m-new-posted`, затем по подтверждённому владельцем плану `npx wrangler d1 time-travel restore m-new-posted --timestamp=ISO_TIMESTAMP`. Восстановление откатывает чужие новые записи и требует оценки потерь. Дополнительно доступен `d1 export --remote --output=backup.sql`; храните выгрузку приватно вне Git и применяйте к отдельной восстановленной базе перед сменой binding.

## Проверенный результат этого рабочего сеанса

Применена `0001_core.sql` к локальной D1, API-тесты применяют её к изолированной D1 Miniflare. Cloudflare CLI ответил `You are not authenticated`. Remote-ресурсы не создавались, remote-миграции не применялись, production URL не заявляется. Ни платный план, ни временный чужой аккаунт для деплоя не использованы.
