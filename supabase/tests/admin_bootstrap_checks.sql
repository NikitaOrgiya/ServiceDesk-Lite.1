-- ServiceDesk Lite — admin bootstrap mechanism checks
-- (supabase/migrations/202607190012_admin_bootstrap_hardening.sql).
--
-- Must be run through psql (uses the same pg_temp.expect_error/
-- expect_denied helper pattern as functional_checks.sql):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/admin_bootstrap_checks.sql
--
-- Everything runs inside one transaction that is rolled back at the end.

\set ON_ERROR_STOP on

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

-- Fixture: one plain employee.
INSERT INTO auth.users (id, email) VALUES
  ('55555555-5555-5555-5555-555555555555', 'bootstrap.employee@example.test');

-- ---------------------------------------------------------------------------
-- 1-3. Data-API-facing roles cannot call private.set_profile_role at all —
-- blocked at the schema level (no USAGE), before EXECUTE is even checked.
-- ---------------------------------------------------------------------------
SET ROLE authenticated;
SELECT pg_temp.expect_denied(
  format('SELECT private.set_profile_role(%L::uuid, %L::public.user_role)',
    '55555555-5555-5555-5555-555555555555', 'admin')
);
RESET ROLE;

SET ROLE anon;
SELECT pg_temp.expect_denied(
  format('SELECT private.set_profile_role(%L::uuid, %L::public.user_role)',
    '55555555-5555-5555-5555-555555555555', 'admin')
);
RESET ROLE;

SET ROLE service_role;
SELECT pg_temp.expect_denied(
  format('SELECT private.set_profile_role(%L::uuid, %L::public.user_role)',
    '55555555-5555-5555-5555-555555555555', 'admin')
);
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 4. A regular (non-admin) authenticated session cannot change its own role
-- via a direct UPDATE — blocked by the missing table GRANT (migration 10)
-- before public.guard_profile_mutation's own logic is even reached.
-- ---------------------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"sub": "55555555-5555-5555-5555-555555555555", "role": "authenticated"}';
SET ROLE authenticated;
SELECT pg_temp.expect_denied(
  format('UPDATE public.profiles SET role = %L WHERE id = %L::uuid', 'admin', '55555555-5555-5555-5555-555555555555')
);
RESET ROLE;

-- SET LOCAL request.jwt.claims lives for the rest of this transaction, not
-- just the preceding statement — clear it explicitly so step 5 below is a
-- clean "no JWT claims at all" trusted session, not an artifact of step 4.
SET LOCAL request.jwt.claims = '';

-- ---------------------------------------------------------------------------
-- 5. The DB owner (this trusted session) CAN assign admin, with no trigger
-- disabling of any kind.
-- ---------------------------------------------------------------------------
SELECT private.set_profile_role('55555555-5555-5555-5555-555555555555'::uuid, 'admin');

SELECT pg_temp.assert(
  (SELECT role = 'admin' FROM public.profiles WHERE id = '55555555-5555-5555-5555-555555555555'::uuid),
  'expected private.set_profile_role to have assigned admin'
);

-- ---------------------------------------------------------------------------
-- 6. Repeated call is idempotent: calling it again with the same role
-- succeeds and leaves the profile in the same state, rather than erroring.
-- ---------------------------------------------------------------------------
SELECT private.set_profile_role('55555555-5555-5555-5555-555555555555'::uuid, 'admin');

SELECT pg_temp.assert(
  (SELECT role = 'admin' FROM public.profiles WHERE id = '55555555-5555-5555-5555-555555555555'::uuid),
  'expected a repeated call to remain idempotent'
);

-- ---------------------------------------------------------------------------
-- 7. Unknown user id fails clearly instead of silently doing nothing.
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_error(
  'No auth.users row for id%',
  format('SELECT private.set_profile_role(%L::uuid, %L::public.user_role)',
    '99999999-9999-9999-9999-999999999999', 'admin')
);

-- ---------------------------------------------------------------------------
-- 8. guard_profile_mutation's original is_admin() bypass still works even
-- when request.jwt.claims IS present (i.e. an already-admin session isn't
-- accidentally caught by the new "no JWT claims" branch — the two
-- conditions are OR'd together, not one replacing the other). Simulates the
-- realistic case: an active admin (55555...) deactivates a DIFFERENT
-- profile (66666...) — not their own row, since an admin toggling their
-- OWN is_active off would (correctly) also remove their own bypass for any
-- further changes in the same session. Only this trusted session has an
-- UPDATE grant on profiles at all, so this exercises the trigger's own
-- logic directly rather than a full Data API round trip.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('66666666-6666-6666-6666-666666666666', 'bootstrap.other@example.test');

SET LOCAL request.jwt.claims = '{"sub": "55555555-5555-5555-5555-555555555555", "role": "authenticated"}';

UPDATE public.profiles SET is_active = FALSE WHERE id = '66666666-6666-6666-6666-666666666666'::uuid;

SELECT pg_temp.assert(
  (SELECT NOT is_active FROM public.profiles WHERE id = '66666666-6666-6666-6666-666666666666'::uuid),
  'expected the is_admin() bypass to allow an active admin to deactivate another profile with JWT claims present'
);

SET LOCAL request.jwt.claims = '';

\echo 'All admin bootstrap checks passed.'

ROLLBACK;
