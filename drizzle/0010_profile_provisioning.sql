-- Neon migration: profile provisioning without an auth.users trigger.
--
-- The Supabase prototype created public.profiles rows via a trigger on
-- auth.users (handle_new_user(), 202607190004_profile_provisioning.sql).
-- Neon does not expose a documented, stable trigger point equivalent to
-- `auth.users` for this application to depend on (see
-- docs/migration/supabase-to-neon.md). Instead, the application calls this
-- RPC once after the caller has an established Neon Auth session — see
-- ensureProfileForCurrentUser() in src/features/auth/server/ensure-profile.ts.
--
-- Always assigns role = 'employee' and never touches an existing row —
-- p_full_name is caller-supplied display text only, never role or
-- is_active. Promoting a profile to admin remains an out-of-band operation
-- (private.set_profile_role via a trusted DATABASE_URL session, see
-- 0008_admin_bootstrap_hardening.sql and scripts/make-admin.ts).
CREATE OR REPLACE FUNCTION public.ensure_profile(p_full_name TEXT)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid TEXT := auth.user_id();
  v_full_name TEXT := NULLIF(trim(p_full_name), '');
  v_row public.profiles;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF v_full_name IS NULL THEN
    v_full_name := 'Новый сотрудник';
  END IF;

  INSERT INTO public.profiles (id, full_name, role)
  VALUES (v_uid, v_full_name, 'employee')
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO v_row FROM public.profiles WHERE id = v_uid;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_profile(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_profile(TEXT) TO authenticated;

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
