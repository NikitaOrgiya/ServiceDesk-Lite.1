-- Stage 3: replaces the stage-2 admin bootstrap procedure
-- (`SET session_replication_role = replica`) with a mechanism that does
-- not require disabling triggers at all. This migration does not modify
-- any stage-2 migration file — it only adds new objects and replaces
-- (via CREATE OR REPLACE) the one stage-2 function whose behavior needs
-- to change.
--
-- Mechanism, and why it's closed to the Data API:
--
--   1. A new `private` schema holds `private.set_profile_role()`. USAGE on
--      this schema is revoked from PUBLIC/anon/authenticated/service_role
--      below, which means PostgREST — which always connects as one of
--      those three roles — can never even resolve `private.*`, regardless
--      of any function-level grant. This is the primary boundary.
--   2. EXECUTE on the function itself is also explicitly revoked from all
--      four for defense in depth, and the function independently checks
--      `current_user` and refuses to run as anon/authenticated/service_role.
--   3. `public.guard_profile_mutation()` (defined in migration 05) is
--      updated to allow a role/is_active change when there is no
--      `request.jwt.claims` GUC set at all — i.e. the call did not come
--      through PostgREST (every Data API request carries a JWT, even the
--      anon key is one), so this only ever matches a direct, trusted
--      database session (psql, Supabase Studio's SQL Editor, or an
--      equivalent). This is what lets `private.set_profile_role()` (or a
--      plain trusted `UPDATE`) actually succeed without disabling the
--      trigger, and without trusting `current_user` inside that trigger —
--      `current_user` cannot be used there because
--      `guard_profile_mutation()` is itself SECURITY DEFINER, which makes
--      `current_user` reflect the function's *owner*, not the original
--      caller, for the duration of the call.

CREATE SCHEMA private;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON SCHEMA private IS
  'Not exposed to PostgREST (no api schema entry, no USAGE grant to '
  'anon/authenticated/service_role). Holds owner-only operational '
  'functions such as admin bootstrap — see docs/database.md.';

-- Assigns `p_role` to an existing profile. Deliberately NOT SECURITY
-- DEFINER: it must run with the privileges of whoever actually calls it
-- (a trusted direct session), not with elevated owner privileges callable
-- by anyone who might reach it — the schema-level USAGE revocation above
-- is what actually closes off reachability, not this function's own
-- privilege level.
CREATE FUNCTION private.set_profile_role(
  p_user_id UUID,
  p_role public.user_role
)
RETURNS public.profiles
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_row public.profiles;
BEGIN
  IF current_user IN ('anon', 'authenticated', 'service_role') THEN
    RAISE EXCEPTION
      'private.set_profile_role must be run by a trusted database session, not via the Data API'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'No auth.users row for id %', p_user_id USING ERRCODE = 'P0002';
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

REVOKE ALL ON FUNCTION private.set_profile_role(UUID, public.user_role)
  FROM PUBLIC, anon, authenticated, service_role;

-- Replaces the migration-05 version. Same immutable-id guard; the
-- role/is_active guard now also lets a call through when there is no
-- request.jwt.claims GUC at all (see the block comment above) in addition
-- to the existing public.is_admin() bypass for already-admin sessions.
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

-- CREATE OR REPLACE preserves the function's existing ACL (its EXECUTE
-- grants from migration 11 carry over unchanged), but this REVOKE is
-- reissued explicitly anyway so this migration's intended final state
-- does not rely on that carry-over behavior being remembered correctly.
REVOKE ALL ON FUNCTION public.guard_profile_mutation()
  FROM PUBLIC, anon, authenticated, service_role;

-- Same automated hardening check migration 11 ends with, re-run here
-- because this migration redefines a SECURITY DEFINER function.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL unnest(COALESCE(p.proconfig, ARRAY[]::TEXT[])) AS cfg
    WHERE n.nspname = 'public'
      AND p.proname = 'guard_profile_mutation'
      AND p.prosecdef = TRUE
      AND cfg = 'search_path=""'
  ) THEN
    RAISE EXCEPTION 'public.guard_profile_mutation is missing SET search_path = '''' after replacement';
  END IF;
END;
$$;
