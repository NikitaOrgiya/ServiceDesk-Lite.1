-- Assigns the 'admin' role to an existing user's profile.
--
-- This is a one-off operational script, not a migration — run it by hand,
-- directly against the database, as a trusted owner session:
--
--   psql "$DATABASE_URL" -v target_email="'demo.admin@example.com'" \
--     -f supabase/scripts/make_admin.sql
--
-- or paste it into the Supabase Studio SQL Editor (which also connects
-- directly, not through the Data API) after replacing the placeholder
-- email below. `private.set_profile_role()` (see migration
-- 202607190012_admin_bootstrap_hardening.sql) refuses to run for
-- anon/authenticated/service_role, so this only works from a session like
-- these — it is not reachable over HTTP.
--
-- NEVER commit a real admin email into this file or into Git history.
-- The value below is a placeholder; override it with -v as shown above.

\if :{?target_email}
\else
  \set target_email '''demo.admin@example.com'''
\endif

SELECT r.id AS profile_id, r.full_name, r.role
FROM auth.users u
CROSS JOIN LATERAL private.set_profile_role(u.id, 'admin') AS r
WHERE u.email = :target_email;
