-- Stage 2: automatic profile provisioning for new auth.users rows.

-- Creates the public.profiles row for a newly-registered auth.users row.
-- Always assigns role = 'employee' — raw_user_meta_data / raw_app_meta_data
-- supplied by the client (or a signup form) is NEVER trusted for role or
-- is_active. Promoting a profile to admin is a deliberately out-of-band
-- operation (a controlled SQL script run directly against the database,
-- see docs/database.md and supabase/seed.sql) — not something this trigger,
-- or any RPC in this stage, can do.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_full_name TEXT;
BEGIN
  v_full_name := NULLIF(trim(NEW.raw_user_meta_data ->> 'full_name'), '');

  IF v_full_name IS NULL THEN
    v_full_name := NULLIF(trim(split_part(NEW.email, '@', 1)), '');
  END IF;

  IF v_full_name IS NULL THEN
    v_full_name := 'Новый сотрудник';
  END IF;

  INSERT INTO public.profiles (id, full_name, role)
  VALUES (NEW.id, v_full_name, 'employee');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Note: a defense-in-depth guard against role/is_active self-escalation
-- (public.guard_profile_mutation) is defined in the next migration
-- (05_security_helpers), because it depends on public.is_admin().
