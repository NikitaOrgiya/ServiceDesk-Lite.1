-- Shared preamble for the neon/tests/*.sql scripts. Included via psql's
-- \ir at the top of each test file.
--
-- On a real Neon project with the Data API enabled, `anon`/`authenticated`
-- roles and `auth.user_id()` already exist — this preamble is a no-op
-- there (every guard below only creates something if it is genuinely
-- absent). Its actual purpose is to make these tests runnable against a
-- plain local/native PostgreSQL instance (no Neon project available in
-- this migration's environment — see docs/migration/supabase-to-neon.md),
-- mirroring the "homemade stub" approach the Supabase-era prototype used
-- for its own local testing before a linked project was available.
--
-- Never run this against a database you do not own/control: creating
-- roles is a cluster-wide, not per-database, operation.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'user_id'
  ) THEN
    CREATE SCHEMA IF NOT EXISTS auth;

    -- Mirrors the real Neon Data API's auth.user_id(): the JWT `sub`
    -- claim, read from the same request.jwt.claims GUC PostgREST-family
    -- APIs use. Real Neon validates the JWT signature before setting this
    -- GUC; this stub trusts whatever the test itself sets locally.
    EXECUTE $ddl$
      CREATE FUNCTION auth.user_id() RETURNS TEXT
      LANGUAGE sql STABLE
      AS $fn$
        SELECT NULLIF(current_setting('request.jwt.claims', true), '')::json ->> 'sub';
      $fn$;
    $ddl$;
  END IF;
END;
$$;
