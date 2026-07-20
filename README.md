# ServiceDesk Lite

Внутренняя система регистрации и обработки технических заявок сотрудников.

> **Репозиторий:** этот код перенесён из `ServiceDesk-Lite`
> (ветка `claude/servicedesk-lite-stage-1-hzf7vf`, `67d09de`) в
> `ServiceDesk-Lite.1` с сохранением полной Git-истории. Репозиторий
> предназначен для дальнейшей разработки в сторону Neon; сам перенос —
> подготовительный шаг и **не меняет** текущую реализацию на Supabase
> (см. [`docs/migration-neon.md`](./docs/migration-neon.md)).

> **Статус:** Этап 4 частично завершён: реализация готова, интеграционная
> приёмка ожидает development Supabase. Кабинет сотрудника (dashboard,
> список заявок, создание, карточка заявки с комментариями/историей, отмена
> собственной заявки) полностью реализован поверх RPC/RLS этапа 2 и
> Supabase Auth этапа 3, покрыт unit-тестами. В этой среде разработки
> по-прежнему нет доступного development-проекта Supabase (см.
> [«Реальный Supabase в этой сессии»](#реальный-supabase-в-этой-сессии)),
> поэтому реальный Auth E2E и Employee E2E **не запускались** — это не
> считается пройденным. Подробности — в разделе
> [«Текущий статус проекта»](#текущий-статус-проекта) и в
> [`docs/database.md`](./docs/database.md) / [`docs/security.md`](./docs/security.md).

## Бизнес-проблема

В компании заявки на техническую поддержку (проблемы с оборудованием, ПО,
сетью, доступами, рабочим местом) обрабатываются бессистемно: через чаты,
устные просьбы и разрозненные таблицы. Это приводит к потере заявок,
отсутствию приоритизации и невозможности отследить, кто и когда решил
проблему.

## Решение

ServiceDesk Lite — лёгкое внутреннее веб-приложение, в котором сотрудник
может быстро создать заявку с категорией и приоритетом, отследить её статус,
а служба поддержки — видеть единый реестр всех обращений и управлять ими.

## Будущие роли

| Роль | Возможности (план) |
| --- | --- |
| Сотрудник | Создание заявок, просмотр статуса своих обращений |
| Исполнитель / служба поддержки | Просмотр реестра заявок, взятие в работу, смена статуса |
| Администратор | Полный доступ к реестру, управление заявками и пользователями |

Проверка ролей и авторизация появятся на следующих этапах.

## Планируемый основной сценарий

1. Сотрудник входит в систему под корпоративной учётной записью.
2. Создаёт заявку: тема, описание, категория, приоритет.
3. Заявка получает номер и статус «Открыта».
4. Служба поддержки видит заявку в реестре, берёт её в работу.
5. Сотрудник отслеживает статус заявки в своём кабинете до её закрытия.

## Технологический стек

- [Next.js](https://nextjs.org/) (App Router) + [React](https://react.dev/)
- TypeScript (строгий режим)
- [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
- [Lucide Icons](https://lucide.dev/)
- [Supabase](https://supabase.com/) (`@supabase/ssr`, `@supabase/supabase-js`)
- [React Hook Form](https://react-hook-form.com/) + [Zod](https://zod.dev/)
- [Vitest](https://vitest.dev/) + Testing Library — unit-тесты
- [Playwright](https://playwright.dev/) — e2e/smoke-тесты
- ESLint
- GitHub Actions — CI

## Архитектура

- **`src/app`** — маршруты Next.js App Router: публичные страницы, кабинет
  сотрудника (`/app/**`), администрирование (`/admin/**`).
- **`src/features`** — доменная логика по фичам (`auth`, `tickets`):
  Zod-схемы, серверные запросы, Server Actions, формы, справочники — см.
  разбор `features/tickets` ниже.
- **`src/components/ui`** — примитивы shadcn/ui.
- **`src/components/layout`** — переиспользуемые элементы каркаса (header,
  sidebar, контейнер страницы).
- **`src/lib/supabase`** — четыре изолированных клиента/хелпера Supabase:
  `browser` (Client Components), `server` (Server Components/Actions/Route
  Handlers, cookie-based сессия), `proxy` (обновление auth-cookie в
  `src/proxy.ts`), `admin` (только сервер, service-role, всё ещё нигде не
  используется в UI).
- **`src/proxy.ts`** — Next.js 16 Proxy (замена устаревшего `middleware.ts`):
  обновляет Supabase-cookies и делает быстрый предварительный redirect
  неавторизованных посетителей `/app/**`/`/admin/**` на `/login`. Это не
  единственный уровень авторизации — см.
  [«Serverная повторная проверка роли»](#серверная-повторная-проверка-роли).
- **`src/features/auth`** — вся логика авторизации:
  - `schema.ts` — Zod-схемы (login, восстановление пароля);
  - `redirect.ts` — чистые, юнит-тестируемые функции безопасного redirect
    (`sanitizeNextPath`, `resolveRedirectTarget`);
  - `access-decision.ts` — чистые решения доступа (`decideUserAccess`,
    `decideRoleAccess`), тоже без обращения к Supabase;
  - `roles.ts` — русские названия ролей;
  - `server/` — серверные (`import "server-only"`) хелперы идентичности:
    `get-current-user`, `get-current-profile`, `require-user`,
    `require-employee`, `require-admin`, `redirect-by-role`;
  - `actions/` — Server Actions: `login`, `logout`,
    `request-password-reset`, `update-password`.
- **`src/features/tickets`** — кабинет сотрудника, разложенный по назначению
  файла, а не по странице:
  - `schemas/` — Zod: `create-ticket` (создание), `list-query` (whitelisted
    `q`/`status`/`sort`/`page`/`pageSize`), `comment`, `ticket-id` (UUID);
  - `types/ticket.ts` — доменные типы (`TicketListItem`, `TicketDetail`,
    `TicketCommentItem`, `TicketHistoryItem`, `EmployeeDashboardCounts`);
  - `utils/` — чистые функции без обращения к Supabase: русские подписи
    (`labels.ts`), форматирование дат, форматирование истории
    (`history-format.ts`, никогда не печатает «сырой» UUID), безопасные
    сообщения об ошибках (`error-messages.ts`, фиксированные строки,
    независимые от текста ошибки Supabase), решение «можно ли отменить»
    (`can-cancel-ticket.ts`), агрегация дашборда (`dashboard-counts.ts`);
  - `queries/` — только `import "server-only"`, только серверный
    Supabase-клиент с сессией пользователя (`get-employee-dashboard`,
    `get-employee-tickets`, `get-employee-ticket`);
  - `actions/` — Server Actions (`create-ticket`, `add-ticket-comment`,
    `cancel-ticket`) — каждая вызывает `requireEmployee()`, повторно
    валидирует вход через Zod и мутирует только через RPC;
  - `components/` — презентационные React-компоненты (бейджи, таблица
    заявок, фильтры, пагинация, форма создания, карточка заявки,
    комментарии, история, кнопка отмены с диалогом подтверждения).
- **`src/lib/env`** — Zod-валидация переменных окружения с разделением на
  публичные (`client.ts`) и серверные (`server.ts`).
- **`src/lib/logger`** — структурированный серверный logger с санитизацией
  ошибок (никаких токенов, cookie или паролей в логах).
- **`supabase/migrations`** — 13 последовательных SQL-миграций: enum,
  таблицы, ограничения/индексы, автосоздание профиля, security-helpers,
  атомарная нумерация заявок, workflow заявок и история изменений,
  RPC-мутации, RLS, табличные и функциональные GRANT, безопасный admin
  bootstrap (12), видимость профиля исполнителя/автора комментария на
  собственной заявке через `can_view_profile()` (13, этап 4 — RLS-политика
  `profiles` изначально не пускала сотрудника увидеть имя исполнителя своей
  же заявки). Подробности — в [`docs/database.md`](./docs/database.md).
- **`supabase/tests`** — `security_assertions.sql` (статический аудит
  RLS/GRANT/`search_path`) и `functional_checks.sql` (сквозные проверки
  нумерации, переходов статусов, истории, неизменяемых полей).

## Текущий статус проекта

После этапа 4:

- ✅ Кабинет сотрудника полностью реализован: dashboard с четырьмя реальными
  счётчиками из одного запроса, список собственных заявок с поиском/
  фильтром/сортировкой/пагинацией (валидируется Zod, безопасные значения по
  умолчанию вместо ошибок SQL), создание заявки только через RPC
  `create_ticket`, карточка заявки (данные+автор+исполнитель+комментарии+
  история), комментарии только через `add_ticket_comment`, отмена только
  через `cancel_own_ticket`.
- ✅ Новая миграция `202607190013_profile_visibility_for_related_tickets.sql`
  и `can_view_profile()` — сотрудник видит имя исполнителя/автора
  комментария/актора истории только на **своей** заявке, RLS-политика
  `profiles` заменена (миграции 001–012 не редактировались).
- ✅ Существование чужой заявки не раскрывается: несуществующий и чужой id
  дают одинаковый `notFound()` — RLS `tickets_select_own_or_admin` делает эти
  два случая неразличимыми на уровне запроса, а не только в UI.
- ✅ Отмена заявки: кнопка скрыта не для статуса `new`, но реальная защита —
  проверка `author_id`+`status = 'new'` внутри `cancel_own_ticket` — на
  сервере, а не в интерфейсе.
- ✅ Все мутации — только через RPC (`create_ticket`, `add_ticket_comment`,
  `cancel_own_ticket`), ни одного прямого `.insert()`/`.update()` на
  `tickets`/`ticket_comments`.
- ✅ Пользователю никогда не показывается текст SQL-ошибки, имя политики,
  JWT/cookie или чужой UUID — фиксированные русские сообщения
  (`utils/error-messages.ts`), сырые ошибки только в серверном логе после
  санитизации (`sanitizeError`).
- ✅ Новые события логирования: `tickets:dashboard_failed`,
  `tickets:list_failed`, `tickets:create_failed`, `tickets:detail_failed`,
  `tickets:comment_failed`, `tickets:history_failed`, `tickets:cancel_failed`
  — без полного текста комментария/описания заявки.
- ✅ 101 unit-тест (Vitest) покрывает Zod-схемы, whitelists (`sort`,
  `pageSize`), лимит длины поиска, UUID-схему, форматирование статуса/
  категории/приоритета/истории, агрегацию dashboard, решение об отмене,
  безопасность сообщений об ошибках.
- ⚠️ **Реальный Supabase Auth E2E и Employee E2E не запускались** — в этой
  среде разработки по-прежнему нет доступного development-проекта Supabase
  (см. [«Реальный Supabase в этой сессии»](#реальный-supabase-в-этой-сессии)).
  `npm run test:e2e:employee` существует и самостоятельно помечает все
  тесты skipped без credentials — это не считается «пройдено».
- ⚠️ Реальные тестовые пользователи Employee/Admin не создавались, реальные
  миграции 001–013 не применялись к development-проекту, RLS с настоящими
  JWT двух разных сотрудников не проверялась — всё это заблокировано
  отсутствием доступного Supabase, не пропущено произвольно.
- ❌ TypeScript-типы базы (`src/types/database.ts`) — всё ещё честная
  заглушка, генерация ждёт доступности реального/локального Supabase.
- ❌ Администраторский интерфейс обработки заявок **намеренно не
  реализован** в этом этапе — задача следующего этапа.

Проверено локально (native PostgreSQL 16, без реального Supabase — см.
[docs/database.md](./docs/database.md)): миграции 001–013 применяются с
нуля без ошибок, `security_assertions.sql`/`functional_checks.sql`/
`admin_bootstrap_checks.sql` проходят, а также отдельная проверка
`can_view_profile()` (сотрудник видит исполнителя/комментатора **только**
на своей заявке, не видит их на чужой, и наоборот — исполнитель не видит
автора только по факту назначения).

<details>
<summary>История: статус после этапа 3</summary>

После этапа 3:

- ✅ Next.js-проект собирается, проходит lint/typecheck/unit-тесты (этап 1).
- ✅ Полная SQL-схема, RLS, GRANT, RPC-only мутации (этап 2).
- ✅ Настоящий вход/выход через Supabase Auth (`signInWithPassword`,
  `signOut`), cookie-based SSR-сессия через `@supabase/ssr`.
- ✅ `src/proxy.ts` обновляет auth-cookie и делает предварительный redirect;
  `requireEmployee()`/`requireAdmin()` в layout'ах повторно проверяют
  identity и роль на сервере при каждом запросе — Proxy им не доверяется.
- ✅ Роль берётся исключительно из `public.profiles.role` (никогда из формы,
  cookie, `raw_user_meta_data` или `app_metadata`).
- ✅ Неактивный профиль и отсутствующий профиль блокируются на сервере.
- ✅ Восстановление пароля: `/forgot-password` → `resetPasswordForEmail` →
  `/auth/callback` → `/reset-password` → `updateUser`.
- ✅ Безопасный redirect (`?next=`): allow-list `/app`/`/admin`, роль имеет
  приоритет над запрошенным путём — покрыто unit-тестами.
- ✅ Admin bootstrap больше не требует отключения триггеров — новая миграция
  `202607190012_admin_bootstrap_hardening.sql` + `private.set_profile_role()`
  (см. [«Безопасное назначение admin»](#безопасное-назначение-admin)).
- ✅ Header/sidebar показывают реальные `full_name`/роль/`department` —
  никаких UUID, токенов или служебных claims в Client Component.
- ✅ Публичной регистрации нет и не было.
- ⚠️ Реальный Supabase Auth E2E **не запускался** — в этой среде разработки
  нет доступного development-проекта Supabase. Всё реализовано и покрыто
  unit- и smoke-тестами; см.
  [«Реальный Supabase в этой сессии»](#реальный-supabase-в-этой-сессии).
- ❌ Реестр заявок ещё не подключён к базе — везде статичные заглушки/нули
  (следующий этап).
- ❌ TypeScript-типы базы (`src/types/database.ts`) — всё ещё заглушка,
  генерация ждёт доступности реального/локального Supabase.

Интерфейс отражает будущую структуру приложения; авторизация и база данных
полностью готовы и защищены, но список/создание заявок в интерфейсе ещё не
подключены к базе.

</details>

## Локальный запуск

```bash
npm ci
cp .env.example .env.local   # заполните значениями своего проекта Supabase
npm run dev
```

Приложение будет доступно на [http://localhost:3000](http://localhost:3000).

### Локальный запуск базы данных (Supabase)

```bash
supabase start                # поднимает Postgres/Auth/PostgREST/Studio локально
supabase db reset              # применяет все миграции + supabase/seed.sql с нуля
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security_assertions.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/functional_checks.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/admin_bootstrap_checks.sql
supabase gen types typescript --local > src/types/database.ts
```

### Подключение отдельного development-проекта Supabase

Никогда не используйте production-проект для разработки/тестов. Чтобы
подключить отдельный dev-проект (это не было выполнено в данной сессии —
см. [«Реальный Supabase в этой сессии»](#реальный-supabase-в-этой-сессии)):

```bash
supabase login                          # интерактивная авторизация CLI
supabase link --project-ref <dev-ref>   # связать репозиторий с dev-проектом, НЕ с production
supabase db push                        # применить supabase/migrations/*.sql к dev-базе
supabase gen types typescript --linked > src/types/database.ts
```

`supabase db push` только добавляет ещё не применённые миграции по
порядку файлов — он не трогает существующие данные и не аналогичен
`supabase db reset` (который есть смысл гонять только локально). Тестовых
пользователей Employee/Admin создавайте только через Dashboard →
Authentication → Users или доверенный не-HTTP скрипт (см.
[«Создание тестовых пользователей»](#создание-тестовых-пользователей)) —
специальный HTTP-роут вида `/api/create-user` в этом проекте не
предусмотрен и не должен появляться.

Подробности, включая точную схему, RPC, модель RLS/GRANT и честную оговорку
о том, что было реально проверено локально в среде разработки — в
[`docs/database.md`](./docs/database.md).

## Авторизация (Supabase Auth)

### Устройство SSR-сессии

- **`src/lib/supabase/browser.ts`** — только для Client Components,
  которым реально нужен browser SDK. Никогда не используется для
  серверной проверки роли.
- **`src/lib/supabase/server.ts`** — cookie-based клиент для Server
  Components/Actions/Route Handlers, создаётся заново на каждый request
  (`await cookies()`, Next.js 16 async API). Корректно проглатывает ошибку
  записи cookie из Server Component (запись всё равно произойдёт позже — в
  Server Action/Route Handler или на следующем request через Proxy).
- **`src/lib/supabase/proxy.ts`** — используется только `src/proxy.ts`:
  обновляет auth-cookie через `getAll`/`setAll` и переносит их в response.
- **`src/lib/supabase/admin.ts`** — service-role, `import "server-only"`.
  На этом этапе **не используется** для обычного логина, проверки роли,
  чтения профиля или рендера employee/admin страниц — единственное
  допустимое использование, ещё не реализованное, — разовый
  не-HTTP setup-скрипт (см. ниже).

Идентичность проверяется через `supabase.auth.getClaims()` (верифицирует
JWT — локально по JWKS либо запросом к Auth-серверу), а не через
`supabase.auth.getSession()`, которая может вернуть локально
закэшированную сессию без подтверждения её валидности сервером.

### Proxy (`src/proxy.ts`)

> Proxy обновляет сессию и выполняет предварительную маршрутизацию, но не
> заменяет серверную проверку доступа в layout, Server Action и Route
> Handler.

Proxy (замена устаревшего `middleware.ts` в Next.js 16) на каждый
не-статический запрос:

1. обновляет Supabase auth-cookies (`updateSession`);
2. дешёво (без запроса к `public.profiles`) редиректит анонимного
   посетителя `/app/**` или `/admin/**` на `/login?next=...`.

Матчер исключает `_next/static`, `_next/image`, `favicon.ico` и
статические файлы. Proxy **не решает**, employee это или admin — это
требует чтения `public.profiles` и повторно проверяется в
`src/app/app/layout.tsx` / `src/app/admin/layout.tsx` через
`requireEmployee()`/`requireAdmin()` при каждом запросе к этим разделам.

### Маршруты

| Раздел | Пути | Защита |
| --- | --- | --- |
| Публичные | `/`, `/login`, `/forgot-password`, `/auth/callback`, `/reset-password`, `/unauthorized` | нет |
| Сотрудник | `/app`, `/app/tickets`, `/app/tickets/new`, `/app/tickets/[id]` | `requireEmployee()` в `src/app/app/layout.tsx` |
| Администратор | `/admin`, `/admin/tickets` | `requireAdmin()` в `src/app/admin/layout.tsx` |

Активный авторизованный пользователь, открывший `/login`, перенаправляется
в свой раздел (без циклов) — проверено на сервере в `src/app/(auth)/login/page.tsx`.

### Создание тестовых пользователей

Публичной регистрации нет и не будет. Чтобы создать Employee Demo и Admin
Demo:

1. Supabase Dashboard → Authentication → Users → создать двух
   пользователей (email/пароль).
2. Убедиться, что `handle_new_user()` создал им `public.profiles`
   (роль по умолчанию — `employee`).
3. Employee Demo оставить как есть.
4. Admin Demo — назначить роль безопасным скриптом (см. ниже).
5. Убедиться, что `is_active = true` у обоих.

Реальные email/пароли **никогда** не попадают в Git — ни в этот README, ни
в `.env.example`, ни в тестовые файлы.

### Безопасное назначение admin

Стадия 2 использовала `SET session_replication_role = replica` — этот
способ **удалён** из документации и из основного процесса. Начиная с этапа
3:

- новая миграция `supabase/migrations/202607190012_admin_bootstrap_hardening.sql`
  создаёт закрытую схему `private` (без `USAGE` для
  `PUBLIC`/`anon`/`authenticated`/`service_role` — Data API не может даже
  разрешить имя `private.*`, не говоря об `EXECUTE`);
- `private.set_profile_role(user_id, role)` — не `SECURITY DEFINER`,
  дополнительно сама проверяет `current_user`, требует существования
  `auth.users`/`public.profiles`, меняет только `role`;
- `public.guard_profile_mutation()` обновлена: изменение `role`/`is_active`
  разрешено, если сессия уже admin **или** запрос пришёл не через Data API
  (нет GUC `request.jwt.claims` вообще) — это распознаёт именно прямую
  доверенную сессию (`psql`, Supabase Studio SQL Editor), а не HTTP-запрос;
  отключать триггеры для этого не требуется.

Назначение:

```bash
psql "$DATABASE_URL" -v target_email="'demo.admin@example.com'" \
  -f supabase/scripts/make_admin.sql
```

или вставить содержимое `supabase/scripts/make_admin.sql` в Supabase
Studio SQL Editor, заменив плейсхолдер email. Файл никогда не должен
содержать реальный email в Git.

SQL-проверки механизма — `supabase/tests/admin_bootstrap_checks.sql`
(authenticated/anon/service_role не могут вызвать функцию; обычный
пользователь не может сменить свою роль; DB owner может назначить admin;
повторный вызов идемпотентен).

### Восстановление пароля

1. `/forgot-password` → Server Action вызывает
   `resetPasswordForEmail(email, { redirectTo: .../auth/callback?next=/reset-password })`.
   Ответ всегда нейтральный: «Если учётная запись существует, инструкция
   отправлена на указанный email» — независимо от того, существует ли
   email или была ли ошибка.
2. `/auth/callback` (Route Handler) обменивает `code` на сессию
   (`exchangeCodeForSession`) и редиректит только на путь из
   allow-list (`/reset-password` или `/app`/`/admin`).
3. `/reset-password` требует уже установленной recovery-сессии (иначе —
   redirect на `/forgot-password`) и вызывает `updateUser({ password })`.

Ограничения SMTP: Supabase Free/локальный стек имеет строгие лимиты и
собственный (не production-ready) email-провайдер по умолчанию — реальная
доставка писем в этой сессии не проверялась (нет доступного
development-проекта, см. ниже). В продакшене настройте собственный SMTP в
Supabase Dashboard → Authentication → SMTP Settings.

### Настройка Supabase Dashboard (redirect URLs)

В Authentication → URL Configuration development-проекта укажите:

- **Site URL**: `NEXT_PUBLIC_SITE_URL` (например, `http://localhost:3000`
  локально);
- **Redirect URLs**: добавить `<SITE_URL>/auth/callback` (подставив
  реальный `NEXT_PUBLIC_SITE_URL`), и продакшен-домен, когда он появится.

Без этого `resetPasswordForEmail`/`exchangeCodeForSession` будут отклонены
Supabase.

### Локальные E2E

```bash
npm run test:e2e           # всегда: /login, /forgot-password, protected-redirect, open-redirect
npm run test:e2e:auth      # реальный Supabase Auth — только с credentials, см. ниже
npm run test:e2e:employee  # реальный workflow кабинета сотрудника — только с credentials
```

`test:e2e:auth` (`e2e/auth.spec.ts`) требует четырёх переменных окружения
(**никогда не в Git** — только локальный shell или GitHub Secrets):

```text
E2E_EMPLOYEE_EMAIL
E2E_EMPLOYEE_PASSWORD
E2E_ADMIN_EMAIL
E2E_ADMIN_PASSWORD
```

`test:e2e:employee` (`e2e/employee.spec.ts`) требует только пару
`E2E_EMPLOYEE_EMAIL`/`E2E_EMPLOYEE_PASSWORD` и проверяет создание заявки,
поиск в списке, комментарий и отмену собственной новой заявки. Каждая
созданная им заявка называется с префиксом `E2E:` — чтобы её потом было
легко найти и удалить вручную; сам тест никогда не очищает базу и не
меняет роль Admin-аккаунта.

Если хотя бы одна из нужных переменных отсутствует, каждый тест в
соответствующем файле явно помечается **skipped** (не passed) с понятной
причиной — так и должно быть, если development-проект Supabase недоступен.

### Политика demo/test credentials

- Ни один реальный email или пароль никогда не коммитится — ни в код, ни в
  `.env.example`, ни в тесты, ни в этот README.
- `.env.local`, реальные ключи Supabase и учётные данные тестовых
  пользователей — только в локальной среде или secret-хранилище CI.
- Плейсхолдеры (`demo.admin@example.com` и подобные) в `make_admin.sql` —
  безопасные примеры, не настоящие адреса.

### Реальный Supabase в этой сессии

В этой среде разработки (этапы 2–4) по-прежнему нет заполненных
`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/
`SUPABASE_SERVICE_ROLE_KEY`, нет сохранённого `supabase login`-токена
(`npx supabase projects list` возвращает `LegacyPlatformAuthRequiredError`)
и нет работающего Docker (см. `docs/database.md`), поэтому на этапе 4:

- **Проверено** (без реального Supabase, на native PostgreSQL 16 +
  самодельная заглушка схемы `auth`, как на этапах 2–3): миграции 001–013
  применяются с нуля без ошибок; `security_assertions.sql`,
  `functional_checks.sql`, `admin_bootstrap_checks.sql` проходят; отдельная
  ad hoc проверка `can_view_profile()` подтверждает, что сотрудник видит
  исполнителя/комментатора только на своей заявке и не видит их на чужой;
  `npm run lint`/`typecheck`/`test`/`build` проходят; `npm run test:e2e`
  проходит (общие smoke-проверки); при отсутствии credentials
  `test:e2e:auth` и `test:e2e:employee` корректно помечают все тесты
  skipped, а не failed.
- **Не проверено на настоящем Supabase**: реальный development-проект не
  подключался; реальные тестовые пользователи Employee/Admin не
  создавались; миграции не применялись через `supabase db push`/Dashboard
  к удалённой базе; `npm run test:e2e:auth` и `npm run test:e2e:employee`
  не запускались «по-настоящему» (только подтверждено корректное
  поведение skip); GoTrue/PostgREST с реальными пользовательскими JWT двух
  разных сотрудников (Employee A/B) не проверялись; `supabase gen types
  typescript --linked` не запускался, `src/types/database.ts` остаётся
  честной заглушкой.

Всё остальное — код, RLS/GRANT-модель, unit-тесты, статические
SQL-проверки — реализовано и проверено всем, чем можно проверить без
реального проекта. Не утверждается, что кабинет сотрудника работает «в
проде» — только то, что он реализован по спецификации и покрыт всем, что
можно покрыть без реального Supabase.

## Кабинет сотрудника

Реализован полностью поверх RPC/RLS этапа 2 и Supabase Auth этапа 3.
Административный интерфейс обработки заявок в этот этап намеренно не
входит.

### Dashboard (`/app`)

Четыре счётчика (Открытые = `new`+`accepted`, В работе = `in_progress`,
Ожидающие = `waiting`, Завершённые = `resolved`+`closed`+`cancelled`) —
из **одного** запроса `select("status")`, агрегация — чистая функция
`bucketDashboardCounts()`, покрыта unit-тестами отдельно от Supabase.

### Список заявок (`/app/tickets`)

- Колонки: номер, тема, категория, приоритет, статус, дата создания,
  исполнитель; адаптивно — таблица на `sm+`, карточки на мобильных.
- Поиск (`q`, по `public_number`/`title`, регистронезависимо, до 120
  символов), фильтр по статусу, сортировка (`newest`/`oldest`), пагинация
  (`pageSize` из `{10, 20, 50}`, по умолчанию 10) — всё через
  `ticketListQuerySchema` (Zod), каждое поле имеет безопасное значение по
  умолчанию (`.catch(...)`) вместо ошибки при некорректном `?sort=`/
  `?pageSize=`/`?page=` в URL. `sort` и `pageSize` — закрытые перечисления,
  так что из URL никогда не попадает произвольное имя столбца.
- Поиск использует `.or()` query builder'а Supabase, а не ручную
  конкатенацию SQL-строк; значение экранируется от мета-символов
  PostgREST (`,`, `(`, `)`, `"`), а не только от SQL-инъекции.
- Имя исполнителя получено одним embedded-запросом
  (`profiles!tickets_assignee_id_fkey`) — не по одному запросу на строку.

### Создание заявки (`/app/tickets/new`)

Server Action (`actions/create-ticket.ts`) вызывает `requireEmployee()`,
заново валидирует `FormData` через `createTicketSchema` (Zod) и создаёт
заявку **только** через RPC `create_ticket` — никогда не принимает
`author_id`/`public_number`/`status`/`assignee_id`/`created_at` от клиента
(этих полей физически нет в схеме). После успеха — `revalidatePath` и
redirect на `/app/tickets/[id]`.

### Карточка заявки (`/app/tickets/[id]`)

- `id` валидируется как UUID (Zod) до похода в базу.
- Один запрос на саму заявку (с именами автора/исполнителя через embed) +
  отдельный запрос на комментарии + отдельный на историю — это не N+1
  (недопустим только embed на **каждую строку списка**, отдельные запросы
  на связанные коллекции одной заявки — предусмотренный вариант).
- Несуществующая заявка и чужая заявка дают одинаковый `notFound()` —
  RLS `tickets_select_own_or_admin` делает эти случаи неразличимыми уже на
  уровне запроса, странице неоткуда узнать разницу.
- Комментарии — только через RPC `add_ticket_comment` (1–3000 символов,
  обрезка пробелов), хронологический порядок, автор+роль+дата+текст.
- История — из `ticket_history`, тот же хронологический порядок, русские
  описания событий (`utils/history-format.ts`), «Системное действие» для
  отсутствующего актора, никогда не отображает «сырой» UUID
  (`assignee_changed` резолвится в имя одним batch-запросом к `profiles`,
  а не по одному запросу на историческую запись).
- Текст комментария/события истории всегда выводится как обычный текст
  JSX (React экранирует по умолчанию) — никогда через
  `dangerouslySetInnerHTML`.
- Отмена — только через RPC `cancel_own_ticket`, кнопка показана только
  при `status = 'new'`, но реальная защита (владелец + статус) — внутри
  самой RPC-функции; диалог подтверждения обязателен перед вызовом.

## Переменные окружения

См. `.env.example`.

| Переменная | Где используется | Обязательна |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Публично, клиент и сервер | Да |
| `NEXT_PUBLIC_SUPABASE_URL` | Публично, клиент и сервер | Да |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Публично, клиент и сервер | Да |
| `SUPABASE_SERVICE_ROLE_KEY` | Только сервер, только `lib/supabase/admin.ts` | Нет (нужна только когда реально вызывается admin-клиент) |

Переменные валидируются через Zod (`src/lib/env/client.ts`,
`src/lib/env/server.ts`). Секретный `SUPABASE_SERVICE_ROLE_KEY` недоступен
клиентскому коду и не требуется для production-сборки, пока admin-клиент не
вызывается.

## Команды проверки

```bash
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit
npm run test          # unit-тесты (Vitest)
npm run test:watch    # unit-тесты в watch-режиме
npm run build         # production-сборка Next.js
npm run test:e2e           # smoke-тесты Playwright, всегда выполняются
npm run test:e2e:auth      # реальные Auth E2E — только с E2E_* credentials, иначе skipped
npm run test:e2e:employee  # реальный workflow кабинета сотрудника — только с credentials, иначе skipped
```

Проверки SQL-схемы (требуют локального Supabase/Postgres — см. выше):

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security_assertions.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/functional_checks.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/admin_bootstrap_checks.sql
```

## Структура проекта

```text
src/
├── proxy.ts               # Next.js 16 Proxy — cookie refresh + pre-redirect
├── app/                   # маршруты App Router
│   ├── (auth)/
│   │   ├── login/
│   │   ├── forgot-password/
│   │   └── reset-password/
│   ├── auth/callback/     # Route Handler: exchangeCodeForSession
│   ├── app/               # кабинет сотрудника (layout + requireEmployee)
│   ├── admin/             # администрирование (layout + requireAdmin)
│   └── unauthorized/
├── components/
│   ├── layout/            # header (реальный профиль+logout), sidebar, breadcrumb
│   └── ui/                 # примитивы shadcn/ui (+ dialog.tsx, этап 4)
├── config/                # site.ts, navigation.ts
├── features/
│   ├── auth/              # schema, redirect, access-decision, roles,
│   │   ├── server/        #   server/ (identity+role, server-only),
│   │   └── actions/       #   actions/ (Server Actions: login/logout/…)
│   └── tickets/           # кабинет сотрудника (этап 4)
│       ├── schemas/       #   create-ticket, list-query, comment, ticket-id (Zod)
│       ├── types/         #   доменные типы (ticket.ts)
│       ├── utils/         #   labels, форматирование дат/истории, error-messages,
│       │                  #   can-cancel-ticket, dashboard-counts — без Supabase
│       ├── queries/       #   server-only, серверная сессия, никогда admin-клиент
│       ├── actions/       #   Server Actions: create/comment/cancel — RPC-only
│       └── components/    #   бейджи, таблица, фильтры, пагинация, формы, история
├── lib/
│   ├── env/               # Zod-валидация env (client/server)
│   ├── logger/            # серверный logger + санитизация ошибок
│   ├── supabase/          # browser/server/proxy/admin клиенты
│   └── utils.ts
├── types/database.ts      # заглушка под сгенерированные Supabase-типы
└── test/setup.ts          # настройка Vitest
e2e/
├── smoke.spec.ts           # всегда выполняется
├── auth.spec.ts            # реальный Supabase Auth — skip без credentials
└── employee.spec.ts        # реальный workflow кабинета сотрудника — skip без credentials
supabase/
├── config.toml
├── migrations/            # 13 последовательных SQL-миграций (см. docs/database.md)
├── scripts/make_admin.sql # owner-only назначение admin (плейсхолдер email)
├── seed.sql               # идемпотентный, без production-учётных записей
└── tests/
    ├── security_assertions.sql    # статический аудит RLS/GRANT/search_path
    ├── functional_checks.sql      # сквозные проверки нумерации/статусов/истории
    └── admin_bootstrap_checks.sql # проверки private.set_profile_role
docs/
├── database.md            # схема, RPC, RLS/GRANT модель, миграции, локальный запуск
└── security.md             # матрица прав, чек-лист hardening, известные ограничения
```

## План этапов

- **Этап 1:** технический фундамент — Next.js, UI-каркас, Supabase-клиенты,
  env-валидация, logger, тесты, CI.
- **Этап 2:** SQL-схема Supabase, миграции, RLS-политики, GRANT,
  RPC `create_ticket`/`add_ticket_comment`/`cancel_own_ticket`/
  `admin_set_ticket_*`, атомарный генератор номера заявки, централизованные
  переходы статусов, автоматическая история изменений.
- **Этап 3:** авторизация Supabase Auth, cookie-based SSR-сессия,
  Proxy, серверная повторная проверка роли, безопасный admin bootstrap,
  восстановление пароля, реальные вход/выход/профиль в интерфейсе.
- **Этап 4 (текущий, частично завершён):** кабинет сотрудника — dashboard,
  список собственных заявок с поиском/фильтром/сортировкой/пагинацией,
  создание заявки через `create_ticket`, карточка заявки, комментарии,
  история, отмена заявки. Реализация готова и покрыта unit-тестами;
  интеграционная приёмка на настоящем Supabase (реальные тестовые
  пользователи, реальный Auth/Employee E2E, RLS с реальными JWT) ожидает
  доступности development-проекта.
- **Далее:** административный интерфейс обработки заявок (намеренно не
  реализован в этапе 4), реальные данные для admin dashboard, экспорт,
  уведомления и другие возможности — по мере необходимости.

## Безопасность

- Секретный `SUPABASE_SERVICE_ROLE_KEY` изолирован в `lib/supabase/admin.ts`,
  помечен `import "server-only"` и нигде не используется в интерфейсе.
- Переменные окружения валидируются через Zod с чётким разделением
  публичных/серверных значений.
- Серверный logger не пишет в лог access/refresh токены, cookie, пароли,
  authorization-заголовки, полный email или service-role ключ — все ошибки
  проходят через санитизацию (`lib/logger/sanitize-error.ts`).
- Данные, которые нельзя доверять браузеру (автор заявки, номер, статус,
  исполнитель, даты), намеренно исключены из клиентской Zod-схемы заявки — они
  проставляются только на сервере (см. `create_ticket` в
  [`docs/database.md`](./docs/database.md)).
- База данных защищена независимо от интерфейса: RLS на всех таблицах,
  минимальные табличные и функциональные GRANT, RPC-only мутации,
  `SECURITY DEFINER`-функции с `search_path = ''`, автоматическая
  неизменяемость ключевых полей заявки. Полная матрица прав и чек-лист
  hardening — в [`docs/security.md`](./docs/security.md).
- Идентичность и роль проверяются на сервере при каждом запросе к
  `/app/**`/`/admin/**` (`requireEmployee`/`requireAdmin`) через
  `getClaims()` + `public.profiles.role` — **не** через
  `supabase.auth.getSession()` и **не** через Proxy в одиночку. Роль не
  выводится из `raw_user_meta_data`, `app_metadata`, query-параметров,
  localStorage или самодельной cookie. Admin bootstrap не требует
  отключения триггеров (`SET session_replication_role = replica` — старая,
  ныне удалённая рекомендация этапа 2) — см.
  [«Безопасное назначение admin»](#безопасное-назначение-admin).
- Safe-redirect (`?next=`) — allow-list, не deny-list; роль имеет
  приоритет над запрошенным путём. Юнит-тесты покрывают внешние URL,
  protocol-relative URL и `javascript:`/`data:`.
- Все мутации заявок — только через `SECURITY DEFINER` RPC
  (`create_ticket`/`add_ticket_comment`/`cancel_own_ticket`), ни одного
  прямого `.insert()`/`.update()` из интерфейса; RPC сами проверяют
  владельца и статус — скрытие кнопки «Отменить» в UI не единственная
  защита.
- Существование чужой заявки не раскрывается: `/app/tickets/[id]`
  возвращает одинаковый `notFound()` для несуществующего id и для чужой
  заявки — RLS делает эти случаи неразличимыми на уровне запроса.
- Поиск в списке заявок использует query builder Supabase (`.or()`), а не
  ручную конкатенацию SQL; `sort`/`pageSize` — закрытые Zod-перечисления,
  поэтому из URL не может попасть произвольное имя столбца или объём
  выборки.
- Пользователю никогда не показывается текст SQL-ошибки/имя политики/
  JWT/cookie/чужой UUID — фиксированные русские сообщения об ошибках,
  независимые от `sanitizeError()`, которая используется только для
  сервера логирования.
- Миграция `202607190013_...sql` добавляет `can_view_profile()` вместо
  редактирования уже применённой миграции 09 — исправления схемы всегда
  идут новой миграцией, а не правкой истории.

## Ограничения MVP

Намеренно не реализовано на этом этапе (появится позже):

- административный интерфейс обработки заявок (реестр, взятие в работу,
  смена статуса/приоритета/исполнителя админом) — намеренно исключён из
  этапа 4, RPC для этого уже есть (`admin_set_ticket_*`, этап 2);
  административный dashboard по-прежнему показывает статичные нули;
- вложения, email-уведомления сверх встроенного password recovery
  Supabase, realtime-обновления, drag-and-drop, сложные анимации,
  BI-графики, тёмная тема — не входят в MVP по требованиям;
- OAuth, magic link, SSO — только email/password;
- роль исполнителя как отдельная сущность (исполнитель — это активный
  профиль employee/admin, см. `docs/database.md`);
- генерация TypeScript-типов из локальной базы — ждёт среды с доступным
  Docker/реальным Supabase (см. `docs/database.md`);
- production deployment.

## Демонстрация

- **Live demo:** _будет добавлено после развёртывания_.
- **Скриншоты:** _будут добавлены после этапа с финальным UI_.
- **Демо-видео:** _будет добавлено после реализации основного сценария_.
