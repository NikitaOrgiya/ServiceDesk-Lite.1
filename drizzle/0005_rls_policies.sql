-- Neon migration: Row Level Security on all five application tables.
-- Adapted from 202607190009_rls_policies.sql: auth.uid() -> auth.user_id().
-- Table GRANTs (0006) and function EXECUTE grants (0007) are handled
-- separately.
--
-- The `profiles` policy below (profiles_select_own_or_admin) is replaced by
-- 0009_profile_visibility_for_related_tickets.sql, mirroring the original
-- Supabase migration sequence (09 then 13) rather than editing this file.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_number_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_own_or_admin
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.user_id() OR public.is_admin());

CREATE POLICY tickets_select_own_or_admin
  ON public.tickets
  FOR SELECT
  TO authenticated
  USING (author_id = auth.user_id() OR public.is_admin());

CREATE POLICY ticket_comments_select_accessible
  ON public.ticket_comments
  FOR SELECT
  TO authenticated
  USING (public.can_access_ticket(ticket_id));

CREATE POLICY ticket_history_select_accessible
  ON public.ticket_history
  FOR SELECT
  TO authenticated
  USING (public.can_access_ticket(ticket_id));

-- ticket_number_counters: intentionally has ZERO policies. Combined with
-- the revoked table grants in 0006, this table is unreachable via the Data
-- API under any circumstance — only generate_ticket_number() (SECURITY
-- DEFINER, bypasses RLS) ever touches it.
