# ServiceDesk Lite

Внутренняя система регистрации и обработки технических заявок сотрудников.

> **ServiceDesk-Lite.1 — Neon-версия ServiceDesk Lite.** Этот репозиторий
> продолжает разработку ServiceDesk Lite на стеке Neon (Neon Auth, Neon Data
> API, PostgreSQL RLS, Drizzle ORM) вместо Supabase.
>
> **Статус:** Кодовая миграция этапов 1–4 (фундамент, схема/RLS/RPC, auth,
> кабинет сотрудника) на Neon **выполнена и проверена везде, где это можно
> сделать без реального Neon-проекта**: unit-тесты, lint, typecheck, build —
> проходят; SQL-миграции и SQL security/functional-тесты выполнены и
> проверены на настоящем локальном PostgreSQL 16 (см.
> [«Что реально проверено»](#что-реально-проверено)). **Интеграционная
> приёмка на настоящем Neon Auth + Neon Data API не выполнялась** — в этой
> сессии не было доступного Neon-проекта/credentials. Администраторский
> интерфейс обработки заявок в этот этап намеренно не входит.

## 1. Назначение ServiceDesk Lite

В компании заявки на техническую поддержку (проблемы с оборудованием, ПО,
сетью, доступами, рабочим местом) обрабатываются бессистемно: через чаты,
устные просьбы и разрозненные таблицы. ServiceDesk Lite — лёгкое внутреннее
веб-приложение: сотрудник быстро создаёт заявку с категорией и приоритетом и
отслеживает её статус; служба поддержки видит единый реестр всех обращений
(следующий этап).

## 2. Почему создана Neon-версия

Исходный прототип (`nikitaorgiya/servicedesk-lite`, ветка
`claude/servicedesk-lite-stage-1-hzf7vf`, commit `67d09de`) полностью
реализует этапы 1–4 на Supabase и сохранён без изменений как отдельный
законченный прототип. Эта Neon-версия — не исправление ошибок, а
целенаправленный перенос на другой managed-Postgres-стек (Neon Auth + Neon
Data API + Drizzle) при сохранении интерфейса, ролей и всей SQL-модели
безопасности.

## 3. Ссылка на исходный Supabase-прототип

```text
Репозиторий: nikitaorgiya/servicedesk-lite
Ветка:        claude/servicedesk-lite-stage-1-hzf7vf
Commit:       67d09de
```

Полная карта замены каждого Supabase-компонента — в
[`docs/migration/supabase-to-neon.md`](./docs/migration/supabase-to-neon.md).
Обзор архитектурных решений и последовательности миграции — в
[`docs/migration/neon-migration.md`](./docs/migration/neon-migration.md).
`docs/database.md` и `docs/security.md` остаются в дереве как историческая
документация дизайна Supabase-прототипа (рассуждения о RLS-рекурсии,
constraints и т.д. концептуально всё ещё применимы) — они **не**
обновлялись под Neon и не являются рабочей документацией этого репозитория.

## 4. Технологический стек

- [Next.js 16](https://nextjs.org/) (App Router) + [React 19](https://react.dev/)
- TypeScript (строгий режим)
- [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
- **[Neon Auth](https://neon.com/docs/auth/overview)** (Managed Better Auth) — `@neondatabase/auth`
- **[Neon Data API](https://neon.com/docs/data-api/overview)** (PostgREST-совместимый) — `@neondatabase/postgrest-js`
- **PostgreSQL RLS** на всех пяти прикладных таблицах
- **[Drizzle ORM / Drizzle Kit](https://orm.drizzle.team/)** — схема, типы, миграции
- [React Hook Form](https://react-hook-form.com/) + [Zod](https://zod.dev/)
- [Vitest](https://vitest.dev/) + Testing Library — unit-тесты
- [Playwright](https://playwright.dev/) — e2e/smoke-тесты
- ESLint, GitHub Actions — CI
- [Vercel](https://vercel.com/) — целевая платформа деплоя

Реально установленные версии (зафиксированы `npm view` на момент миграции,
не по памяти):

| Пакет | Версия |
| --- | --- |
| `@neondatabase/auth` | `0.4.2-beta` |
| `@neondatabase/auth-ui` | `0.2.1-beta` |
| `@neondatabase/postgrest-js` | `0.2.0-beta` |
| `@neondatabase/serverless` | `1.1.0` |
| `drizzle-orm` | `0.45.2` |
| `drizzle-kit` | `0.31.10` |

Обратите внимание на суффикс `-beta` у всех трёх Neon Auth/Data API
пакетов — см. [«Статус Neon Auth Beta»](#20-статус-neon-auth-beta).

## 5. Архитектура

```text
Пользователь
    ↓
Next.js (Server Components / Server Actions)
    ↓
Neon Auth (cookie-based сессия, JWT-плагин)
    ↓
Neon Data API (PostgREST-совместимый, JWT пользователя в Authorization)
    ↓
PostgreSQL RLS
    ↓
Заявки / комментарии / история
```

- **`src/lib/auth/server.ts`** — единственный экземпляр Neon Auth
  (`createNeonAuth`) для Server Components/Actions/Route Handlers/proxy, плюс
  `getUserAccessToken()` (JWT-плагин `/token`) — источник JWT для Data API.
- **`src/lib/auth/client.ts`** — browser-клиент (`createAuthClient`), пока не
  используется ни одной формой (login/logout/reset — Server Actions), но
  доступен для будущего клиентского состояния сессии.
- **`src/lib/neon/data-api.ts`** — server-only фабрика `createDataApiClient()`:
  `NeonPostgrestClient` + `fetchWithToken(getUserAccessToken)`. Создаётся
  заново на каждый вызов (как раньше Supabase-клиент) — никогда не
  module-level singleton, никогда не использует `DATABASE_URL`.
- **`src/db/client.ts`** — привилегированный Drizzle-клиент на `DATABASE_URL`
  (`@neondatabase/serverless` + `drizzle-orm/neon-http`). Обходит RLS
  полностью — используется **только** в Drizzle Kit, `scripts/*.ts`, SQL
  security-тестах. Никогда не импортируется из кода, обслуживающего
  пользовательский запрос.
- **`src/proxy.ts`** — оборачивает `auth.middleware({ loginUrl: "/login" })`
  с матчером **только** `/app/**` и `/admin/**` (не широкий catch-all) — Neon
  Auth middleware трактует каждый совпавший путь как защищённый, поэтому
  публичные страницы не должны попадать в matcher вообще. Обёртка также
  дописывает санитизированный `?next=` к redirect на `/login` — установленная
  версия SDK этого не делает сама (найдено и исправлено при запуске
  smoke-тестов в этой сессии, см.
  [«Что реально проверено»](#что-реально-проверено)). Как и раньше, это не
  единый уровень защиты — `requireEmployee()`/`requireAdmin()` в layout
  повторно проверяют identity и роль на каждом запросе к соответствующему
  разделу.

## 6. Neon Auth

Заменяет Supabase Auth. Cookie-based сессия (Managed Better Auth,
`@neondatabase/auth/next/server`):

- `src/app/api/auth/[...path]/route.ts` — `auth.handler()`, проксирует весь
  auth-трафик (sign-in/sign-out/session/JWT/reset-password) к Neon Auth.
  Заменяет Supabase-эру `/auth/callback` PKCE-обмен — отдельного
  callback-роута больше нет.
- `getCurrentUser()` вызывает `auth.getSession()` (валидирует сессию у Neon
  Auth, не просто читает cookie).
- Роль **всегда** читается из `public.profiles.role` через Neon Data API —
  никогда из cookie, JWT claims или формы.
- **Provisioning профиля**: у Neon нет документированной точки-триггера,
  аналогичной `auth.users` в Supabase. Вместо этого `ensureProfileForCurrentUser()`
  вызывает RPC `ensure_profile` (см. `drizzle/0010_profile_provisioning.sql`)
  сразу после успешного `signIn.email` — идемпотентно, всегда `role = 'employee'`,
  никогда не принимает роль от вызывающего, никогда не трогает существующую
  строку.
- **Password recovery**: использует токен-в-URL flow Better Auth напрямую
  (`/reset-password?token=...`) — `requestPasswordReset({email, redirectTo})`
  → email со ссылкой на `/reset-password?token=...` → `resetPassword({newPassword, token})`.
  Отдельного callback-обмена кода на сессию, как в Supabase, не требуется.
- **Публичной регистрации нет** — не создано ни `/signup`, ни `/api/create-user`.
  См. [«Запрет публичной регистрации»](#запрет-публичной-регистрации).

### Запрет публичной регистрации

Официальная документация установленной версии Neon Auth (проверено в этой
сессии — см. `docs/migration/supabase-to-neon.md`) не описывает выделенную
конфигурацию «отключить self-service signup» на уровне Neon Auth SDK.
Поэтому:

- в интерфейсе нет и не будет формы регистрации, `/signup`, `/register` или
  `/api/create-user`;
- `auth.signUp.email()` вызывается **только** из `scripts/create-demo-users.ts`
  (доверенный, не-HTTP, confirmation-gated скрипт) — никогда из клиентского
  кода или публичного роута;
- остаточный риск: сам Neon Auth API (`sign-up/email`) технически доступен
  по HTTP через `/api/auth/sign-up/email`, если кто-то обратится к нему
  напрямую, минуя интерфейс — это не проверялось и не блокируется отдельным
  allow-list на уровне этого приложения в данной сессии. До появления
  реального Neon-проекта задокументировать и проверить: либо Neon Auth
  Console позволяет отключить email/password self-signup на уровне
  конфигурации инстанса, либо потребуется собственный guard в
  `app/api/auth/[...path]/route.ts`, отклоняющий `sign-up/email` без
  доверенного контекста.

## 7. Neon Data API

Заменяет прямые вызовы `supabase.from(...)`/`supabase.rpc(...)`. Пользовательские
SELECT и RPC идут через `createDataApiClient()` с JWT текущей сессии — та же
форма запросов, что и раньше (`@neondatabase/postgrest-js` оборачивает тот же
`@supabase/postgrest-js` под капотом), изменились только имена FK-констрейнтов
в embed-запросах (см. ниже).

- **JWT source**: `getUserAccessToken()` → Better Auth JWT-плагин `/token`.
- **`auth.user_id()`** — JWT `sub` claim, аналог Supabase `auth.uid()`.
- **Роли Data API**: `anon`, `authenticated` — нет `service_role`.
  Доверенные административные операции идут через `DATABASE_URL` напрямую
  (`src/db/client.ts`, `scripts/*.ts`), а не через привилегированную
  Postgres-роль Data API.
- **GRANTs управляются вручную через миграции** (`drizzle/0006_table_grants.sql`,
  `drizzle/0007_function_grants_and_hardening.sql`) — автоматическая широкая
  выдача прав на схему `public` при включении Data API **не** используется
  как источник правды; миграции переустанавливают минимальный набор
  явно.
- Прямые мутации таблиц запрещены — всё через `SECURITY DEFINER` RPC.

## 8. Drizzle

`src/db/schema/` — четыре enum и пять таблиц (см. ниже), источник истины для
форм/индексов/constraints/типов. `src/db/types.ts` — `$inferSelect`/`$inferInsert`
для каждой таблицы (заменяет удалённую Supabase-заглушку
`src/types/database.ts`). Сложные объекты (функции, триггеры, RLS, GRANT,
`SECURITY DEFINER`, hardening-проверки) — в отдельных hand-written SQL
custom-миграциях (`drizzle/0001`–`drizzle/0010`), не в TypeScript-строках.

```bash
npm run db:generate   # drizzle-kit generate — из схемы, без подключения к БД
npm run db:check      # drizzle-kit check — консистентность миграций
npm run db:migrate     # scripts/migrate.ts — применяет drizzle/*.sql по порядку
```

## 9. PostgreSQL RLS

Включён на всех пяти таблицах (`profiles`, `tickets`, `ticket_comments`,
`ticket_history`, а также `ticket_number_counters` — с нулём политик,
намеренно недостижима). RLS-хелперы (`is_admin()`, `can_access_ticket()`,
`can_view_profile()`) — `SECURITY DEFINER`, `SET search_path = ''`, читают
`auth.user_id()`. Полная модель — в
[`docs/migration/supabase-to-neon.md`](./docs/migration/supabase-to-neon.md)
и в комментариях самих миграций (`drizzle/0005_rls_policies.sql` и далее).

**Важная оговорка**: guard-условие в `guard_profile_mutation()` («разрешить
смену `role`/`is_active`, если запрос пришёл не через Data API») полагается
на то, что Neon Data API устанавливает GUC `request.jwt.claims` по тому же
соглашению, что и PostgREST/Supabase. Это **не проверено на настоящем Neon
Data API** в этой сессии — см. `drizzle/0001_security_helpers.sql` и
[«Риски»](#22-риски).

## 10. Роли

`employee` и `admin` (PostgreSQL enum `user_role`), без изменений от
прототипа. Админский интерфейс обработки заявок по-прежнему не реализован —
`admin_set_ticket_*` RPC существуют и защищены RLS/GRANT, но UI для них —
следующий этап.

## 11. Схема данных

`profiles.id` — **TEXT**, значение — Neon Auth user id (JWT `sub`), **не**
UUID и **не** внешний ключ на внутреннюю таблицу пользователей Neon Auth
(её структура не документирована как стабильный контракт). Связанные поля
(`tickets.author_id`/`assignee_id`/`updated_by`, `ticket_comments.author_id`,
`ticket_history.actor_id`) — тоже TEXT. ID самой заявки/комментария/истории
остаются UUID.

| Enum | Значения |
| --- | --- |
| `user_role` | `employee`, `admin` |
| `ticket_status` | `new`, `accepted`, `in_progress`, `waiting`, `resolved`, `closed`, `cancelled` |
| `ticket_priority` | `low`, `normal`, `high`, `critical` |
| `ticket_category` | `hardware`, `software`, `network`, `access`, `workplace`, `other` |

| Таблица | Назначение |
| --- | --- |
| `profiles` | Приложенческий профиль (`id` = Neon Auth user id) |
| `ticket_number_counters` | Внутренний счётчик атомарной нумерации (недостижим извне) |
| `tickets` | Заявки |
| `ticket_comments` | Комментарии к заявке |
| `ticket_history` | Append-only история изменений заявки |

## 12. RPC

Без изменений в наборе (имена функций сохранены), адаптированы под TEXT id и
`auth.user_id()`:

`generate_ticket_number()`, `create_ticket(...)`,
`is_valid_ticket_status_transition(...)`, `add_ticket_comment(...)`,
`cancel_own_ticket(...)`, `admin_set_ticket_status/priority/assignee/due_at(...)`,
`is_admin()`, `can_access_ticket(...)`, `can_view_profile(...)`,
`ensure_profile(...)` (новая — заменяет Supabase-триггер `handle_new_user()`),
`private.set_profile_role(...)` (админ bootstrap).

## 13. Миграции

`drizzle/` — 11 файлов: `0000` сгенерирован `drizzle-kit generate` из схемы
(enum/таблицы/индексы/constraints); `0001`–`0010` — hand-written custom SQL
(функции/триггеры/RLS/GRANT/hardening/provisioning), созданные через
`drizzle-kit generate --custom` и заполненные вручную. Подробности каждого
файла — в [«Что реально проверено»](#что-реально-проверено) ниже и в
комментариях самих файлов.

## 14. Локальный запуск

```bash
npm ci
cp .env.example .env.local   # заполните значениями своего Neon-проекта
npm run dev
```

Приложение будет доступно на [http://localhost:3000](http://localhost:3000).

## 15. Настройка Neon

1. Создайте Neon-проект и включите **Neon Auth** (Console → Auth) — скопируйте
   `NEON_AUTH_BASE_URL`, сгенерируйте `NEON_AUTH_COOKIE_SECRET`
   (`openssl rand -base64 32`, ≥32 символа).
2. Включите **Neon Data API** для нужной ветки (Console → Data API),
   выберите Managed Better Auth как auth provider. **Не** включайте
   автоматическую широкую выдачу прав на схему `public` — GRANTs управляются
   миграциями (`drizzle/0006`, `drizzle/0007`).
3. Скопируйте `NEON_DATA_API_URL`.
4. Возьмите `DATABASE_URL` (pooled, runtime) и `DATABASE_MIGRATION_URL`
   (unpooled, для Drizzle Kit/скриптов) из Connection Details.
5. Примените миграции: `npm run db:migrate`.
6. Проверьте подключение: `npm run db:check-connection`.
7. Для тестов создайте отдельную **development/disposable branch** (например
   `servicedesk-lite-dev`) — никогда не применяйте непроверенные миграции к
   production branch.

## 16. Создание Employee/Admin

Публичной регистрации нет. Тестовые аккаунты:

```bash
DEMO_EMPLOYEE_EMAIL=... DEMO_EMPLOYEE_PASSWORD=... \
DEMO_ADMIN_EMAIL=... DEMO_ADMIN_PASSWORD=... \
npm run db:create-demo-users
```

Идемпотентно, confirmation-gated (требует ввести `yes`), создаёт обоих через
`auth.signUp.email()` + `ensure_profile`, промоутит Admin Demo через
`private.set_profile_role`. Назначить admin существующему профилю по id
(id — из Neon Console → Auth → Users, это приложение не читает внутреннюю
таблицу пользователей Neon Auth напрямую):

```bash
npm run db:make-admin -- <neon-auth-user-id>
```

Реальные email/пароли **никогда** не попадают в Git.

## 17. Тесты

```bash
npm run lint
npm run typecheck
npm run test              # unit — Vitest
npm run build
npm run test:e2e           # smoke — всегда
npm run test:e2e:auth      # реальный Neon Auth E2E — только с E2E_* credentials
npm run test:e2e:employee  # реальный employee workflow E2E — только с credentials
npm run db:generate / db:check / db:migrate
npm run test:db            # SQL security/functional тесты — DATABASE_URL, disposable DB
```

### Что реально проверено

В этой сессии не было доступного Neon-проекта/credentials. Проверено
максимально честно тем, что было доступно:

| Команда | Результат |
| --- | --- |
| `npm run lint` | ✅ passed, 0 findings |
| `npm run typecheck` | ✅ passed, 0 errors |
| `npm run test` (Vitest) | ✅ 98/98 passed, 16 test files |
| `npm run build` (Next.js 16, Turbopack) | ✅ passed |
| `npm run test:e2e` (smoke) | ✅ 8/8 passed — запущено против настоящего `npm run dev` в этой сессии (см. ниже) |
| `npm run test:e2e:auth` / `test:e2e:employee` | ⏭ **skipped** — требуют реального Neon Auth/Data API, недоступного в этой сессии |
| Все 11 `drizzle/*.sql` миграций | ✅ применены с нуля на **настоящем локальном PostgreSQL 16** (установлен в этой сессии), включая оба hardening-DO-блока (`search_path`) |
| `neon/tests/security_assertions.sql` | ✅ passed на том же локальном PostgreSQL 16 |
| `neon/tests/functional_checks.sql` | ✅ passed (после исправления реальной ошибки, найденной при запуске — см. ниже) |
| `neon/tests/admin_bootstrap_checks.sql` | ✅ passed |
| `scripts/*.ts` (migrate/check-neon-connection/create-demo-users/make-admin) | Только `tsc --noEmit` — не выполнялись против реального Neon (нужен либо реальный Neon endpoint, либо `wsProxy` для `@neondatabase/serverless` против локального Postgres, что не настраивалось) |

При запуске smoke-тестов против настоящего `npm run dev` (без реального Neon —
только placeholder-env) обнаружился и был исправлен реальный regression:
`auth.middleware()` из установленной версии Neon Auth SDK не добавляет
`?next=` к своему redirect на `/login`, в отличие от Supabase-эры proxy.
`src/proxy.ts` теперь оборачивает `auth.middleware()` и сам переписывает
`Location` на `/login`, добавляя санитизированный `?next=` — после
исправления все 8 smoke-тестов, включая
`redirecting a protected path preserves it as a safe internal ?next=`,
проходят.

Не утверждается, что Neon Auth/Data API интеграция проверена «в реальности» —
только то, что вся SQL-модель (схема, RLS, GRANT, RPC, provisioning,
security/functional-тесты) реально работает на настоящем PostgreSQL 16 с той
же структурой, что получит настоящий Neon-проект, и что весь TypeScript-код
типобезопасен против реальных установленных версий `@neondatabase/*` пакетов.

## 18. Vercel

Задеплойте как обычный Next.js 16 проект. Переменные окружения — см.
`.env.example`; ни `DATABASE_URL`/`DATABASE_MIGRATION_URL`/`NEON_AUTH_COOKIE_SECRET`/
`NEON_API_KEY`, ни любые реальные credentials никогда не должны попадать в
репозиторий — только в Vercel Environment Variables / GitHub Secrets.
Не настраивалось и не проверялось в этой сессии (нет доступного
Neon-проекта/Vercel-аккаунта).

## 19. Security checklist

- `DATABASE_URL`/`DATABASE_MIGRATION_URL` — server-only, только Drizzle
  Kit/`scripts/*.ts`/SQL-тесты, никогда в пользовательском запросе.
- `NEON_AUTH_COOKIE_SECRET` — server-only, ≥32 символа (валидируется Zod,
  `src/lib/env/server.ts`).
- `NEON_API_KEY` — server-only, используется (когда используется) только в
  скриптах, не в рантайме приложения.
- JWT/session не логируются — `sanitizeError()` редактирует
  токены/cookie/пароли/authorization до записи в лог.
- Neon Data API используется с RLS — нет пути, где пользовательский запрос
  читает/пишет заявки в обход RLS.
- Широкие GRANT не выдаются автоматически — управляются миграциями.
- Публичная регистрация не представлена в интерфейсе (см.
  [раздел 6](#запрет-публичной-регистрации) про остаточный риск на уровне API).
- Admin назначается только доверенным скриптом (`private.set_profile_role`,
  недостижим через Data API).
- Прямые browser SQL-запросы отсутствуют — только `createDataApiClient()`
  (JWT + RLS) со стороны сервера.
- Реальные credentials не в Git — `.env.local` в `.gitignore`,
  `.env.example` содержит только пустые ключи.
- Старые Supabase-secrets не скопированы в новый `.env.local`/`.env.example`
  (переменные удалены полностью, не переименованы).

## 20. Статус Neon Auth Beta

**Neon Auth (Managed Better Auth) — официально Beta** на момент этой миграции
(июль 2026), заменившая устаревший Stack Auth-based Neon Auth. Реально
установленные пакеты (`@neondatabase/auth@0.4.2-beta`,
`@neondatabase/auth-ui@0.2.1-beta`, `@neondatabase/postgrest-js@0.2.0-beta`)
явно несут суффикс `-beta` в номере версии — это не косметика, а
подтверждение того, что API поверхность, механика сессий/токенов и
self-service signup controls менее зрелые и менее исчерпывающе
документированы, чем у GA Supabase Auth.

## 21. Ограничения

- Административный интерфейс обработки заявок намеренно не реализован.
- Интеграционная приёмка на настоящем Neon (Auth, Data API, RLS с реальными
  JWT) не выполнялась — нет было доступного проекта/credentials.
- Восстановление пароля и запрет публичной регистрации проверены только по
  документации/типам, не вживую.
- `scripts/*.ts` не выполнялись против реального Neon.

## 22. Риски

- **Beta Neon Auth/Data API** — см. [раздел 20](#20-статус-neon-auth-beta).
  API может измениться до GA.
- **`request.jwt.claims` GUC** — предположение, что Neon Data API использует
  то же соглашение, что PostgREST/Supabase, для admin-bootstrap-обхода в
  `guard_profile_mutation()`, не проверено вживую (см.
  `drizzle/0001_security_helpers.sql`).
- **JWT retrieval mechanism** (`auth.token()` / Better Auth JWT-плагин) для
  Data API — основано на реальных TypeScript-типах установленного SDK
  (`node_modules/@neondatabase/auth/dist/adapter-core-*.d.mts`), но не
  подтверждено end-to-end вызовом к настоящему Neon Data API.
- **Публичная регистрация через `/api/auth/sign-up/email` напрямую** — см.
  остаточный риск в [разделе 6](#запрет-публичной-регистрации).
- **`scripts/migrate.ts`** использует WebSocket-based `Client` из
  `@neondatabase/serverless`, который в проде подключается через Neon's
  WebSocket-прокси — против произвольного локального Postgres (без
  `wsProxy`) не тестировался.

## 23. План административной панели

Следующий этап после этой миграции — административная панель ServiceDesk
Lite на Neon: admin dashboard с реальными данными, общий реестр заявок,
назначение исполнителя, срок, приоритет, workflow статусов (RPC уже готовы:
`admin_set_ticket_*`), комментарии администратора, экспорт в CSV. Не
начинается до отдельной команды.

## Структура проекта

```text
src/
├── proxy.ts                 # auth.middleware(), matcher: /app/**, /admin/**
├── app/
│   ├── (auth)/{login,forgot-password,reset-password}/
│   ├── api/auth/[...path]/  # auth.handler() — весь Neon Auth трафик
│   ├── app/                 # кабинет сотрудника (requireEmployee)
│   ├── admin/                # администрирование (requireAdmin)
│   └── unauthorized/
├── db/
│   ├── client.ts             # привилегированный Drizzle-клиент (DATABASE_URL)
│   ├── schema/                # enums, profiles, tickets, ticket-comments, ticket-history
│   └── types.ts               # $inferSelect/$inferInsert
├── lib/
│   ├── auth/{server,client}.ts   # Neon Auth
│   ├── neon/data-api.ts          # Neon Data API клиент (JWT + RLS)
│   ├── env/{client,server}.ts
│   └── logger/
├── features/
│   ├── auth/                 # schema, redirect, access-decision, roles, server/, actions/
│   └── tickets/               # schemas, types, utils, queries/, actions/, components/
└── test/setup.ts
e2e/
drizzle/                       # 0000 (generated) + 0001-0010 (custom SQL)
neon/tests/                    # security_assertions, functional_checks, admin_bootstrap_checks
scripts/                       # migrate, check-neon-connection, create-demo-users, make-admin, run-sql-tests
docs/
├── migration/
│   ├── supabase-to-neon.md    # полная карта замены компонентов
│   └── neon-migration.md      # обзор и последовательность миграции
├── database.md                 # legacy: дизайн Supabase-прототипа (не обновлялся)
└── security.md                  # legacy: дизайн Supabase-прототипа (не обновлялся)
```

## Демонстрация

- **Live demo:** _будет добавлено после развёртывания на Vercel_.
- **Скриншоты / демо-видео:** _будут добавлены после интеграционной приёмки
  на реальном Neon-проекте_.
