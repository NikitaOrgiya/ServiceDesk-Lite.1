-- Stage 2: centralized status-transition rules, immutable-field
-- enforcement, resolved_at bookkeeping, and automatic history logging.

-- Single source of truth for which status transitions are legal. Called
-- from the BEFORE UPDATE trigger below so *every* code path that changes
-- tickets.status is validated identically, regardless of which RPC
-- performed the UPDATE.
--
-- Documented choice: p_old_status = p_new_status returns FALSE (a
-- "transition" to the same status is rejected as meaningless, not treated
-- as a silent no-op) — see docs/database.md.
CREATE OR REPLACE FUNCTION public.is_valid_ticket_status_transition(
  p_old_status public.ticket_status,
  p_new_status public.ticket_status
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_old_status = p_new_status THEN FALSE
    WHEN p_old_status = 'new' AND p_new_status IN ('accepted', 'cancelled') THEN TRUE
    WHEN p_old_status = 'accepted' AND p_new_status IN ('in_progress', 'waiting', 'cancelled') THEN TRUE
    WHEN p_old_status = 'in_progress' AND p_new_status IN ('waiting', 'resolved', 'cancelled') THEN TRUE
    WHEN p_old_status = 'waiting' AND p_new_status IN ('in_progress', 'resolved', 'cancelled') THEN TRUE
    WHEN p_old_status = 'resolved' AND p_new_status IN ('closed', 'in_progress') THEN TRUE
    ELSE FALSE
  END;
$$;

-- BEFORE UPDATE guard for public.tickets. Combines three concerns in one
-- trigger (rather than several triggers with an implicit firing order)
-- because they must run in this exact sequence against the same NEW row:
--
--   1. Immutable-field protection (section 19) — id/public_number/
--      author_id/created_at can never change, not even through the admin
--      RPCs. This is enforced here (not only "no RPC exposes it") so a
--      future bug in application code cannot silently violate it.
--   2. Status-transition validation — delegates to
--      is_valid_ticket_status_transition() above.
--   3. resolved_at bookkeeping (section 17): entering 'resolved' stamps
--      resolved_at; 'resolved' -> 'in_progress' clears it; 'resolved' ->
--      'closed' preserves the original resolution timestamp; any other
--      status never carries a stale resolved_at.
CREATE OR REPLACE FUNCTION public.enforce_ticket_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'tickets.id is immutable';
  END IF;

  IF NEW.public_number IS DISTINCT FROM OLD.public_number THEN
    RAISE EXCEPTION 'tickets.public_number is immutable';
  END IF;

  IF NEW.author_id IS DISTINCT FROM OLD.author_id THEN
    RAISE EXCEPTION 'tickets.author_id is immutable';
  END IF;

  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'tickets.created_at is immutable';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT public.is_valid_ticket_status_transition(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'Invalid ticket status transition: % -> %', OLD.status, NEW.status
        USING ERRCODE = '22023';
    END IF;

    IF NEW.status = 'resolved' THEN
      NEW.resolved_at := now();
    ELSIF OLD.status = 'resolved' AND NEW.status = 'in_progress' THEN
      NEW.resolved_at := NULL;
    ELSIF NEW.status = 'closed' THEN
      NEW.resolved_at := COALESCE(NEW.resolved_at, OLD.resolved_at);
    ELSE
      NEW.resolved_at := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tickets_enforce_workflow
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_ticket_workflow();

-- Automatic, single-writer history log. This is the ONLY place that inserts
-- into ticket_history — no RPC does it directly — so a ticket created and
-- then updated by three different RPCs still produces exactly one history
-- row per actual change, and a rolled-back transaction leaves no trace
-- (AFTER triggers run inside the same transaction as the writing
-- statement). actor_id always comes from auth.uid(), which reflects the
-- calling session's JWT regardless of the SECURITY DEFINER context of
-- whichever RPC performed the write.
--
-- Event vocabulary (documented, stable):
--   ticket_created    — on INSERT
--   status_changed    — status changed to anything other than the two
--                        cases below (field_name = 'status')
--   ticket_cancelled  — status changed to 'cancelled'
--   ticket_closed     — status changed to 'closed'
--   priority_changed  — field_name = 'priority'
--   assignee_changed  — field_name = 'assignee_id'
--   due_at_changed    — field_name = 'due_at'
CREATE OR REPLACE FUNCTION public.record_ticket_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.ticket_history (ticket_id, actor_id, event_type)
    VALUES (NEW.id, COALESCE(v_actor, NEW.author_id), 'ticket_created');
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.ticket_history (ticket_id, actor_id, event_type, field_name, old_value, new_value)
      VALUES (
        NEW.id,
        v_actor,
        CASE
          WHEN NEW.status = 'cancelled' THEN 'ticket_cancelled'
          WHEN NEW.status = 'closed' THEN 'ticket_closed'
          ELSE 'status_changed'
        END,
        'status',
        OLD.status::TEXT,
        NEW.status::TEXT
      );
    END IF;

    IF NEW.priority IS DISTINCT FROM OLD.priority THEN
      INSERT INTO public.ticket_history (ticket_id, actor_id, event_type, field_name, old_value, new_value)
      VALUES (NEW.id, v_actor, 'priority_changed', 'priority', OLD.priority::TEXT, NEW.priority::TEXT);
    END IF;

    IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
      INSERT INTO public.ticket_history (ticket_id, actor_id, event_type, field_name, old_value, new_value)
      VALUES (NEW.id, v_actor, 'assignee_changed', 'assignee_id', OLD.assignee_id::TEXT, NEW.assignee_id::TEXT);
    END IF;

    IF NEW.due_at IS DISTINCT FROM OLD.due_at THEN
      INSERT INTO public.ticket_history (ticket_id, actor_id, event_type, field_name, old_value, new_value)
      VALUES (NEW.id, v_actor, 'due_at_changed', 'due_at', OLD.due_at::TEXT, NEW.due_at::TEXT);
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER tickets_record_history
  AFTER INSERT OR UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.record_ticket_history();
