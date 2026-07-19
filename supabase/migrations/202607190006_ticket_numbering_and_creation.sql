-- Stage 2: atomic ticket numbering + the create_ticket RPC.

-- Mints the next ticket number for the current server-side year, e.g.
-- 'SD-2026-0001'. Atomic: INSERT ... ON CONFLICT (year) DO UPDATE takes a
-- row-level lock on the counter row, so concurrent callers are serialized
-- by Postgres itself and RETURNING always reflects a unique post-increment
-- value — this is deliberately not "SELECT count(*) + 1", which would race
-- under concurrent inserts and could produce duplicate numbers.
--
-- Padding: lpad(..., GREATEST(length(text), 4), '0') pads short numbers up
-- to 4 digits but never *shrinks* the target length below the number's own
-- length. Postgres's lpad() truncates its input if the input is already
-- longer than the requested length, so a naive `lpad(v_next::text, 4, '0')`
-- would corrupt any number past 9999 (e.g. 10000 -> '1000'). Using
-- GREATEST(...) avoids that entirely — numbers beyond 9999 grow the tail
-- instead of being truncated or erroring, matching tickets_public_number_format.
CREATE OR REPLACE FUNCTION public.generate_ticket_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_year INTEGER := extract(year FROM now())::INTEGER;
  v_next INTEGER;
BEGIN
  INSERT INTO public.ticket_number_counters AS c (year, last_value)
  VALUES (v_year, 1)
  ON CONFLICT (year)
  DO UPDATE SET last_value = c.last_value + 1
  RETURNING last_value INTO v_next;

  RETURN 'SD-' || v_year::text || '-' || lpad(v_next::text, GREATEST(length(v_next::text), 4), '0');
END;
$$;

-- Creates a ticket on behalf of the current session. Never accepts
-- author_id, public_number, status, assignee_id, created_at from the
-- caller — those are exactly the fields a browser cannot be trusted with.
-- ticket_created history is recorded automatically by the
-- public.record_ticket_history() AFTER INSERT trigger (migration 07), not
-- here, so there is exactly one history row per created ticket.
CREATE OR REPLACE FUNCTION public.create_ticket(
  p_title TEXT,
  p_description TEXT,
  p_category public.ticket_category,
  p_priority public.ticket_priority DEFAULT 'normal'
)
RETURNS TABLE (id UUID, public_number TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_title TEXT := trim(p_title);
  v_description TEXT := trim(p_description);
  v_number TEXT;
  v_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Active profile required' USING ERRCODE = '42501';
  END IF;

  IF char_length(v_title) < 5 OR char_length(v_title) > 160 THEN
    RAISE EXCEPTION 'Title must be between 5 and 160 characters' USING ERRCODE = '22023';
  END IF;

  IF char_length(v_description) < 10 OR char_length(v_description) > 5000 THEN
    RAISE EXCEPTION 'Description must be between 10 and 5000 characters' USING ERRCODE = '22023';
  END IF;

  IF p_category IS NULL THEN
    RAISE EXCEPTION 'Category is required' USING ERRCODE = '22023';
  END IF;

  v_number := public.generate_ticket_number();

  INSERT INTO public.tickets AS t (public_number, author_id, title, description, category, priority, status)
  VALUES (v_number, v_uid, v_title, v_description, p_category, COALESCE(p_priority, 'normal'), 'new')
  RETURNING t.id INTO v_id;

  RETURN QUERY SELECT v_id, v_number;
END;
$$;
