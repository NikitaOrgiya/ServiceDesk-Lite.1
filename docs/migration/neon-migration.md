# Neon Migration — Overview

## Why a Neon version

The original ServiceDesk Lite prototype (`nikitaorgiya/servicedesk-lite`,
branch `claude/servicedesk-lite-stage-1-hzf7vf`, commit `67d09de`) implements
stages 1–4 (foundation, database/RLS/RPC, Supabase Auth, employee cabinet) on
Supabase. That repository is preserved unmodified as a complete, standalone
prototype.

This repository (`ServiceDesk-Lite.1`) continues development on Neon:
Neon Auth, the Neon Data API, PostgreSQL RLS, and Drizzle ORM/Kit, replacing
Supabase Auth/`@supabase-js`/PostgREST-via-Supabase while preserving the
existing UI, roles, employee cabinet, and the entire SQL security model
(enums, atomic ticket numbering, centralized status workflow, database-level
history, minimal GRANTs, RLS, hardened `SECURITY DEFINER` functions).

## What changes vs. the Supabase prototype

| Concern | Supabase prototype | Neon version |
| --- | --- | --- |
| Auth | `@supabase/ssr` + Supabase Auth (GoTrue), `auth.uid()` | `@neondatabase/auth` (Managed Better Auth), `auth.user_id()` |
| User id type | `UUID`, FK to `auth.users` | `TEXT` (Neon Auth user id), no FK into Neon's internal auth schema |
| User-scoped data access | Supabase client (PostgREST) + RLS | Neon Data API (PostgREST-compatible) with per-request JWT + RLS |
| Schema/migrations source of truth | Hand-written SQL in `supabase/migrations` | Drizzle schema (`src/db/schema`) for tables/enums/indexes + hand-written SQL migrations for functions/RLS/GRANTs |
| Admin-only privileged operations | Service-role Supabase client | Direct `DATABASE_URL` in server-only scripts/Drizzle Kit only |
| Local dev database stack | `supabase start` (local Postgres/Auth/PostgREST/Studio) | Connects to a Neon branch (no local CLI stack equivalent in scope) |

## What does not change

- UI, routes, and component structure under `src/app`, `src/components`.
- Roles (`employee`, `admin`), the employee dashboard, ticket list with
  search/filter/pagination, ticket creation, ticket detail card, comments,
  history, and new-ticket cancellation.
- The five application tables, four enums, atomic ticket numbering via
  `generate_ticket_number()`, the centralized status-transition function
  `is_valid_ticket_status_transition()`, the single-writer
  `record_ticket_history()` trigger, minimal GRANTs, RLS on all five tables,
  and `SECURITY DEFINER` functions with `SET search_path = ''`.
- The administrative ticket-processing UI remains out of scope for this
  stage, exactly as in the Supabase prototype.

## Sequencing

1. **Prep commit** (this commit) — package name, README banner, this
   document, the audit document (`supabase-to-neon.md`). No functional
   changes; Supabase code and dependencies are untouched.
2. Drizzle schema + config.
3. Custom SQL migrations for functions/RLS/GRANTs (Neon-adapted).
4. Neon Auth wiring (server/client SDK, routes, proxy, provisioning).
5. Neon Data API client + query/action layer replacing Supabase calls.
6. Removal of Supabase runtime dependencies and legacy client code.
7. Test adaptation (unit, SQL security, e2e) and CI updates.
8. README overhaul and final migration report.

`supabase/` is deleted only after step 3 confirms full parity with the
custom SQL migrations — never before, and never in this prep commit.

## Neon Auth Beta status

Neon Auth (Managed Better Auth) is an officially **Beta** product as of this
migration (July 2026), having replaced the legacy Stack Auth-based Neon Auth.
This carries real risk: API surface, session/token retrieval mechanics, and
self-service signup controls are less mature and less exhaustively documented
than Supabase Auth's GA API. See the README's Security checklist and Risks
sections for the specific residual risks this migration accepted, and what to
re-verify before production use.
