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
| `profiles` | SELECT own row | ✗ | ✓ | ✓ | ✗ | RLS policy |
| `profiles` | SELECT other rows | ✗ | ✗ | ✓ | ✗ | RLS policy (`is_admin()`) |
| `profiles` | INSERT | ✗ | ✗ | ✗ | ✗ | No policy/grant — only `handle_new_user()` trigger |
| `profiles` | UPDATE `role`/`is_active` | ✗ | ✗ | ✗ (no RPC yet) | ✗ | No policy/grant; `guard_profile_mutation()` trigger backstop |
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
      `SELECT`-only.
- [x] `PUBLIC` and `anon` have `EXECUTE` on no function in `public`.
- [x] `authenticated` has `EXECUTE` on exactly the RPC/helper allow-list —
      nothing else (covers `generate_ticket_number()` and every trigger
      function being unreachable directly).
- [x] Every `SECURITY DEFINER` function has `SET search_path = ''`.

## Known limitations / accepted risk

- **Admin bootstrap requires disabling triggers for one statement.**
  `guard_profile_mutation()` blocks role changes for *everyone*, including
  the `postgres` superuser, since triggers fire regardless of role. The
  documented bootstrap procedure (`session_replication_role = replica`) is
  the standard way to perform a deliberate, privileged, one-off operation
  like this — it requires direct database access, which is already a
  strictly higher privilege level than anything the application exposes.
- **`service_role` has no table grants yet.** This is intentional (see
  `docs/database.md`), but means any future background job or the admin
  Supabase client will need a *new, explicit* migration granting exactly
  what it needs — don't reach for `GRANT ALL` when that day comes.
- **Local verification used a hand-built `auth` stand-in, not real
  GoTrue.** `auth.uid()` and `auth.users` were reproduced closely enough to
  exercise every RLS policy and RPC in this project, but this is not a
  substitute for testing against the real Supabase Auth schema once local
  Docker access is available.
