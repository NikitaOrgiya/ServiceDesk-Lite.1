-- Neon migration: table-level GRANTs. Revoke everything first, then grant
-- back only what is justified — never GRANT ALL on an application table.
-- Adapted from 202607190010_table_grants.sql.
--
-- Neon Data API roles are `anonymous` and `authenticated` — there is no
-- `service_role` equivalent (trusted administrative operations use
-- DATABASE_URL directly instead, connecting as the table owner/migration
-- role; see docs/migration/supabase-to-neon.md and src/db/client.ts).

REVOKE ALL ON public.profiles FROM PUBLIC, anonymous, authenticated;
REVOKE ALL ON public.ticket_number_counters FROM PUBLIC, anonymous, authenticated;
REVOKE ALL ON public.tickets FROM PUBLIC, anonymous, authenticated;
REVOKE ALL ON public.ticket_comments FROM PUBLIC, anonymous, authenticated;
REVOKE ALL ON public.ticket_history FROM PUBLIC, anonymous, authenticated;

-- anonymous: no application table access at all.

-- authenticated: read-only. All writes go through SECURITY DEFINER RPCs
-- (0002-0004), which run as the table owner and are therefore unaffected by
-- authenticated's lack of INSERT/UPDATE/DELETE here — RLS (0005) then
-- further restricts *which rows* SELECT can see.
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.tickets TO authenticated;
GRANT SELECT ON public.ticket_comments TO authenticated;
GRANT SELECT ON public.ticket_history TO authenticated;
-- ticket_number_counters: no grant to authenticated — purely internal.
