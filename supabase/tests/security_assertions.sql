-- ServiceDesk Lite — static security audit.
--
-- Run against the local database with, e.g.:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security_assertions.sql
-- (ON_ERROR_STOP=1 is what makes psql exit non-zero when an assertion
-- fails — without it, psql prints the error but may still exit 0.)
--
-- All checks are collected into a temp table first, so a single run
-- reports every violation at once instead of stopping at the first one.
-- The script raises an exception (and therefore rolls back and fails) if
-- one or more assertions are violated.

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
-- 3. service_role has zero table privileges (documented decision — the
--    admin client performs no table operations at this stage, see
--    docs/database.md).
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
      IF has_table_privilege('service_role', format('public.%I', v_table), v_priv) THEN
        INSERT INTO _security_assertion_failures
        VALUES (format('service_role unexpectedly has %s on public.%s', v_priv, v_table));
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. authenticated has exactly SELECT (never INSERT/UPDATE/DELETE) on the
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
-- 5. Each client-facing table has exactly one RLS policy, and it is
--    SELECT-only — no INSERT/UPDATE/DELETE policy exists that could open a
--    write path even if a future migration accidentally adds a GRANT.
--    ticket_number_counters has zero policies.
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
-- 6/7/8/9/10. PUBLIC and anon have EXECUTE on nothing in public schema;
-- authenticated has EXECUTE on exactly the allowed RPC/helper set and
-- nothing else. This also covers generate_ticket_number() and every
-- trigger function being unreachable directly (they are not in the
-- allow-list, so the ELSE branch asserts authenticated does NOT have them).
-- Matched by function OID (not by printing a signature), so this is
-- unaffected by search_path/type-qualification formatting.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fn RECORD;
  v_allowed TEXT[] := ARRAY[
    'is_admin',
    'can_access_ticket',
    'can_view_profile',
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
-- 11. Every SECURITY DEFINER function in public has SET search_path = ''
--     (never unset, never SET search_path = public).
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
