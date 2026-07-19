-- ServiceDesk Lite (Neon) — functional database checks.
-- Adapted from supabase/tests/functional_checks.sql.
--
-- Differences from the Supabase original:
--   - No `auth.users` fixture table — profiles are created via the
--     `ensure_profile` RPC (drizzle/0010_profile_provisioning.sql), the
--     same path a real first login takes.
--   - Admin promotion uses `private.set_profile_role()`
--     (drizzle/0008_admin_bootstrap_hardening.sql), the actual production
--     mechanism, instead of `session_replication_role = replica`.
--   - Profile/user ids are plain TEXT, deliberately NOT UUID-shaped
--     (`emp-one-test-id` etc.), to prove nothing here assumes a UUID
--     Neon Auth user id. Ticket ids stay UUID (`::uuid` casts kept for
--     those only).
--
-- Everything runs inside one transaction that is rolled back at the end.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f neon/tests/functional_checks.sql

\set ON_ERROR_STOP on

\ir _stub_auth_schema.sql

BEGIN;

CREATE FUNCTION pg_temp.assert(p_condition BOOLEAN, p_message TEXT)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT p_condition THEN
    RAISE EXCEPTION '%', p_message;
  END IF;
END;
$$;

CREATE FUNCTION pg_temp.expect_error(p_pattern TEXT, p_sql TEXT)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
    RAISE EXCEPTION 'expected an error matching "%" but the statement succeeded', p_pattern;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE p_pattern THEN
        RAISE;
      END IF;
  END;
END;
$$;

CREATE FUNCTION pg_temp.expect_denied(p_sql TEXT)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
    RAISE EXCEPTION 'expected the statement to be denied by GRANT/RLS, but it succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL; -- expected
  END;
END;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures: two employees + one admin, provisioned via ensure_profile (the
-- real first-login path), then admin-one promoted via the trusted
-- private.set_profile_role() bootstrap.
-- ---------------------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"sub": "emp-one-test-id"}';
SET LOCAL ROLE authenticated;
SELECT public.ensure_profile('Employee One');
RESET ROLE;

SET LOCAL request.jwt.claims = '{"sub": "emp-two-test-id"}';
SET LOCAL ROLE authenticated;
SELECT public.ensure_profile('Employee Two');
RESET ROLE;

SET LOCAL request.jwt.claims = '{"sub": "admin-one-test-id"}';
SET LOCAL ROLE authenticated;
SELECT public.ensure_profile('Admin One');
RESET ROLE;

-- SET LOCAL request.jwt.claims lives for the rest of this transaction, not
-- just the preceding statement — clear it explicitly so
-- private.set_profile_role() below sees a clean "no JWT claims at all"
-- trusted session (see the same note in admin_bootstrap_checks.sql).
SET LOCAL request.jwt.claims = '';

SELECT private.set_profile_role('admin-one-test-id', 'admin');

SELECT pg_temp.assert(
  (SELECT role = 'admin' FROM public.profiles WHERE id = 'admin-one-test-id'),
  'fixture setup failed: admin promotion did not take effect'
);

-- ---------------------------------------------------------------------------
-- 1. Ticket numbering: sequential, per-year, not "count(*) + 1" (proven
--    later by cancelling ticket #4 without it affecting later numbers).
-- ---------------------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"sub": "emp-one-test-id"}';
SET LOCAL ROLE authenticated;

SELECT id AS ticket1_id, public_number AS ticket1_number
FROM public.create_ticket('First reported ticket', 'Something is broken in the office', 'hardware', 'normal') \gset

SELECT id AS ticket2_id, public_number AS ticket2_number
FROM public.create_ticket('Second reported ticket', 'Another unrelated problem report', 'software', 'low') \gset

SELECT pg_temp.assert(:'ticket1_number' ~ '^SD-[0-9]{4}-0001$',
  format('expected first ticket number to end in 0001, got %s', :'ticket1_number'));
SELECT pg_temp.assert(:'ticket2_number' ~ '^SD-[0-9]{4}-0002$',
  format('expected second ticket number to end in 0002, got %s', :'ticket2_number'));

-- Reject a too-short title (server-side re-validation, not just the client schema).
SELECT pg_temp.expect_error('Title must be between%',
  format('SELECT public.create_ticket(%L, %L, %L, %L)', 'Hi', 'Short title should be rejected', 'other', 'low'));

RESET ROLE;

-- employee.two creates the third ticket of the year.
SET LOCAL request.jwt.claims = '{"sub": "emp-two-test-id"}';
SET LOCAL ROLE authenticated;

SELECT id AS ticket3_id, public_number AS ticket3_number
FROM public.create_ticket('Third reported ticket', 'Reported by the second employee', 'network', 'high') \gset

SELECT pg_temp.assert(:'ticket3_number' ~ '^SD-[0-9]{4}-0003$',
  format('expected third ticket number to end in 0003 regardless of author, got %s', :'ticket3_number'));

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 2. Exactly one 'ticket_created' history row per created ticket.
-- ---------------------------------------------------------------------------
SELECT pg_temp.assert(
  (SELECT count(*) = 3 FROM public.ticket_history
   WHERE event_type = 'ticket_created'
     AND ticket_id IN (:'ticket1_id'::uuid, :'ticket2_id'::uuid, :'ticket3_id'::uuid)),
  'expected exactly 3 ticket_created history rows'
);

-- ---------------------------------------------------------------------------
-- 3. Status transitions, resolved_at bookkeeping, and terminal states —
--    exercised on ticket #1 via the admin RPC.
-- ---------------------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"sub": "admin-one-test-id"}';
SET LOCAL ROLE authenticated;

-- Allowed chain: new -> accepted -> in_progress -> waiting -> resolved -> closed.
SELECT public.admin_set_ticket_status(:'ticket1_id'::uuid, 'accepted');
SELECT public.admin_set_ticket_status(:'ticket1_id'::uuid, 'in_progress');
SELECT public.admin_set_ticket_status(:'ticket1_id'::uuid, 'waiting');
SELECT public.admin_set_ticket_status(:'ticket1_id'::uuid, 'resolved');

SELECT pg_temp.assert(
  (SELECT resolved_at IS NOT NULL FROM public.tickets WHERE id = :'ticket1_id'::uuid),
  'resolved_at was not stamped on entering resolved'
);

SELECT public.admin_set_ticket_status(:'ticket1_id'::uuid, 'closed');

SELECT pg_temp.assert(
  (SELECT resolved_at IS NOT NULL FROM public.tickets WHERE id = :'ticket1_id'::uuid),
  'resolved_at should be preserved across resolved -> closed'
);
SELECT pg_temp.assert(
  (SELECT status = 'closed' FROM public.tickets WHERE id = :'ticket1_id'::uuid),
  'expected ticket to be closed'
);

-- Terminal: closed has no further transitions.
SELECT pg_temp.expect_error('Invalid ticket status transition%',
  format('SELECT public.admin_set_ticket_status(%L::uuid, %L)', :'ticket1_id', 'in_progress'));

RESET ROLE;

-- Ticket #2: new -> resolved directly must be rejected; resolved ->
-- in_progress must clear resolved_at; cancelled is terminal.
SET LOCAL request.jwt.claims = '{"sub": "admin-one-test-id"}';
SET LOCAL ROLE authenticated;

SELECT pg_temp.expect_error('Invalid ticket status transition%',
  format('SELECT public.admin_set_ticket_status(%L::uuid, %L)', :'ticket2_id', 'resolved'));

SELECT public.admin_set_ticket_status(:'ticket2_id'::uuid, 'accepted');
SELECT public.admin_set_ticket_status(:'ticket2_id'::uuid, 'in_progress');
SELECT public.admin_set_ticket_status(:'ticket2_id'::uuid, 'resolved');

SELECT pg_temp.assert(
  (SELECT resolved_at IS NOT NULL FROM public.tickets WHERE id = :'ticket2_id'::uuid),
  'resolved_at was not stamped on entering resolved (ticket 2)'
);

SELECT public.admin_set_ticket_status(:'ticket2_id'::uuid, 'in_progress');

SELECT pg_temp.assert(
  (SELECT resolved_at IS NULL FROM public.tickets WHERE id = :'ticket2_id'::uuid),
  'resolved_at should be cleared on resolved -> in_progress'
);

SELECT public.admin_set_ticket_status(:'ticket2_id'::uuid, 'waiting');
SELECT public.admin_set_ticket_status(:'ticket2_id'::uuid, 'cancelled');

SELECT pg_temp.expect_error('Invalid ticket status transition%',
  format('SELECT public.admin_set_ticket_status(%L::uuid, %L)', :'ticket2_id', 'in_progress'));

RESET ROLE;

-- Same-status "transition" is rejected as meaningless (documented choice).
SET LOCAL request.jwt.claims = '{"sub": "admin-one-test-id"}';
SET LOCAL ROLE authenticated;

SELECT pg_temp.expect_error('Invalid ticket status transition%',
  format('SELECT public.admin_set_ticket_status(%L::uuid, %L)', :'ticket3_id', 'new'));

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 4. priority_changed / assignee_changed / due_at_changed history, and the
--    inactive-profile guard on assignment.
-- ---------------------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"sub": "admin-one-test-id"}';
SET LOCAL ROLE authenticated;

SELECT public.admin_set_ticket_priority(:'ticket3_id'::uuid, 'critical');
SELECT public.admin_set_ticket_assignee(:'ticket3_id'::uuid, 'emp-two-test-id');
SELECT public.admin_set_ticket_due_at(:'ticket3_id'::uuid, (now() + interval '3 days'));

RESET ROLE;

SELECT pg_temp.assert(
  (SELECT EXISTS (
    SELECT 1 FROM public.ticket_history
    WHERE ticket_id = :'ticket3_id'::uuid AND event_type = 'priority_changed' AND new_value = 'critical'
  )),
  'priority_changed history row not found'
);
SELECT pg_temp.assert(
  (SELECT EXISTS (
    SELECT 1 FROM public.ticket_history WHERE ticket_id = :'ticket3_id'::uuid AND event_type = 'assignee_changed'
  )),
  'assignee_changed history row not found'
);
SELECT pg_temp.assert(
  (SELECT EXISTS (
    SELECT 1 FROM public.ticket_history WHERE ticket_id = :'ticket3_id'::uuid AND event_type = 'due_at_changed'
  )),
  'due_at_changed history row not found'
);

-- Clearing due_at (NULL) is a valid, distinct request.
SET LOCAL request.jwt.claims = '{"sub": "admin-one-test-id"}';
SET LOCAL ROLE authenticated;
SELECT public.admin_set_ticket_due_at(:'ticket3_id'::uuid, NULL);
RESET ROLE;

SELECT pg_temp.assert(
  (SELECT due_at IS NULL FROM public.tickets WHERE id = :'ticket3_id'::uuid),
  'expected due_at to be cleared'
);

-- Deactivate employee.two, then confirm they can no longer be assigned.
-- (private schema function, run as the trusted connecting role directly —
-- no session_replication_role trick needed, since UPDATE here is not
-- reached through the Data API and guard_profile_mutation's
-- request.jwt.claims bypass already covers a trusted direct session.)
UPDATE public.profiles SET is_active = FALSE WHERE id = 'emp-two-test-id';

SET LOCAL request.jwt.claims = '{"sub": "admin-one-test-id"}';
SET LOCAL ROLE authenticated;

SELECT pg_temp.expect_error('Assignee must be%',
  format('SELECT public.admin_set_ticket_assignee(%L::uuid, %L)', :'ticket3_id', 'emp-two-test-id'));

RESET ROLE;

UPDATE public.profiles SET is_active = TRUE WHERE id = 'emp-two-test-id';

-- ---------------------------------------------------------------------------
-- 5. cancel_own_ticket: only the author, only while 'new'.
-- ---------------------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"sub": "emp-one-test-id"}';
SET LOCAL ROLE authenticated;

SELECT id AS ticket4_id
FROM public.create_ticket('A ticket to cancel', 'This ticket will be cancelled by its author', 'other', 'low') \gset

SELECT public.cancel_own_ticket(:'ticket4_id'::uuid);

SELECT pg_temp.assert(
  (SELECT status = 'cancelled' FROM public.tickets WHERE id = :'ticket4_id'::uuid),
  'expected ticket to be cancelled'
);

-- Cannot cancel a ticket that is no longer 'new'.
SELECT pg_temp.expect_error('Ticket cannot be cancelled%',
  format('SELECT public.cancel_own_ticket(%L::uuid)', :'ticket4_id'));

SELECT id AS ticket5_id
FROM public.create_ticket('Another cancellable ticket', 'Owned by employee one only', 'other', 'low') \gset

RESET ROLE;

-- employee.two cannot cancel employee.one's ticket.
SET LOCAL request.jwt.claims = '{"sub": "emp-two-test-id"}';
SET LOCAL ROLE authenticated;

SELECT pg_temp.expect_error('Ticket cannot be cancelled%',
  format('SELECT public.cancel_own_ticket(%L::uuid)', :'ticket5_id'));

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 6. Comments: own-ticket-only for employees, any-ticket for admins, and no
--    direct INSERT path.
-- ---------------------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"sub": "emp-two-test-id"}';
SET LOCAL ROLE authenticated;

SELECT pg_temp.expect_error('Ticket not found%',
  format('SELECT public.add_ticket_comment(%L::uuid, %L)', :'ticket1_id', 'employee.two on someone else''s ticket'));

RESET ROLE;

SET LOCAL request.jwt.claims = '{"sub": "admin-one-test-id"}';
SET LOCAL ROLE authenticated;
SELECT public.add_ticket_comment(:'ticket1_id'::uuid, 'Admin comment on any ticket works fine');
RESET ROLE;

-- Direct INSERT is not granted to authenticated at all.
SET LOCAL request.jwt.claims = '{"sub": "emp-one-test-id"}';
SET LOCAL ROLE authenticated;

SELECT pg_temp.expect_denied(
  format('INSERT INTO public.ticket_comments (ticket_id, author_id, message) VALUES (%L::uuid, auth.user_id(), %L)',
    :'ticket1_id', 'direct insert')
);

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 7. Immutability: id / public_number / author_id / created_at cannot be
--    changed, even by a direct UPDATE run with full (owner) privileges —
--    proving the guard lives in the trigger, not merely in "no RPC exposes
--    it" / "no GRANT allows it".
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_error('%author_id is immutable%',
  format('UPDATE public.tickets SET author_id = %L WHERE id = %L::uuid',
    'emp-two-test-id', :'ticket3_id'));

SELECT pg_temp.expect_error('%public_number is immutable%',
  format('UPDATE public.tickets SET public_number = %L WHERE id = %L::uuid', 'SD-0000-9999', :'ticket3_id'));

-- ---------------------------------------------------------------------------
-- 8. Direct UPDATE on tickets is denied to authenticated (RPC-only mutation).
-- ---------------------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"sub": "admin-one-test-id"}';
SET LOCAL ROLE authenticated;

SELECT pg_temp.expect_denied(
  format('UPDATE public.tickets SET priority = %L WHERE id = %L::uuid', 'low', :'ticket3_id')
);

RESET ROLE;

\echo 'All functional checks passed.'

ROLLBACK;
