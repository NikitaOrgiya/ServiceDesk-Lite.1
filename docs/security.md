# ServiceDesk Lite — Security Model

Companion to [`docs/database.md`](./database.md), focused specifically on
the permission matrix and the hardening checklist. See `database.md` for
schema/RPC/RLS/GRANT details and rationale.

## `employee` and `admin` are not Postgres roles

Both map to the single Postgres role `authenticated` — Supabase issues the
same JWT `role` claim to every signed-in user regardless of application
role. The employee/admin distinction is entirely an application-level
concept stored in `profiles.role`, checked by `public.is_admin()` inside
RLS policies and re-checked inside every admin RPC. `GRANT` and RLS can
only ever say "authenticated may/may not" — they cannot themselves
distinguish an employee from an admin. That's why every admin mutation is
its own `SECURITY DEFINER` function that calls `is_admin()` before doing
anything.

## Permission matrix

| Object | Operation | `anon` | `employee` | `admin` | `service_role` | Enforcement |
| --- | --- | --- | --- | --- | --- | --- |
| `profiles` | SELECT own row | ✗ | ✓ | ✓ | ✗ | RLS policy (`can_view_profile()`) |
| `profiles` | SELECT other rows | ✗ | only if referenced as assignee/comment-or-history-actor on a ticket the caller authored | ✓ | ✗ | RLS policy (`can_view_profile()`, stage 4 migration 013) |
| `profiles` | INSERT | ✗ | ✗ | ✗ | ✗ | No policy/grant — only `handle_new_user()` trigger |
| `profiles` | UPDATE `role`/`is_active` | ✗ | ✗ | ✗ | ✗ | No policy/grant for any Data-API role; only `private.set_profile_role()`, unreachable from the Data API — see [Admin bootstrap](#admin-bootstrap) |
| `tickets` | SELECT own | ✗ | ✓ | ✓ | ✗ | RLS policy |
| `tickets` | SELECT others' | ✗ | ✗ | ✓ | ✗ | RLS policy (`is_admin()`) |
| `tickets` | INSERT | ✗ | via `create_ticket` RPC | via `create_ticket` RPC | ✗ | No direct grant; RPC only |
| `tickets` | UPDATE status/priority/assignee/due_at | ✗ | ✗ (own cancel via RPC only) | via `admin_set_ticket_*` RPCs | ✗ | No direct grant; RPC checks `is_admin()` |
| `tickets` | cancel own, status `new` only | ✗ | via `cancel_own_ticket` RPC | via `admin_set_ticket_status` | ✗ | RPC-enforced ownership + status check |
| `tickets` | DELETE | ✗ | ✗ | ✗ | ✗ | No policy/grant — not implemented anywhere |
| `ticket_comments` | SELECT | ✗ | own tickets only | all | ✗ | RLS policy (`can_access_ticket()`) |
| `ticket_comments` | INSERT | ✗ | own tickets only, via RPC | any ticket, via RPC | ✗ | No direct grant; `add_ticket_comment` RPC |
| `ticket_history` | SELECT | ✗ | own tickets only | all | ✗ | RLS policy (`can_access_ticket()`) |
| `ticket_history` | INSERT/UPDATE/DELETE | ✗ | ✗ | ✗ | ✗ | No policy/grant — only the history trigger writes |
| `ticket_number_counters` | any | ✗ | ✗ | ✗ | ✗ | No policy, no grant — only `generate_ticket_number()` |

## Hardening checklist (all satisfied, verified by `security_assertions.sql`)

- [x] RLS enabled on all 5 application tables.
- [x] `anon` has zero table privileges anywhere.
- [x] `authenticated` has `SELECT`-only on the 4 client-facing tables, and
      nothing on `ticket_number_counters`.
- [x] `service_role` has zero table privileges (no standing access it
      doesn't use yet).
- [x] Every client-facing table has exactly one policy, and it is
      `SELECT`-only (the `profiles` policy was replaced, not duplicated, by
      migration 013 — still exactly one).
- [x] `PUBLIC` and `anon` have `EXECUTE` on no function in `public`.
- [x] `authenticated` has `EXECUTE` on exactly the RPC/helper allow-list —
      nothing else (covers `generate_ticket_number()` and every trigger
      function being unreachable directly).
- [x] Every `SECURITY DEFINER` function has `SET search_path = ''`.

## Admin bootstrap

Stage 2's process (`SET session_replication_role = replica`, disabling
trigger firing for the session) is retired — it is no longer documented as
the way to do this and is not used anywhere. Stage 3 replaces it with
(`202607190012_admin_bootstrap_hardening.sql`):

1. A `private` schema. `USAGE` is revoked from `PUBLIC`/`anon`/
   `authenticated`/`service_role`, so none of them can resolve
   `private.*` at all — this is checked *before* any function-level
   `EXECUTE` grant is even consulted, which is what makes this
   unreachable through the Supabase Data API specifically (PostgREST
   always connects as one of those three roles).
2. `private.set_profile_role(user_id, role)` — deliberately **not**
   `SECURITY DEFINER` (it runs with the caller's own privileges, not an
   owner's elevated ones), and independently refuses to run when
   `current_user` is `anon`/`authenticated`/`service_role`. It validates
   that both `auth.users` and `public.profiles` rows exist for the given
   id, changes only `role`, and errors clearly if the user doesn't exist.
3. `public.guard_profile_mutation()` (originally migration 05, replaced
   here via `CREATE OR REPLACE` — the migration 05 *file* was not edited)
   now permits a role/`is_active` change when the session already passes
   `is_admin()` **or** there is no `request.jwt.claims` GUC set at all.
   Every Supabase Data API call carries a JWT (even the anon key is one),
   so an empty/absent claims GUC reliably means "this is a direct trusted
   database session" (`psql`, Supabase Studio's SQL Editor), never a
   PostgREST request. `current_user` can't be used for this same check
   inside `guard_profile_mutation()` itself, because it's `SECURITY
   DEFINER` — `current_user` there reflects the function's *owner*, not
   the original caller, for the duration of the call.

Verified by `supabase/tests/admin_bootstrap_checks.sql`: `authenticated`/
`anon`/`service_role` all get `permission denied for schema private`; a
plain authenticated session can't change its own role via a direct
`UPDATE` (blocked by the missing table `GRANT`, matching the permission
matrix above); the trusted session can assign `admin` with no trigger
disabling of any kind; a repeated call is idempotent; an unknown user id
fails with a clear error instead of silently doing nothing; and the
original `is_admin()` bypass still works correctly even when
`request.jwt.claims` *is* present (so an active admin isn't accidentally
caught by the new branch).

Run it: `supabase/scripts/make_admin.sql` (placeholder email only, never a
real one in Git) — see the README's
["Безопасное назначение admin"](../README.md#безопасное-назначение-admin)
for the exact command.

## Known limitations / accepted risk

- **`service_role` has no table grants yet.** This is intentional (see
  `docs/database.md`), but means any future background job or the admin
  Supabase client will need a *new, explicit* migration granting exactly
  what it needs — don't reach for `GRANT ALL` when that day comes.
- **Local verification used a hand-built `auth` stand-in, not real
  GoTrue.** `auth.uid()` and `auth.users` were reproduced closely enough to
  exercise every RLS policy and RPC in this project, but this is not a
  substitute for testing against the real Supabase Auth schema. Stage 3's
  application-level auth code (login/logout/session/role checks) has
  likewise only been verified with unit and smoke tests — real Supabase
  Auth E2E has not run in this environment (no development project was
  available); see the README's
  ["Реальный Supabase в этой сессии"](../README.md#реальный-supabase-в-этой-сессии).
- **Proxy (`src/proxy.ts`) is a UX shortcut, not an authorization
  boundary.** It only verifies a JWT via `getClaims()` and never queries
  `public.profiles` — role enforcement happens exclusively in
  `requireEmployee()`/`requireAdmin()` inside the employee/admin layouts,
  which run on every request to those sections regardless of what the
  Proxy already did.
