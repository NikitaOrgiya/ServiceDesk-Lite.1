-- ServiceDesk Lite (Neon) — admin bootstrap mechanism checks
-- (drizzle/0008_admin_bootstrap_hardening.sql).
-- Adapted from supabase/tests/admin_bootstrap_checks.sql: no
-- `service_role` check (no such Neon Data API role), profile ids are
-- plain TEXT provisioned via ensure_profile (no `auth.users` fixture
-- table), and the unknown-id error message matches the Neon version's
-- profiles-only existence check (no `auth.users` check to fall back on).
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f neon/tests/admin_bootstrap_checks.sql
--
-- Everything runs inside one transaction that is rolled back at the end.

\set ON_ERROR_STOP on

\ir _stub_auth_schema.sql

BEGIN;

CREATE FUNCTION pg_temp.assert(p_condition BOOLEAN, p_message TEXT)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT p_condition THEN
    RAISE EXCEPTION '%', p_message;
  END IF;
END;
$$;

CREATE FUNCTION pg_temp.expect_denied(p_sql TEXT)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
    RAISE EXCEPTION 'expected the statement to be denied, but it succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL; -- expected
  END;
END;
$$;

CREATE FUNCTION pg_temp.expect_error(p_pattern TEXT, p_sql TEXT)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
    RAISE EXCEPTION 'expected an error matching "%" but the statement succeeded', p_pattern;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE p_pattern THEN
        RAISE;
      END IF;
  END;
END;
$$;

-- Fixture: one plain employee, provisioned via the real first-login path.
SET LOCAL request.jwt.claims = '{"sub": "bootstrap-employee-test-id"}';
SET LOCAL ROLE authenticated;
SELECT public.ensure_profile('Bootstrap Employee');
RESET ROLE;
SET LOCAL request.jwt.claims = '';

-- ---------------------------------------------------------------------------
-- 1-2. Data-API-facing roles cannot call private.set_profile_role at all —
-- blocked at the schema level (no USAGE), before EXECUTE is even checked.
-- ---------------------------------------------------------------------------
SET ROLE authenticated;
SELECT pg_temp.expect_denied(
  format('SELECT private.set_profile_role(%L, %L::public.user_role)',
    'bootstrap-employee-test-id', 'admin')
);
RESET ROLE;

SET ROLE anon;
SELECT pg_temp.expect_denied(
  format('SELECT private.set_profile_role(%L, %L::public.user_role)',
    'bootstrap-employee-test-id', 'admin')
);
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 3. A regular (non-admin) authenticated session cannot change its own role
-- via a direct UPDATE — blocked by the missing table GRANT before
-- public.guard_profile_mutation's own logic is even reached.
-- ---------------------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"sub": "bootstrap-employee-test-id"}';
SET ROLE authenticated;
SELECT pg_temp.expect_denied(
  format('UPDATE public.profiles SET role = %L WHERE id = %L', 'admin', 'bootstrap-employee-test-id')
);
RESET ROLE;

-- SET LOCAL request.jwt.claims lives for the rest of this transaction, not
-- just the preceding statement — clear it explicitly so step 4 below is a
-- clean "no JWT claims at all" trusted session, not an artifact of step 3.
SET LOCAL request.jwt.claims = '';

-- ---------------------------------------------------------------------------
-- 4. The DB owner (this trusted session) CAN assign admin, with no trigger
-- disabling of any kind.
-- ---------------------------------------------------------------------------
SELECT private.set_profile_role('bootstrap-employee-test-id', 'admin');

SELECT pg_temp.assert(
  (SELECT role = 'admin' FROM public.profiles WHERE id = 'bootstrap-employee-test-id'),
  'expected private.set_profile_role to have assigned admin'
);

-- ---------------------------------------------------------------------------
-- 5. Repeated call is idempotent: calling it again with the same role
-- succeeds and leaves the profile in the same state, rather than erroring.
-- ---------------------------------------------------------------------------
SELECT private.set_profile_role('bootstrap-employee-test-id', 'admin');

SELECT pg_temp.assert(
  (SELECT role = 'admin' FROM public.profiles WHERE id = 'bootstrap-employee-test-id'),
  'expected a repeated call to remain idempotent'
);

-- ---------------------------------------------------------------------------
-- 6. Unknown user id fails clearly instead of silently doing nothing.
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_error(
  'No profiles row for id%',
  format('SELECT private.set_profile_role(%L, %L::public.user_role)',
    'nonexistent-test-id', 'admin')
);

-- ---------------------------------------------------------------------------
-- 7. guard_profile_mutation's original is_admin() bypass still works even
-- when request.jwt.claims IS present (i.e. an already-admin session isn't
-- accidentally caught by the new "no JWT claims" branch — the two
-- conditions are OR'd together, not one replacing the other). Simulates the
-- realistic case: an active admin (bootstrap-employee-test-id, now
-- promoted) deactivates a DIFFERENT profile — not their own row. Only this
-- trusted session has an UPDATE grant on profiles at all, so this
-- exercises the trigger's own logic directly rather than a full Data API
-- round trip.
-- ---------------------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"sub": "other-employee-test-id"}';
SET LOCAL ROLE authenticated;
SELECT public.ensure_profile('Other Employee');
RESET ROLE;

SET LOCAL request.jwt.claims = '{"sub": "bootstrap-employee-test-id"}';

UPDATE public.profiles SET is_active = FALSE WHERE id = 'other-employee-test-id';

SELECT pg_temp.assert(
  (SELECT NOT is_active FROM public.profiles WHERE id = 'other-employee-test-id'),
  'expected the is_admin() bypass to allow an active admin to deactivate another profile with JWT claims present'
);

SET LOCAL request.jwt.claims = '';

\echo 'All admin bootstrap checks passed.'

ROLLBACK;
