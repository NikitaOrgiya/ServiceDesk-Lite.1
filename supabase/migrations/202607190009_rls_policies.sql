-- Stage 2: Row Level Security. Enabled on all five application tables.
-- Table GRANTs (migration 10) and function EXECUTE grants (migration 11)
-- are handled separately — RLS alone only restricts which *rows* a query
-- can see/touch, it does not grant the ability to run a given SQL command
-- in the first place. A role with an UPDATE grant but no matching policy
-- still can't update anything (RLS blocks it), and a role with a matching
-- policy but no UPDATE grant still can't update anything either (GRANT
-- blocks it) — we deliberately rely on both, see docs/database.md.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_number_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_history ENABLE ROW LEVEL SECURITY;

-- profiles: an employee reads only their own row; an admin reads all.
-- No INSERT/UPDATE/DELETE policy exists for any client role — profiles are
-- created only by public.handle_new_user() (SECURITY DEFINER, bypasses
-- RLS) and role/is_active changes have no policy-backed path in this stage.
CREATE POLICY profiles_select_own_or_admin
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.is_admin());

-- tickets: an employee reads only tickets they authored; an admin reads
-- all. Compares author_id directly instead of calling
-- can_access_ticket(id) — that helper is reserved for comments/history (see
-- migration 05) precisely so the tickets policy never depends on a
-- function that itself queries tickets.
CREATE POLICY tickets_select_own_or_admin
  ON public.tickets
  FOR SELECT
  TO authenticated
  USING (author_id = auth.uid() OR public.is_admin());

-- ticket_comments: readable when the underlying ticket is accessible
-- (own ticket, or admin). No INSERT/UPDATE/DELETE policy — comments are
-- created only through public.add_ticket_comment().
CREATE POLICY ticket_comments_select_accessible
  ON public.ticket_comments
  FOR SELECT
  TO authenticated
  USING (public.can_access_ticket(ticket_id));

-- ticket_history: same visibility rule as its ticket. No mutation policy —
-- history rows are created only by the public.record_ticket_history()
-- trigger.
CREATE POLICY ticket_history_select_accessible
  ON public.ticket_history
  FOR SELECT
  TO authenticated
  USING (public.can_access_ticket(ticket_id));

-- ticket_number_counters: intentionally has ZERO policies. Combined with
-- the revoked table grants in migration 10, this table is unreachable by
-- anon/authenticated under any circumstance — only
-- public.generate_ticket_number() (SECURITY DEFINER, owned by the table
-- owner, bypasses RLS) ever touches it.
