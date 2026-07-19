-- Neon migration: an employee opening their own ticket must be able to see
-- the name of its assignee, and the author name on any comment/history row
-- attached to their own ticket. Adapted from
-- 202607190013_profile_visibility_for_related_tickets.sql: auth.uid() ->
-- auth.user_id(), ids TEXT.

CREATE OR REPLACE FUNCTION public.can_view_profile(p_profile_id TEXT)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p_profile_id = auth.user_id()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.tickets t
      WHERE t.author_id = auth.user_id()
        AND (t.author_id = p_profile_id OR t.assignee_id = p_profile_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.ticket_comments c
      JOIN public.tickets t ON t.id = c.ticket_id
      WHERE t.author_id = auth.user_id()
        AND c.author_id = p_profile_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.ticket_history h
      JOIN public.tickets t ON t.id = h.ticket_id
      WHERE t.author_id = auth.user_id()
        AND h.actor_id = p_profile_id
    );
$$;

DROP POLICY profiles_select_own_or_admin ON public.profiles;

CREATE POLICY profiles_select_own_admin_or_related
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.can_view_profile(id));

REVOKE ALL ON FUNCTION public.can_view_profile(TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.can_view_profile(TEXT) TO authenticated;

-- Re-run the search_path hardening self-check for this new SECURITY
-- DEFINER function.
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
