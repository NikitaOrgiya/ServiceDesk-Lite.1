-- Stage 4 corrective migration: profiles_select_own_or_admin (migration 09)
-- is stricter than the employee cabinet needs. An employee opening their own
-- ticket must be able to see the *name* of its assignee, and the author name
-- on any comment/history row attached to their own ticket — but that
-- referenced profile is neither the caller's own row nor does the caller
-- pass is_admin(), so the existing policy hides it. Migrations 001-012 are
-- not edited; this is a new migration replacing the policy via DROP+CREATE,
-- per project convention.

-- True if the caller may see profile p_profile_id: themselves, an active
-- admin, or a profile referenced as author/assignee on a ticket the caller
-- authored, or as the actor of a comment/history row on a ticket the caller
-- authored. SECURITY DEFINER so the internal reads of tickets/ticket_comments/
-- ticket_history bypass those tables' own RLS (which would otherwise recurse
-- back into a profiles-visibility check) — same reasoning as is_admin() and
-- can_access_ticket() in migration 05.
CREATE OR REPLACE FUNCTION public.can_view_profile(p_profile_id UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p_profile_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.tickets t
      WHERE t.author_id = auth.uid()
        AND (t.author_id = p_profile_id OR t.assignee_id = p_profile_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.ticket_comments c
      JOIN public.tickets t ON t.id = c.ticket_id
      WHERE t.author_id = auth.uid()
        AND c.author_id = p_profile_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.ticket_history h
      JOIN public.tickets t ON t.id = h.ticket_id
      WHERE t.author_id = auth.uid()
        AND h.actor_id = p_profile_id
    );
$$;

DROP POLICY profiles_select_own_or_admin ON public.profiles;

CREATE POLICY profiles_select_own_admin_or_related
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.can_view_profile(id));

REVOKE ALL ON FUNCTION public.can_view_profile(UUID) FROM PUBLIC, anon, authenticated, service_role;

-- RLS policy expressions are evaluated as the querying role even though the
-- function body itself runs with definer privileges — same as is_admin()/
-- can_access_ticket() in migration 11.
GRANT EXECUTE ON FUNCTION public.can_view_profile(UUID) TO authenticated;

-- Re-run the migration 11 search_path hardening self-check so this new
-- SECURITY DEFINER function is covered by the same automated guarantee.
DO $$
DECLARE
  v_rec RECORD;
  v_bad TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOR v_rec IN
    SELECT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = TRUE
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_proc p2
      JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
      CROSS JOIN LATERAL unnest(COALESCE(p2.proconfig, ARRAY[]::TEXT[])) AS cfg
      WHERE n2.nspname = 'public'
        AND p2.proname = v_rec.proname
        AND cfg = 'search_path=""'
    ) THEN
      v_bad := array_append(v_bad, v_rec.proname);
    END IF;
  END LOOP;

  IF array_length(v_bad, 1) > 0 THEN
    RAISE EXCEPTION 'SECURITY DEFINER function(s) missing SET search_path = '''': %',
      array_to_string(v_bad, ', ');
  END IF;
END;
$$;
