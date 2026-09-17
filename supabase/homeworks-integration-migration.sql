-- =============================================================================
-- JARVIS — Homeworks external-record linking (additive, safe to re-run)
-- =============================================================================
-- Adds one nullable, uniquely-constrained column per table so records
-- synced in from Homeworks (via the Zapier webhook — see
-- src/app/api/integrations/homeworks/webhook/route.ts) can be matched and
-- updated idempotently instead of duplicated on every sync. A `unique`
-- constraint in Postgres allows any number of NULLs (NULL is never equal
-- to NULL), so existing rows with no Homeworks counterpart are completely
-- unaffected — this never touches existing data or existing columns.
--
-- Run this in Supabase Studio -> SQL Editor -> New query -> Run.
-- =============================================================================

alter table public.clients add column if not exists homeworks_id text;
create unique index if not exists clients_homeworks_id_key on public.clients (homeworks_id) where homeworks_id is not null;

alter table public.properties add column if not exists homeworks_id text;
create unique index if not exists properties_homeworks_id_key on public.properties (homeworks_id) where homeworks_id is not null;

alter table public.invoices add column if not exists homeworks_id text;
create unique index if not exists invoices_homeworks_id_key on public.invoices (homeworks_id) where homeworks_id is not null;

-- =============================================================================
-- Done. No RLS changes needed here — the existing "authenticated_full_access"
-- policy on each table already covers these new columns. The webhook itself
-- does NOT go through that policy at all (a Zapier webhook has no logged-in
-- user session to authenticate as) — it uses the Supabase service-role key,
-- read only server-side in that one route, which bypasses RLS by design.
-- That is the one narrow, conventional exception to this project's
-- "no service-role key" rule, scoped to exactly one file.
-- =============================================================================
