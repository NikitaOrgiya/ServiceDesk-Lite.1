-- Stage 2: business-rule CHECK constraints, indexes, and the shared
-- updated_at bookkeeping trigger. No RLS/GRANT changes happen here — those
-- are centralized in migrations 09-11.

-- Business-rule CHECK constraints -------------------------------------------

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_full_name_not_blank CHECK (length(trim(full_name)) > 0);

ALTER TABLE public.ticket_number_counters
  ADD CONSTRAINT ticket_number_counters_year_reasonable CHECK (year BETWEEN 2000 AND 2999),
  ADD CONSTRAINT ticket_number_counters_last_value_non_negative CHECK (last_value >= 0);

ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_title_length CHECK (char_length(trim(title)) BETWEEN 5 AND 160),
  ADD CONSTRAINT tickets_description_length CHECK (char_length(trim(description)) BETWEEN 10 AND 5000),
  -- SD-YYYY-NNNN for the first 9999 tickets of a year, widening to a longer
  -- numeric tail after that instead of truncating or erroring — see
  -- public.generate_ticket_number() in migration 06.
  ADD CONSTRAINT tickets_public_number_format CHECK (public_number ~ '^SD-[0-9]{4}-[0-9]{4,}$');

ALTER TABLE public.ticket_comments
  ADD CONSTRAINT ticket_comments_message_length CHECK (char_length(trim(message)) BETWEEN 1 AND 3000);

-- Indexes --------------------------------------------------------------------
-- tickets.public_number already carries a UNIQUE constraint, which Postgres
-- backs with a unique btree index automatically. A second index on the same
-- column would be a redundant duplicate, so it is intentionally NOT created
-- here (documented decision — see docs/database.md).

CREATE INDEX tickets_author_id_created_at_idx ON public.tickets (author_id, created_at DESC);
CREATE INDEX tickets_assignee_id_status_idx ON public.tickets (assignee_id, status);
CREATE INDEX tickets_status_created_at_idx ON public.tickets (status, created_at DESC);
CREATE INDEX tickets_priority_created_at_idx ON public.tickets (priority, created_at DESC);
CREATE INDEX ticket_comments_ticket_id_created_at_idx ON public.ticket_comments (ticket_id, created_at);
CREATE INDEX ticket_history_ticket_id_created_at_idx ON public.ticket_history (ticket_id, created_at);

-- Shared updated_at trigger ----------------------------------------------
-- Invoker rights are sufficient here (it only assigns NEW.updated_at) and it
-- never needs to be callable as an RPC — EXECUTE is revoked from every role
-- in migration 11 alongside every other function in this project.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tickets_set_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER ticket_comments_set_updated_at
  BEFORE UPDATE ON public.ticket_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
