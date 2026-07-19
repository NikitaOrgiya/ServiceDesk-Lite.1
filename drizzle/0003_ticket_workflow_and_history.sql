-- Neon migration: centralized status-transition rules, immutable-field
-- enforcement, resolved_at bookkeeping, and automatic history logging.
-- Adapted from 202607190007_ticket_workflow_and_history.sql:
-- auth.uid() -> auth.user_id(), actor_id/author_id are TEXT.

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

-- Automatic, single-writer history log. actor_id always comes from
-- auth.user_id(), which reflects the calling session's JWT regardless of
-- the SECURITY DEFINER context of whichever RPC performed the write.
--
-- Event vocabulary (documented, stable):
--   ticket_created, status_changed, ticket_cancelled, ticket_closed,
--   priority_changed, assignee_changed, due_at_changed
CREATE OR REPLACE FUNCTION public.record_ticket_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor TEXT := auth.user_id();
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
