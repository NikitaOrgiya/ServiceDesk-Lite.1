-- ServiceDesk Lite (Neon) — static security audit.
-- Adapted from supabase/tests/security_assertions.sql: no `service_role`
-- checks (Neon Data API has no such role — see
-- drizzle/0006_table_grants.sql), `ensure_profile` added to the allowed
-- EXECUTE list (drizzle/0010_profile_provisioning.sql).
--
-- Run against a disposable/local database with, e.g.:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f neon/tests/security_assertions.sql
-- (ON_ERROR_STOP=1 is what makes psql exit non-zero when an assertion
-- fails — without it, psql prints the error but may still exit 0.)
--
-- All checks are collected into a temp table first, so a single run
-- reports every violation at once instead of stopping at the first one.

\ir _stub_auth_schema.sql

BEGIN;

CREATE TEMPORARY TABLE _security_assertion_failures (message TEXT) ON COMMIT DROP;

-- ---------------------------------------------------------------------------
-- 1. RLS is enabled on all five application tables.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['profiles', 'ticket_number_counters', 'tickets', 'ticket_comments', 'ticket_history']
  LOOP
    IF NOT (
      SELECT relrowsecurity FROM pg_class
      WHERE relnamespace = 'public'::regnamespace AND relname = v_table
    ) THEN
      INSERT INTO _security_assertion_failures VALUES (format('RLS is not enabled on public.%s', v_table));
    END IF;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. anon has zero table privileges on every application table.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_table TEXT;
  v_priv TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['profiles', 'ticket_number_counters', 'tickets', 'ticket_comments', 'ticket_history']
  LOOP
    FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']
    LOOP
      IF has_table_privilege('anon', format('public.%I', v_table), v_priv) THEN
        INSERT INTO _security_assertion_failures
        VALUES (format('anon unexpectedly has %s on public.%s', v_priv, v_table));
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. authenticated has exactly SELECT (never INSERT/UPDATE/DELETE) on the
--    four client-facing tables, and nothing at all on the internal counter
--    table.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['profiles', 'tickets', 'ticket_comments', 'ticket_history']
  LOOP
    IF NOT has_table_privilege('authenticated', format('public.%I', v_table), 'SELECT') THEN
      INSERT INTO _security_assertion_failures
      VALUES (format('authenticated is missing expected SELECT on public.%s', v_table));
    END IF;

    IF has_table_privilege('authenticated', format('public.%I', v_table), 'INSERT')
      OR has_table_privilege('authenticated', format('public.%I', v_table), 'UPDATE')
      OR has_table_privilege('authenticated', format('public.%I', v_table), 'DELETE')
    THEN
      INSERT INTO _security_assertion_failures
      VALUES (format('authenticated unexpectedly has a direct write privilege on public.%s', v_table));
    END IF;
  END LOOP;

  IF has_table_privilege('authenticated', 'public.ticket_number_counters', 'SELECT')
    OR has_table_privilege('authenticated', 'public.ticket_number_counters', 'INSERT')
    OR has_table_privilege('authenticated', 'public.ticket_number_counters', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.ticket_number_counters', 'DELETE')
  THEN
    INSERT INTO _security_assertion_failures
    VALUES ('authenticated unexpectedly has a privilege on public.ticket_number_counters');
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Each client-facing table has exactly one RLS policy, and it is
--    SELECT-only. ticket_number_counters has zero policies.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_table TEXT;
  v_count INTEGER;
  v_non_select INTEGER;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['profiles', 'tickets', 'ticket_comments', 'ticket_history']
  LOOP
    SELECT count(*) INTO v_count FROM pg_policies WHERE schemaname = 'public' AND tablename = v_table;
    IF v_count <> 1 THEN
      INSERT INTO _security_assertion_failures
      VALUES (format('public.%s expected exactly 1 policy, found %s', v_table, v_count));
    END IF;

    SELECT count(*) INTO v_non_select
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = v_table AND cmd <> 'SELECT';
    IF v_non_select <> 0 THEN
      INSERT INTO _security_assertion_failures VALUES (format('public.%s has a non-SELECT policy', v_table));
    END IF;
  END LOOP;

  SELECT count(*) INTO v_count FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ticket_number_counters';
  IF v_count <> 0 THEN
    INSERT INTO _security_assertion_failures VALUES ('public.ticket_number_counters unexpectedly has RLS policies');
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. PUBLIC and anon have EXECUTE on nothing in public schema; authenticated
--    has EXECUTE on exactly the allowed RPC/helper set and nothing else.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fn RECORD;
  v_allowed TEXT[] := ARRAY[
    'is_admin',
    'can_access_ticket',
    'can_view_profile',
    'ensure_profile',
    'create_ticket',
    'add_ticket_comment',
    'cancel_own_ticket',
    'admin_set_ticket_status',
    'admin_set_ticket_priority',
    'admin_set_ticket_assignee',
    'admin_set_ticket_due_at'
  ];
BEGIN
  FOR v_fn IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    IF has_function_privilege('public', v_fn.oid, 'EXECUTE') THEN
      INSERT INTO _security_assertion_failures
      VALUES (format('PUBLIC unexpectedly has EXECUTE on %s()', v_fn.proname));
    END IF;

    IF has_function_privilege('anon', v_fn.oid, 'EXECUTE') THEN
      INSERT INTO _security_assertion_failures
      VALUES (format('anon unexpectedly has EXECUTE on %s()', v_fn.proname));
    END IF;

    IF v_fn.proname = ANY (v_allowed) THEN
      IF NOT has_function_privilege('authenticated', v_fn.oid, 'EXECUTE') THEN
        INSERT INTO _security_assertion_failures
        VALUES (format('authenticated is missing expected EXECUTE on %s()', v_fn.proname));
      END IF;
    ELSE
      IF has_function_privilege('authenticated', v_fn.oid, 'EXECUTE') THEN
        INSERT INTO _security_assertion_failures
        VALUES (format('authenticated unexpectedly has EXECUTE on %s()', v_fn.proname));
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Every SECURITY DEFINER function in public has SET search_path = ''.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_rec RECORD;
BEGIN
  FOR v_rec IN
    SELECT p.proname, p.proconfig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = TRUE
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM unnest(COALESCE(v_rec.proconfig, ARRAY[]::TEXT[])) AS cfg WHERE cfg = 'search_path=""'
    ) THEN
      INSERT INTO _security_assertion_failures
      VALUES (format('SECURITY DEFINER function %s does not have an empty search_path', v_rec.proname));
    END IF;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. private schema is unreachable by anon/authenticated (no USAGE grant).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF has_schema_privilege('anon', 'private', 'USAGE') THEN
    INSERT INTO _security_assertion_failures VALUES ('anon unexpectedly has USAGE on schema private');
  END IF;
  IF has_schema_privilege('authenticated', 'private', 'USAGE') THEN
    INSERT INTO _security_assertion_failures VALUES ('authenticated unexpectedly has USAGE on schema private');
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Final verdict.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_count INTEGER;
  v_failures TEXT;
BEGIN
  SELECT count(*), string_agg(message, E'\n  - ') INTO v_count, v_failures FROM _security_assertion_failures;

  IF v_count > 0 THEN
    RAISE EXCEPTION E'% security assertion(s) FAILED:\n  - %', v_count, v_failures;
  ELSE
    RAISE NOTICE 'All security assertions passed.';
  END IF;
END;
$$;

COMMIT;
