-- =============================================================================
-- JARVIS — job notes and owner tasks (additive, safe to re-run)
-- =============================================================================
-- Adds two NEW tables. Nothing existing is modified, no data is touched.
--
--   job_notes   Append-only, attributed notes on a job (who/when/how it was
--               added). This is separate from jobs.notes, which stays as-is.
--   owner_tasks Reminders / to-dos for the owner ("bring the dethatcher"),
--               optionally linked to a job, client, or property.
--
-- Run in Supabase Studio -> SQL Editor -> New query -> Run.
-- =============================================================================

create table if not exists public.job_notes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  body text not null check (length(btrim(body)) > 0 and length(body) <= 2000),
  -- 'owner' (typed in the app) or 'voice' (dictated / created through Jarvis)
  source text not null default 'owner' check (source in ('owner', 'voice')),
  created_by uuid references auth.users(id)
);
create index if not exists job_notes_job_idx on public.job_notes (job_id, created_at desc);

create table if not exists public.owner_tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null check (length(btrim(title)) > 0 and length(title) <= 300),
  notes text,
  due_date date,
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  completed_at timestamptz,
  source text not null default 'owner' check (source in ('owner', 'voice')),
  job_id uuid references public.jobs(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  created_by uuid references auth.users(id)
);
create index if not exists owner_tasks_status_due_idx on public.owner_tasks (status, due_date);

alter table public.job_notes enable row level security;
alter table public.owner_tasks enable row level security;

drop policy if exists "authenticated_full_access" on public.job_notes;
create policy "authenticated_full_access" on public.job_notes for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_full_access" on public.owner_tasks;
create policy "authenticated_full_access" on public.owner_tasks for all to authenticated using (true) with check (true);
