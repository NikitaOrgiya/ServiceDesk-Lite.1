# ServiceDesk Lite — Database

Stage 2 deliverable: the full PostgreSQL/Supabase schema, RPC surface, RLS
model, and GRANT model. Authentication itself, real user provisioning, and
wiring the Next.js app to any of this are stage 3 — nothing here is called
from the application yet.

## Enums (`public` schema)

| Type | Values |
| --- | --- |
| `user_role` | `employee`, `admin` |
| `ticket_status` | `new`, `accepted`, `in_progress`, `waiting`, `resolved`, `closed`, `cancelled` |
| `ticket_priority` | `low`, `normal`, `high`, `critical` |
| `ticket_category` | `hardware`, `software`, `network`, `access`, `workplace`, `other` |

There is no separate "assignee" role. In this MVP an assignee is simply an
active profile (`employee` or `admin`) — see `admin_set_ticket_assignee`.

## Tables

- **`profiles`** — one row per `auth.users` row, created only by
  `handle_new_user()`. `role`/`is_active` have no client-writable path at
  this stage (see [RLS](#rls-model) and [GRANT](#grant-model)).
- **`ticket_number_counters`** — internal, per-year counter. Never exposed
  to `anon`/`authenticated`; touched only by `generate_ticket_number()`.
- **`tickets`** — the core entity. Client-writable only via `create_ticket`
  and the `admin_set_ticket_*`/`cancel_own_ticket` RPCs.
- **`ticket_comments`** — insert-only via `add_ticket_comment`. Editing/
  deleting comments is out of scope for the MVP.
- **`ticket_history`** — append-only audit trail, populated exclusively by
  the `record_ticket_history()` trigger.

## Migration order

| # | File | Purpose |
| --- | --- | --- |
| 01 | `extensions_and_enums` | The four enum types (no extensions needed — `gen_random_uuid()` is core in PG13+) |
| 02 | `tables` | Table shape: columns, PK/FK, NOT NULL, DEFAULT |
| 03 | `constraints_indexes_and_updated_at` | CHECK constraints, indexes, `set_updated_at()` + triggers |
| 04 | `profile_provisioning` | `handle_new_user()` trigger on `auth.users` |
| 05 | `security_helpers` | `is_admin()`, `can_access_ticket()`, `guard_profile_mutation()` |
| 06 | `ticket_numbering_and_creation` | `generate_ticket_number()`, `create_ticket()` |
| 07 | `ticket_workflow_and_history` | `is_valid_ticket_status_transition()`, `enforce_ticket_workflow()`, `record_ticket_history()` |
| 08 | `comment_and_mutation_rpcs` | `add_ticket_comment`, `cancel_own_ticket`, `admin_set_ticket_*` |
| 09 | `rls_policies` | `ENABLE ROW LEVEL SECURITY` + policies on all 5 tables |
| 10 | `table_grants` | `REVOKE ALL` then minimal `GRANT SELECT` |
| 11 | `function_grants_and_hardening` | `REVOKE`/`GRANT EXECUTE` for every function + an automated `search_path` audit |
| 12 | `admin_bootstrap_hardening` | `private` schema + `private.set_profile_role()`, updates `guard_profile_mutation()` (stage 3) |

Once committed, a migration is never edited again — fixes are new
migrations. Note: `is_admin()` was needed one migration earlier than
originally planned (04) to back a profile-mutation guard, so that guard
trigger lives in migration 05 instead, right after `is_admin()` is defined.
Migration 12 (stage 3) follows the same rule: it does not edit migration 05,
it replaces `guard_profile_mutation()` via `CREATE OR REPLACE` in a new file.

## RPCs

| Function | Definer | `EXECUTE` | Purpose |
| --- | --- | --- | --- |
| `create_ticket(title, description, category, priority=normal)` | yes | `authenticated` | Creates a ticket as the caller; ignores/rejects any client-supplied `author_id`/`public_number`/`status` |
| `add_ticket_comment(ticket_id, message)` | yes | `authenticated` | Adds a comment; employee only on own ticket, admin on any |
| `cancel_own_ticket(ticket_id)` | yes | `authenticated` | `new -> cancelled`, own ticket only |
| `admin_set_ticket_status(ticket_id, status)` | yes | `authenticated`* | Any valid transition; checks `is_admin()` internally |
| `admin_set_ticket_priority(ticket_id, priority)` | yes | `authenticated`* | — |
| `admin_set_ticket_assignee(ticket_id, assignee_id \| NULL)` | yes | `authenticated`* | Validates assignee is an existing, active profile; `NULL` unassigns |
| `admin_set_ticket_due_at(ticket_id, due_at \| NULL)` | yes | `authenticated`* | `NULL` clears the due date |
| `is_admin()` | yes | `authenticated` | RLS/RPC helper — current session is an active admin |
| `can_access_ticket(ticket_id)` | yes | `authenticated` | RLS helper for `ticket_comments`/`ticket_history` |
| `generate_ticket_number()` | yes | *nobody* | Internal-only, called by `create_ticket` |
| `is_valid_ticket_status_transition(old, new)` | no | *nobody* | Internal-only, called by the workflow trigger |
| `set_updated_at()`, `handle_new_user()`, `guard_profile_mutation()`, `enforce_ticket_workflow()`, `record_ticket_history()` | trigger fns | *nobody* | Never called directly |

\* Granted to `authenticated` because that Postgres role covers both
employees and admins — see [why RLS doesn't replace GRANT](#why-rls-doesnt-replace-grant).
Each admin RPC re-checks `is_admin()` in its own body.

### Status transitions

```
new         -> accepted, cancelled
accepted    -> in_progress, waiting, cancelled
in_progress -> waiting, resolved, cancelled
waiting     -> in_progress, resolved, cancelled
resolved    -> closed, in_progress
closed      -> (none — terminal)
cancelled   -> (none — terminal)
```

**Documented choice:** a "transition" to the same status (e.g. `new ->
new`) is rejected, not treated as a silent no-op. This is enforced in two
places: `enforce_ticket_workflow()` validates every *actual* status change
via `is_valid_ticket_status_transition()`, and `admin_set_ticket_status()`
additionally re-checks the current status before its `UPDATE` — because a
same-value `UPDATE` produces `NEW.status IS NOT DISTINCT FROM OLD.status`,
which is indistinguishable, from the trigger's point of view, from an
`UPDATE` that never touched `status` at all (as `admin_set_ticket_priority`
etc. legitimately do). The RPC is what actually catches that edge case; the
trigger remains the backstop for every other (real) transition, including
one attempted via a hypothetical future direct `UPDATE`.

### `resolved_at`

- Entering `resolved` (from any allowed source status) stamps
  `resolved_at = now()`.
- `resolved -> in_progress` clears `resolved_at`.
- `resolved -> closed` preserves the original resolution timestamp.
- Every other status keeps `resolved_at` at `NULL`.

All enforced by `enforce_ticket_workflow()` — never in application code.

### History event vocabulary (stable)

| `event_type` | `field_name` | When |
| --- | --- | --- |
| `ticket_created` | — | On `INSERT` |
| `status_changed` | `status` | Status changes to anything except the two rows below |
| `ticket_cancelled` | `status` | Status changes to `cancelled` |
| `ticket_closed` | `status` | Status changes to `closed` |
| `priority_changed` | `priority` | — |
| `assignee_changed` | `assignee_id` | — |
| `due_at_changed` | `due_at` | — |

One `record_ticket_history()` trigger writes all of these — no RPC inserts
into `ticket_history` directly, so a ticket touched by three different RPCs
still gets exactly one row per actual change, and a rolled-back transaction
leaves no trace.

### Immutable fields

`id`, `public_number`, `author_id`, `created_at` can never change — enforced
by `enforce_ticket_workflow()` itself (not merely "no RPC exposes it"), so
even a privileged direct `UPDATE` is rejected. Verified in
`supabase/tests/functional_checks.sql`.

### Admin bootstrap (assigning the first admin)

> **Superseded.** This originally described a `SET session_replication_role
> = replica` procedure. That is no longer the process — see
> [`202607190012_admin_bootstrap_hardening.sql`](../supabase/migrations/202607190012_admin_bootstrap_hardening.sql)
> and [`docs/security.md`](./security.md#admin-bootstrap), added in stage 3.
> It required disabling trigger firing for the session, which stage 3
> replaces with a mechanism that doesn't disable anything.

No RPC reachable through the Data API can promote a profile to `admin` —
that remains true. Instead, a `private` schema (no `USAGE` for
`PUBLIC`/`anon`/`authenticated`/`service_role`) holds
`private.set_profile_role(user_id, role)`, and
`guard_profile_mutation()` was updated (via `CREATE OR REPLACE`, in the new
migration — the original migration 05 file was not edited) to also allow a
role/is_active change when the call carries no `request.jwt.claims` GUC at
all, i.e. it did not come through PostgREST. Assign the first admin with:

```bash
psql "$DATABASE_URL" -v target_email="'demo.admin@example.com'" \
  -f supabase/scripts/make_admin.sql
```

This is still a deliberate, manual, privileged operation — never done
through `raw_user_meta_data`/`app_metadata`, and never through the app. See
`docs/security.md` for the full mechanism and why it's closed to
`anon`/`authenticated`/`service_role`.

## RLS model

RLS is enabled on all five tables. Every policy is `SELECT`-only:

| Table | Employee sees | Admin sees | INSERT/UPDATE/DELETE |
| --- | --- | --- | --- |
| `profiles` | own row only | all rows | none (no policy for any role) |
| `tickets` | own tickets (`author_id = auth.uid()`) | all tickets | none |
| `ticket_comments` | comments on own tickets | all comments | none |
| `ticket_history` | history of own tickets | all history | none |
| `ticket_number_counters` | — | — | no policies at all; unreachable regardless of GRANT |

### Avoiding RLS recursion

`is_admin()` and `can_access_ticket()` are `SECURITY DEFINER`, so their
internal `SELECT`s run as the function owner and bypass RLS entirely. That
is what breaks the cycle:

- `profiles`' own policy calls `is_admin()`, which reads `profiles` — if
  that inner read were subject to the *same* policy, evaluating the policy
  would require evaluating the policy, forever. Because the owner bypasses
  RLS, the inner read never re-enters policy evaluation.
- `tickets`' policy compares `author_id = auth.uid()` **directly** — it
  never calls `can_access_ticket()`, which itself queries `tickets`. Doing
  so would create the same cycle `can_access_ticket()` is used to solve
  for `ticket_comments`/`ticket_history` instead.
- `can_access_ticket()` calls `is_admin()` (safe — only touches `profiles`)
  and reads `tickets` directly (bypassing RLS via ownership, so it never
  re-enters `tickets`' policy).

Dependency graph (never cyclic): `tickets policy -> is_admin()`;
`profiles policy -> is_admin()`; `comments/history policy ->
can_access_ticket() -> is_admin() + tickets (bypassed)`.

## GRANT model

| Object | `anon` | `authenticated` | `service_role` |
| --- | --- | --- | --- |
| `profiles` | none | `SELECT` | none |
| `tickets` | none | `SELECT` | none |
| `ticket_comments` | none | `SELECT` | none |
| `ticket_history` | none | `SELECT` | none |
| `ticket_number_counters` | none | none | none |
| `is_admin()`, `can_access_ticket()` | none | `EXECUTE` | none |
| `create_ticket`, `add_ticket_comment`, `cancel_own_ticket`, `admin_set_ticket_*` | none | `EXECUTE` | none |
| every trigger fn + `generate_ticket_number` + `is_valid_ticket_status_transition` | none | none | none |

`service_role` intentionally has **zero** table grants. The
`lib/supabase/admin.ts` client exists in the codebase but performs no table
operations at this stage, so it is not given standing access it does not
use. If a future stage needs it (e.g. a background job), grant exactly
what that job requires in a new migration — never `GRANT ALL`.

No table has a `SERIAL`/`IDENTITY` column (every PK is a UUID default,
except `ticket_number_counters.year`, which is application-supplied), so no
sequences exist that would need their own grants.

### Why RLS doesn't replace GRANT

RLS only restricts *which rows* a query can touch — it says nothing about
whether a role may run a given command at all. A role with an `UPDATE`
grant but no matching policy still can't update anything (RLS blocks the
rows). A role with a matching policy but no `UPDATE` grant still can't
update anything either (the grant blocks the command before RLS is even
consulted). Both layers are relied on here: even if a future migration
forgets to add a policy, the missing `GRANT` alone already blocks
`authenticated` from touching `tickets`/`ticket_comments` directly — and
vice versa.

### Why `authenticated` never gets a direct `UPDATE`

The Postgres role `authenticated` covers **both** employees and admins —
there's no way for a table-level `GRANT` or an RLS policy to say "this
column may only be changed by an admin, that one only by the ticket's
author." Only a function body can check `public.is_admin()` or "is this
row's `author_id` the caller?" before mutating specific columns. Hence:
`tickets`/`ticket_comments` have no `INSERT`/`UPDATE`/`DELETE` grant at
all, and every mutation goes through a `SECURITY DEFINER` RPC that performs
its own authorization check first.

## `SECURITY DEFINER` hardening rules

Every `SECURITY DEFINER` function in this project:

- has `SET search_path = ''` (never `SET search_path = public`);
- refers to every table/type with its full schema (`public.tickets`,
  `auth.uid()`, `public.ticket_status`, …);
- never accepts `author_id`, `actor_id`, `updated_by`, or `public_number`
  as a parameter — those always come from `auth.uid()` or are generated
  server-side;
- never trusts a caller-supplied role/user id (`is_admin()`/
  `can_access_ticket()` always resolve the caller via `auth.uid()`).

Migration 11 ends with a `DO` block that queries `pg_proc`/`pg_namespace`
and **fails the migration** if any `SECURITY DEFINER` function in `public`
is missing an empty `search_path` — this is enforced automatically, not
just by code review. `supabase/tests/security_assertions.sql` repeats the
same check independently, plus everything in the [GRANT model](#grant-model)
and [RLS model](#rls-model) tables above.

## Index decisions

```
tickets(author_id, created_at DESC)
tickets(assignee_id, status)
tickets(status, created_at DESC)
tickets(priority, created_at DESC)
ticket_comments(ticket_id, created_at)
ticket_history(ticket_id, created_at)
```

`tickets.public_number` is `UNIQUE NOT NULL`, which Postgres already backs
with a unique btree index automatically — a second, explicit index on the
same column would be a redundant duplicate, so none was added.

## Local setup

### What actually ran in this environment

`supabase start` could not be used here: pulling the stack's Docker images
(Postgres, GoTrue, PostgREST, Studio, …) failed because this sandbox's
network egress policy blocks the CDN hosts Docker Hub/GHCR/ECR redirect
blob downloads to (`production.cloudfront.docker.com`,
`pkg-containers.githubusercontent.com`, etc. all return 403 through the
proxy) — only the registry API hosts themselves are reachable, not the
actual image layers. This is an environment limitation, not a schema
problem.

Every migration (now including migration 12), `seed.sql`,
`security_assertions.sql`, `functional_checks.sql`, and
`admin_bootstrap_checks.sql` in this repository **was** verified end-to-end
against a real PostgreSQL 16 server (installed natively in the sandbox, no
Docker) with a minimal hand-built stand-in for the parts of Supabase's
`auth` schema the migrations reference (`auth.users`, `auth.uid()`) and the
`anon`/`authenticated`/`service_role` roles — applied to a freshly created
database, from empty, repeatedly, always cleanly. TypeScript type generation
(`supabase gen types typescript --local`) does require the Docker-based
stack (or a linked real project) and could not be run — `src/types/database.ts`
remains the stage-1 placeholder pending a stage where one is reachable.

### Normal usage (once Docker/network access, or a real Supabase project, is available)

```bash
supabase start
supabase db reset   # applies every migration + seed.sql from empty
supabase test db    # or: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security_assertions.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/functional_checks.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/admin_bootstrap_checks.sql
supabase gen types typescript --local > src/types/database.ts   # or --linked against a real project
```

`functional_checks.sql` and `admin_bootstrap_checks.sql` must be run
through `psql` itself (not `supabase test db`, which expects pgTAP) — they
use psql's `\gset` and `:'var'` client-side substitution to pass values
between statements.

## Current limitations (deferred to later stages)

- Real authentication now exists (stage 3) — `auth.uid()` is populated by a
  genuine Supabase session; see `docs/security.md` for the app-level auth
  model. Assigning the first admin is still a deliberate, manual operation
  (`supabase/scripts/make_admin.sql`), just no longer one requiring
  disabled triggers.
- No attachments, email notifications beyond Supabase's built-in password
  recovery, or realtime.
- No CSV export or admin dashboard aggregate queries.
- `service_role` has no table access yet — add it deliberately when a
  concrete need exists.
- No ticket data is read/written from the UI yet — that's stage 4.
