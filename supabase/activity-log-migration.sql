-- =============================================================================
-- JARVIS — activity_log table (immutable business activity history)
-- =============================================================================
-- Adds ONE new, purely additive table. Nothing existing is touched, no data
-- is modified, no column is dropped or renamed. Safe to run once; safe to
-- re-run (every statement is idempotent).
--
-- Purpose: a queryable timeline of what happened to a business record over
-- time — "what happened at this property?" — independent of whatever the
-- record's own current-state columns show right now. The app treats rows
-- here as append-only: nothing in the codebase updates or deletes a row
-- once written (RLS still technically permits it, matching the existing
-- single-owner "authenticated_full_access" policy used on every other
-- table, rather than introducing a special-case policy for this one table).
--
-- Run this in Supabase Studio -> SQL Editor -> New query -> Run.
-- =============================================================================

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- What this event is about: 'job', 'client', 'invoice', 'quote', 'equipment', etc.
  entity_type text not null,
  entity_id uuid not null,
  -- A short machine-readable event name, e.g. 'job_rescheduled', 'job_status_changed',
  -- 'job_crew_changed', 'job_created', 'invoice_sent'. Not an enum (Postgres enums are
  -- painful to extend) — application code owns the vocabulary.
  event_type text not null,
  -- One-sentence human-readable description — this is what gets rendered directly,
  -- no client-side template needed.
  summary text not null,
  -- Structured before/after or extra context (e.g. {"from": "2026-09-11", "to": "2026-09-12"}).
  -- Genuinely variable per event_type, which is exactly what JSON is appropriate for —
  -- the queryable facts (entity_type, entity_id, event_type, created_at) stay as real columns.
  detail jsonb,
  -- Who/what produced this event: 'jarvis' (AI-confirmed action), 'owner' (direct edit
  -- through a form), or 'system' (e.g. a future sync/integration).
  source text not null default 'system',
  created_by uuid references auth.users(id)
);

create index if not exists activity_log_entity_idx on public.activity_log (entity_type, entity_id, created_at desc);
create index if not exists activity_log_created_at_idx on public.activity_log (created_at desc);

alter table public.activity_log enable row level security;
drop policy if exists "authenticated_full_access" on public.activity_log;
create policy "authenticated_full_access" on public.activity_log for all to authenticated using (true) with check (true);

-- =============================================================================
-- Done. Jarvis's write-action executor (lib/ai/actions/execute.ts) and the
-- form-based job actions (lib/actions/jobs.ts) will start writing rows here
-- automatically the next time the app runs — no further setup needed. The
-- app already handles this table not existing yet (queries fail soft), so
-- nothing breaks before you run this; the "History" section on a job page
-- just stays empty until you do.
-- =============================================================================
