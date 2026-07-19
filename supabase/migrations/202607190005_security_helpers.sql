-- Stage 2: helper functions used by RLS policies and RPCs.
--
-- Both functions are SECURITY DEFINER so their internal SELECTs run as the
-- function owner (bypassing RLS on the tables they read) instead of as the
-- calling role. This is what breaks the recursion that would otherwise
-- occur: profiles' own SELECT policy calls is_admin(), and is_admin() reads
-- profiles — if that inner read were subject to the *same* policy, that
-- policy would have to call is_admin() again to evaluate itself, forever.
-- Because the function owner bypasses RLS, the inner read never re-enters
-- policy evaluation, so there is no cycle. The same reasoning protects
-- can_access_ticket() reading tickets. See docs/database.md.

-- Is the current session an active administrator? Never accepts a user id
-- from the caller — always resolves the caller via auth.uid().
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
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND p.is_active = TRUE
  );
$$;

-- Does the current session have read access to the given ticket? True for
-- an active admin, or for the ticket's own author. Used by the RLS
-- policies on ticket_comments/ticket_history (which need to check access to
-- a *related* ticket) — tickets' own RLS policy compares author_id directly
-- and does not call this function, to keep the dependency graph acyclic
-- (tickets policy -> is_admin() only; comments/history policy ->
-- can_access_ticket() -> tickets + is_admin(), never the reverse).
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
        AND t.author_id = auth.uid()
    );
$$;

-- Defense-in-depth guard against role/is_active self-escalation on
-- profiles (see migration 04). No RLS policy or GRANT currently allows
-- authenticated to UPDATE profiles at all, so this trigger is a backstop
-- for a mutation path that does not exist yet in this stage.
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
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an administrator can change role or is_active' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_guard_mutation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_mutation();
