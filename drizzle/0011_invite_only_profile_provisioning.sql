-- Neon migration: invite-only profile provisioning.
--
-- Problem: Neon Auth allows public self-service sign-up (no allow-list on
-- the Neon Auth API itself — see docs/migration/supabase-to-neon.md and
-- README's "Создание Employee/Admin" section), and the previous
-- public.ensure_profile(TEXT) (0010) let *any* authenticated caller mint
-- their own public.profiles row on first call, with a caller-supplied
-- display name. For an internal ServiceDesk that is unacceptable: anyone
-- who discovers the sign-up endpoint could self-provision an `employee`
-- account with real application access.
--
-- Fix: gate provisioning behind a closed invitation list
-- (private.user_invitations, never exposed to the Data API) keyed by
-- email. ensure_profile() now resolves the caller's email itself from the
-- trusted neon_auth.user table (never from client input), and only
-- creates a profile if an unused invitation exists for that email.
-- full_name/department come from the invitation, not the caller. The
-- assigned role is unconditionally 'employee' — an invitation's
-- intended_role is informational only (lets an operator record "this
-- person should eventually be admin") and is never auto-applied; admin
-- remains reachable only through the existing private.set_profile_role()
-- trusted-operator path (0008), unchanged here.
--
-- Neon Auth's own `neon_auth.user.role` column (its built-in Better Auth
-- admin-plugin field) is a completely different, unrelated concept — this
-- migration never reads or writes it. The only application role is, and
-- remains, public.profiles.role.

CREATE TABLE private.user_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  department TEXT,
  intended_role public.user_role NOT NULL DEFAULT 'employee',
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ,
  CONSTRAINT user_invitations_email_unique UNIQUE (email),
  CONSTRAINT user_invitations_full_name_not_blank CHECK (length(trim(full_name)) > 0)
);

-- Normalize email to trimmed lowercase on write, so lookups from
-- ensure_profile() (which lowercases neon_auth.user.email before
-- comparing) always match regardless of how the operator typed it in.
CREATE OR REPLACE FUNCTION private.normalize_invitation_email()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.email := lower(trim(NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_invitations_normalize_email
  BEFORE INSERT OR UPDATE ON private.user_invitations
  FOR EACH ROW
  EXECUTE FUNCTION private.normalize_invitation_email();

-- Defense in depth: schema-level USAGE on `private` is already revoked
-- from PUBLIC/anonymous/authenticated (0008) so the Data API can never
-- resolve `private.*` at all — this explicit per-table REVOKE is a
-- second, independent layer in case that schema-level grant ever changes.
REVOKE ALL ON private.user_invitations FROM PUBLIC, anonymous, authenticated;
REVOKE ALL ON FUNCTION private.normalize_invitation_email() FROM PUBLIC, anonymous, authenticated;

COMMENT ON TABLE private.user_invitations IS
  'Closed invitation list gating public.ensure_profile(). Never exposed to '
  'the Data API — managed only by a trusted operator session (see '
  'scripts/invite-user.ts). intended_role is informational only and is '
  'never auto-applied; admin promotion remains a separate, manual step via '
  'private.set_profile_role().';

-- Replace the previous, caller-name-trusting, invite-blind ensure_profile.
DROP FUNCTION public.ensure_profile(TEXT);

CREATE FUNCTION public.ensure_profile()
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid TEXT := auth.user_id();
  v_email TEXT;
  v_full_name TEXT;
  v_department TEXT;
  v_row public.profiles;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Idempotent: an already-provisioned caller gets their existing row back
  -- unconditionally — no invitation is consulted or consumed on repeat calls.
  SELECT * INTO v_row FROM public.profiles WHERE id = v_uid;
  IF FOUND THEN
    RETURN v_row;
  END IF;

  -- The caller's email is resolved from the trusted Neon Auth user table
  -- by their own verified Auth id — never accepted as an argument, so it
  -- cannot be spoofed to claim someone else's invitation.
  SELECT lower(u.email) INTO v_email FROM neon_auth."user" u WHERE u.id::text = v_uid;

  -- Same generic denial whether the Auth account itself is unresolvable or
  -- simply has no invitation — never reveals which case applies, so a
  -- caller cannot use the error to probe whether a given account exists.
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Access denied: no active invitation for this account' USING ERRCODE = '42501';
  END IF;

  -- Atomic claim: this UPDATE both checks and consumes the invitation in
  -- one statement, so two concurrent calls for the same email can never
  -- both succeed — the second one simply matches zero rows.
  UPDATE private.user_invitations
  SET is_used = TRUE, used_at = now()
  WHERE email = v_email AND is_used = FALSE
  RETURNING full_name, department INTO v_full_name, v_department;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Access denied: no active invitation for this account' USING ERRCODE = '42501';
  END IF;

  -- Role is always 'employee', regardless of the invitation's
  -- intended_role — admin is never auto-assigned by this function.
  INSERT INTO public.profiles (id, full_name, department, role)
  VALUES (v_uid, v_full_name, v_department, 'employee')
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_profile() FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_profile() TO authenticated;

-- Re-run the search_path hardening self-check so this migration's new
-- SECURITY DEFINER surface stays covered (normalize_invitation_email is
-- intentionally NOT SECURITY DEFINER — it runs as whatever role performs
-- the INSERT/UPDATE, which is only ever the trusted operator connection —
-- so it is not part of this check, matching private.set_profile_role in 0008).
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
