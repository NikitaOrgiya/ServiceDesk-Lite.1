-- Stage 2: function-level EXECUTE grants + an automated hardening check.
--
-- Postgres grants EXECUTE on every new function to PUBLIC by default —
-- nothing in migrations 03-08 relied on that default, but it must still be
-- revoked explicitly here rather than assumed away.

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_profile_mutation() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_access_ticket(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.generate_ticket_number() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_ticket(TEXT, TEXT, public.ticket_category, public.ticket_priority)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_valid_ticket_status_transition(public.ticket_status, public.ticket_status)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_ticket_workflow() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_ticket_history() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.add_ticket_comment(UUID, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cancel_own_ticket(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_set_ticket_status(UUID, public.ticket_status)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_set_ticket_priority(UUID, public.ticket_priority)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_set_ticket_assignee(UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_set_ticket_due_at(UUID, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated, service_role;

-- Trigger functions (set_updated_at, handle_new_user, guard_profile_mutation,
-- enforce_ticket_workflow, record_ticket_history) and purely-internal helpers
-- (generate_ticket_number, is_valid_ticket_status_transition) stay revoked
-- for every role — they are only ever invoked by trigger firing or by
-- another SECURITY DEFINER function's owner privileges, never directly.

-- RLS helper functions: authenticated must be able to EXECUTE these,
-- because RLS policy expressions are evaluated as the querying role even
-- though the function body itself then runs with definer privileges.
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_ticket(UUID) TO authenticated;

-- Mutation RPCs: available to authenticated (which covers both employee
-- and admin Postgres-role-wise); the admin-only ones each re-check
-- public.is_admin() internally, since GRANT/RLS cannot distinguish the two
-- application roles on their own.
GRANT EXECUTE ON FUNCTION public.create_ticket(TEXT, TEXT, public.ticket_category, public.ticket_priority)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_ticket_comment(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_own_ticket(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_ticket_status(UUID, public.ticket_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_ticket_priority(UUID, public.ticket_priority) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_ticket_assignee(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_ticket_due_at(UUID, TIMESTAMPTZ) TO authenticated;

-- ---------------------------------------------------------------------------
-- Automated hardening check: fail this migration (and therefore fail
-- `supabase db reset`) if any SECURITY DEFINER function in the public
-- schema does not have SET search_path = ''. This turns "we reviewed every
-- function by hand" into something the migration itself verifies, so a
-- future function that forgets search_path breaks CI/local reset instead
-- of shipping quietly.
-- ---------------------------------------------------------------------------
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
