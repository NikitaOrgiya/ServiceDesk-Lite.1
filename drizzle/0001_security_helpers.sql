-- Neon migration: shared updated_at trigger + helper functions used by RLS
-- policies and RPCs.
--
-- set_updated_at() is adapted from 202607190003_constraints_indexes_and_
-- updated_at.sql — Drizzle's generated migration (0000) only covers table/
-- index/constraint DDL, not trigger functions, so this hand-written
-- migration carries it instead.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tickets_set_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER ticket_comments_set_updated_at
  BEFORE UPDATE ON public.ticket_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Adapted from the Supabase prototype's 202607190005_security_helpers.sql:
-- auth.uid() -> auth.user_id() (Neon Data API's JWT `sub` claim accessor),
-- profile ids are TEXT (Neon Auth user id) instead of UUID.
--
-- Both functions are SECURITY DEFINER so their internal SELECTs run as the
-- function owner (bypassing RLS on the tables they read) instead of as the
-- calling role — this is what breaks the recursion that would otherwise
-- occur: profiles' own SELECT policy calls is_admin(), and is_admin() reads
-- profiles. See docs/migration/supabase-to-neon.md and the original
-- Supabase migration's comment for the full recursion-avoidance reasoning.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.user_id()
      AND p.role = 'admin'
      AND p.is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_ticket(p_ticket_id UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.tickets t
      WHERE t.id = p_ticket_id
        AND t.author_id = auth.user_id()
    );
$$;

-- Defense-in-depth guard against role/is_active self-escalation on
-- profiles. No RLS policy or GRANT allows `authenticated` to UPDATE
-- profiles at all (see 0006_table_grants.sql), so this trigger is a
-- backstop for a mutation path that does not exist yet.
--
-- The bypass condition (no `request.jwt.claims` GUC set) assumes the Neon
-- Data API follows the same PostgREST convention of setting
-- `request.jwt.claims` per request — this has not been verified against a
-- live Neon project in this migration (no Neon credentials were available).
-- Re-verify against the installed Neon Data API version before relying on
-- this in production; see docs/migration/supabase-to-neon.md.
CREATE OR REPLACE FUNCTION public.guard_profile_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'profiles.id is immutable';
  END IF;

  IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.is_active IS DISTINCT FROM OLD.is_active)
     AND NOT public.is_admin()
     AND COALESCE(current_setting('request.jwt.claims', true), '') <> ''
  THEN
    RAISE EXCEPTION 'Only an administrator can change role or is_active' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_guard_mutation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_mutation();
