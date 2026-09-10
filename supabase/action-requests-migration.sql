-- =============================================================================
-- JARVIS — action_requests table (durable, cross-process idempotency)
-- =============================================================================
-- Additive only — same safety profile as activity-log-migration.sql. Run
-- this in Supabase Studio -> SQL Editor -> New query -> Run. Safe to re-run.
--
-- Why this exists: the write-action executor's "an action can execute at
-- most once" guarantee was originally an in-memory Set in the Node process
-- (lib/ai/actions/execute.ts). That's real protection against a double-click
-- within one running server, but it resets on every restart and doesn't
-- exist at all if more than one server instance is ever running (e.g. a
-- multi-instance deployment). This table makes the same guarantee durable:
-- a proposed action's id is the primary key, so a second INSERT attempt for
-- the same id fails with a real Postgres unique-violation (23505) no matter
-- which process or instance tries it — the database itself is the
-- single source of truth for "has this action already been claimed."
--
-- The app already handles this table not existing yet (falls back to the
-- in-memory guard), so nothing breaks before you run this.
-- =============================================================================

create table if not exists public.action_requests (
  -- This is the ProposedAction's own id (client-visible, generated when
  -- Jarvis proposes the action) — NOT a fresh server-generated uuid. Reusing
  -- it as the primary key is what turns "insert this row" into the atomic
  -- claim operation.
  id uuid primary key,
  created_at timestamptz not null default now(),
  action_type text not null,
  target_type text,
  target_id uuid,
  payload jsonb not null,
  snapshot jsonb,
  -- proposed | executing | executed | cancelled | stale | failed | invalid
  status text not null default 'executing',
  status_detail text,
  result jsonb,
  executed_at timestamptz,
  created_by uuid references auth.users(id)
);

create index if not exists action_requests_status_idx on public.action_requests (status, created_at desc);

alter table public.action_requests enable row level security;
drop policy if exists "authenticated_full_access" on public.action_requests;
create policy "authenticated_full_access" on public.action_requests for all to authenticated using (true) with check (true);

-- =============================================================================
-- Done. lib/ai/actions/execute.ts will start claiming rows here immediately —
-- no further setup needed. Before this migration, action execution is still
-- safe (in-memory guard), just not durable across a server restart.
-- =============================================================================
