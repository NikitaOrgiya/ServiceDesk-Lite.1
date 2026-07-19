-- Stage 2: table-level GRANTs. Revoke everything first, then grant back
-- only what is justified — never GRANT ALL on an application table.
--
-- No table in this project has a SERIAL/IDENTITY/bigserial column (every
-- primary key is either a UUID default or, for ticket_number_counters, a
-- plain application-supplied year), so no sequences exist that would need
-- their own USAGE/SELECT grants.

REVOKE ALL ON public.profiles FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.ticket_number_counters FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.tickets FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.ticket_comments FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.ticket_history FROM PUBLIC, anon, authenticated, service_role;

-- anon: no application table access at all. Anonymous requests have no
-- legitimate reason to read or write any of these tables.

-- authenticated: read-only. All writes go through SECURITY DEFINER RPCs
-- (migrations 06-08), which run as the table owner and are therefore
-- unaffected by authenticated's lack of INSERT/UPDATE/DELETE here — RLS
-- (migration 09) then further restricts *which rows* SELECT can see.
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.tickets TO authenticated;
GRANT SELECT ON public.ticket_comments TO authenticated;
GRANT SELECT ON public.ticket_history TO authenticated;
-- ticket_number_counters: no grant to authenticated — it is a purely
-- internal technical table, never part of the application's read model.

-- service_role: no table grants either. The service-role Supabase client
-- (src/lib/supabase/admin.ts) exists in the codebase but performs no table
-- operations yet at this stage, so it is not given standing access it does
-- not use — see docs/database.md for what to grant if/when that changes.
