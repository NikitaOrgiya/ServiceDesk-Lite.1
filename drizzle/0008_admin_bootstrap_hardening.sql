-- Neon migration: safe admin-role assignment without disabling triggers.
-- Adapted from 202607190012_admin_bootstrap_hardening.sql. Differences from
-- the Supabase original:
--   - No `auth.users` existence check — Neon Auth's internal user table is
--     not a documented, stable contract this application depends on (see
--     docs/migration/supabase-to-neon.md). Only the local public.profiles
--     row is checked.
--   - No `service_role` in the current_user guard — Neon Data API has no
--     such role (see 0006_table_grants.sql); admin operations reach this
--     function only via a trusted direct DATABASE_URL session (scripts/
--     make-admin.ts), never via the Data API.
--
-- Mechanism, and why it's closed to the Data API:
--   1. A `private` schema holds `private.set_profile_role()`. USAGE on this
--      schema is revoked from PUBLIC/anonymous/authenticated below, so the
--      Data API (which always connects as anonymous or authenticated) can
--      never even resolve `private.*`.
--   2. EXECUTE on the function itself is also explicitly revoked from both
--      for defense in depth, and the function independently checks
--      `current_user` and refuses to run as anonymous/authenticated.
--   3. public.guard_profile_mutation() (0001) allows a role/is_active
--      change when there is no `request.jwt.claims` GUC set at all — i.e.
--      the call did not come through the Data API — matching only a
--      direct, trusted database session (psql or equivalent).

CREATE SCHEMA private;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anonymous, authenticated;

COMMENT ON SCHEMA private IS
  'Not exposed to the Neon Data API (no USAGE grant to anonymous/authenticated). '
  'Holds owner-only operational functions such as admin bootstrap — see '
  'docs/migration/supabase-to-neon.md.';

CREATE FUNCTION private.set_profile_role(
  p_user_id TEXT,
  p_role public.user_role
)
RETURNS public.profiles
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_row public.profiles;
BEGIN
  IF current_user IN ('anonymous', 'authenticated') THEN
    RAISE EXCEPTION
      'private.set_profile_role must be run by a trusted database session, not via the Data API'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_user_id) THEN
    RAISE EXCEPTION
      'No profiles row for id % (has this user actually signed in at least once?)', p_user_id
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.profiles AS p
  SET role = p_role
  WHERE p.id = p_user_id
  RETURNING p.* INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to update profile role for id %', p_user_id USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION private.set_profile_role(TEXT, public.user_role)
  FROM PUBLIC, anonymous, authenticated;

-- Re-run the search_path hardening self-check so this new SECURITY DEFINER
-- surface stays covered (guard_profile_mutation is unchanged in this
-- migration; set_profile_role is intentionally NOT SECURITY DEFINER, so it
-- is not part of this check).
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
