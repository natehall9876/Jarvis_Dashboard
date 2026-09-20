-- =============================================================================
-- JARVIS — Homeworks event/job linking (additive, safe to re-run)
-- =============================================================================
-- Adds homeworks_id to jobs, matching the identical pattern already used
-- for clients/properties/invoices (supabase/homeworks-integration-
-- migration.sql) — a real, uniquely-constrained column, not a partial
-- index (a partial index can't be targeted by supabase-js's
-- .upsert(data, {onConflict: "homeworks_id"}), a bug already found and
-- fixed once for the other three tables; this avoids reintroducing it).
--
-- Needed before Homeworks jobs/events can be synced idempotently — without
-- a stable identifier column, every sync run would either need to guess at
-- matching an existing job (risky) or always insert a new one (duplicates
-- every jobs sync).
--
-- Run this in Supabase Studio -> SQL Editor -> New query -> Run.
-- =============================================================================

alter table public.jobs add column if not exists homeworks_id text;
do $$ begin
  alter table public.jobs add constraint jobs_homeworks_id_key unique (homeworks_id);
exception when duplicate_object then null;
end $$;

-- No RLS changes needed — the existing "authenticated_full_access" policy
-- on jobs already covers this new column.
