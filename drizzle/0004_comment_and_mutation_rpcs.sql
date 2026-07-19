-- Neon migration: comments, self-service cancellation, and admin mutations.
-- Adapted from 202607190008_comment_and_mutation_rpcs.sql:
-- auth.uid() -> auth.user_id(), ids TEXT. `authenticated` has no direct
-- INSERT/UPDATE grant on tickets or ticket_comments (0006); every one of
-- these functions is SECURITY DEFINER and performs its own authorization
-- check, because the Postgres role `authenticated` covers both employees
-- and admins.

CREATE OR REPLACE FUNCTION public.add_ticket_comment(
  p_ticket_id UUID,
  p_message TEXT
)
RETURNS public.ticket_comments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid TEXT := auth.user_id();
  v_message TEXT := trim(p_message);
  v_row public.ticket_comments;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Active profile required' USING ERRCODE = '42501';
  END IF;

  IF char_length(v_message) < 1 OR char_length(v_message) > 3000 THEN
    RAISE EXCEPTION 'Message must be between 1 and 3000 characters' USING ERRCODE = '22023';
  END IF;

  IF NOT public.can_access_ticket(p_ticket_id) THEN
    RAISE EXCEPTION 'Ticket not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.ticket_comments AS tc (ticket_id, author_id, message)
  VALUES (p_ticket_id, v_uid, v_message)
  RETURNING tc.* INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_own_ticket(p_ticket_id UUID)
RETURNS public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid TEXT := auth.user_id();
  v_row public.tickets;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Active profile required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.tickets AS t
  SET status = 'cancelled',
      updated_by = v_uid
  WHERE t.id = p_ticket_id
    AND t.author_id = v_uid
    AND t.status = 'new'
  RETURNING t.* INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket cannot be cancelled' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$$;

-- ---------------------------------------------------------------------------
-- Admin mutations. Each one: requires auth.user_id(), requires
-- public.is_admin(), verifies the ticket exists, never touches
-- author_id/public_number/created_at, always stamps
-- updated_by = auth.user_id(), and runs as a single UPDATE statement.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_set_ticket_status(
  p_ticket_id UUID,
  p_status public.ticket_status
)
RETURNS public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_status public.ticket_status;
  v_row public.tickets;
BEGIN
  IF auth.user_id() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator privileges required' USING ERRCODE = '42501';
  END IF;

  SELECT status INTO v_current_status FROM public.tickets WHERE id = p_ticket_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_valid_ticket_status_transition(v_current_status, p_status) THEN
    RAISE EXCEPTION 'Invalid ticket status transition: % -> %', v_current_status, p_status
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.tickets AS t
  SET status = p_status,
      updated_by = auth.user_id()
  WHERE t.id = p_ticket_id
  RETURNING t.* INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_ticket_priority(
  p_ticket_id UUID,
  p_priority public.ticket_priority
)
RETURNS public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.tickets;
BEGIN
  IF auth.user_id() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator privileges required' USING ERRCODE = '42501';
  END IF;

  IF p_priority IS NULL THEN
    RAISE EXCEPTION 'Priority is required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tickets AS t
  SET priority = p_priority,
      updated_by = auth.user_id()
  WHERE t.id = p_ticket_id
  RETURNING t.* INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_ticket_assignee(
  p_ticket_id UUID,
  p_assignee_id TEXT
)
RETURNS public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.tickets;
BEGIN
  IF auth.user_id() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator privileges required' USING ERRCODE = '42501';
  END IF;

  IF p_assignee_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles pr WHERE pr.id = p_assignee_id AND pr.is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Assignee must be an existing, active profile' USING ERRCODE = '23514';
  END IF;

  UPDATE public.tickets AS t
  SET assignee_id = p_assignee_id,
      updated_by = auth.user_id()
  WHERE t.id = p_ticket_id
  RETURNING t.* INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_ticket_due_at(
  p_ticket_id UUID,
  p_due_at TIMESTAMPTZ
)
RETURNS public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.tickets;
BEGIN
  IF auth.user_id() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator privileges required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.tickets AS t
  SET due_at = p_due_at,
      updated_by = auth.user_id()
  WHERE t.id = p_ticket_id
  RETURNING t.* INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$$;
