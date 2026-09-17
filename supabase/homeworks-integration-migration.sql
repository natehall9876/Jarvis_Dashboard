-- =============================================================================
-- JARVIS — Homeworks external-record linking (additive, safe to re-run)
-- =============================================================================
-- Adds one nullable, uniquely-constrained column per table so records
-- synced in from Homeworks (via the Zapier webhook — see
-- src/app/api/integrations/homeworks/webhook/route.ts) can be matched and
-- updated idempotently instead of duplicated on every sync. A plain
-- `unique` constraint in Postgres allows any number of NULLs (NULL is
-- never equal to NULL), so existing rows with no Homeworks counterpart are
-- completely unaffected — this never touches existing data or existing
-- columns. (An earlier version of this file used a partial unique index
-- instead of a real constraint, which supabase-js's
-- `.upsert(data, {onConflict: "homeworks_id"})` cannot target — see
-- homeworks-integration-fix-constraint.sql if you already ran that
-- version.)
--
-- Run this in Supabase Studio -> SQL Editor -> New query -> Run.
-- =============================================================================

-- Postgres has no `ADD CONSTRAINT IF NOT EXISTS` — the DO block is the
-- standard, documented way to make adding a constraint idempotent (catch
-- the "already exists" error and move on).
alter table public.clients add column if not exists homeworks_id text;
do $$ begin
  alter table public.clients add constraint clients_homeworks_id_key unique (homeworks_id);
exception when duplicate_object then null;
end $$;

alter table public.properties add column if not exists homeworks_id text;
do $$ begin
  alter table public.properties add constraint properties_homeworks_id_key unique (homeworks_id);
exception when duplicate_object then null;
end $$;

alter table public.invoices add column if not exists homeworks_id text;
do $$ begin
  alter table public.invoices add constraint invoices_homeworks_id_key unique (homeworks_id);
exception when duplicate_object then null;
end $$;

-- =============================================================================
-- Done. No RLS changes needed here — the existing "authenticated_full_access"
-- policy on each table already covers these new columns. The webhook itself
-- does NOT go through that policy at all (a Zapier webhook has no logged-in
-- user session to authenticate as) — it uses the Supabase service-role key,
-- read only server-side in that one route, which bypasses RLS by design.
-- That is the one narrow, conventional exception to this project's
-- "no service-role key" rule, scoped to exactly one file.
-- =============================================================================
