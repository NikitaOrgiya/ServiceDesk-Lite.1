-- Stage 2: database foundation.
--
-- gen_random_uuid() has been a built-in pg_catalog function since
-- PostgreSQL 13 (this project runs on major_version = 17, see
-- supabase/config.toml), so no pgcrypto/uuid-ossp extension is required for
-- UUID generation. No extensions are created in this migration.

-- Application roles. Deliberately excludes a separate "assignee" role — in
-- this MVP an assignee is simply an active profile (employee or admin), see
-- docs/database.md.
CREATE TYPE public.user_role AS ENUM ('employee', 'admin');

-- Ticket lifecycle. The full transition table is enforced in code by
-- public.is_valid_ticket_status_transition() (migration 07) and documented
-- in docs/database.md — this type only fixes the vocabulary.
CREATE TYPE public.ticket_status AS ENUM (
  'new',
  'accepted',
  'in_progress',
  'waiting',
  'resolved',
  'closed',
  'cancelled'
);

CREATE TYPE public.ticket_priority AS ENUM ('low', 'normal', 'high', 'critical');

CREATE TYPE public.ticket_category AS ENUM (
  'hardware',
  'software',
  'network',
  'access',
  'workplace',
  'other'
);
