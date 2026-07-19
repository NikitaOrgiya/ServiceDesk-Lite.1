-- Stage 2: core application tables (shape only — PK/FK/NOT NULL/DEFAULT).
-- Business-rule CHECK constraints and indexes are added in the next
-- migration (03_constraints_indexes_and_updated_at) so this file stays
-- focused on the relational shape of the schema.

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role public.user_role NOT NULL DEFAULT 'employee',
  department TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS
  'Application profile for each auth.users row. Rows are created only by '
  'public.handle_new_user() (role is always ''employee''); role/is_active '
  'are never client-writable — see docs/database.md.';

CREATE TABLE public.ticket_number_counters (
  year INTEGER PRIMARY KEY,
  last_value INTEGER NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.ticket_number_counters IS
  'Internal counter used only by public.generate_ticket_number() to mint '
  'atomic ticket numbers. No anon/authenticated access exists to this table.';

CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_number TEXT UNIQUE NOT NULL,
  author_id UUID NOT NULL REFERENCES public.profiles (id),
  assignee_id UUID REFERENCES public.profiles (id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category public.ticket_category NOT NULL,
  priority public.ticket_priority NOT NULL DEFAULT 'normal',
  status public.ticket_status NOT NULL DEFAULT 'new',
  due_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  updated_by UUID REFERENCES public.profiles (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tickets IS
  'Support tickets. Client-writable only through public.create_ticket() and '
  'the admin_set_ticket_*/cancel_own_ticket RPCs — direct INSERT/UPDATE is '
  'blocked by RLS and revoked GRANTs (see migrations 09-10).';

CREATE TABLE public.ticket_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets (id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles (id),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ticket_comments IS
  'Ticket comments. Editing/deleting is out of scope for the MVP — rows are '
  'inserted only via public.add_ticket_comment().';

CREATE TABLE public.ticket_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets (id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles (id),
  event_type TEXT NOT NULL,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ticket_history IS
  'Append-only audit trail populated exclusively by the '
  'public.record_ticket_history() trigger. No direct client writes exist.';
