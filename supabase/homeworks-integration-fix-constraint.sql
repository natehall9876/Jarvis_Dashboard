-- =============================================================================
-- JARVIS — fix homeworks_id conflict target (run AFTER homeworks-integration-migration.sql)
-- =============================================================================
-- The original migration made homeworks_id unique via a PARTIAL index
-- (`where homeworks_id is not null`), reasoning that multiple NULLs should
-- be allowed. That reasoning was right, but the partial index was the
-- wrong way to get there: Postgres's ON CONFLICT clause requires an exact
-- match to a real constraint (or a full, non-partial unique index) — it
-- will not target a partial index unless the same WHERE clause is repeated
-- in the ON CONFLICT clause itself, which supabase-js's `.upsert(data,
-- {onConflict: "homeworks_id"})` has no way to do. Every upsert from the
-- webhook was failing with a real Postgres error ("there is no unique or
-- exclusion constraint matching the ON CONFLICT specification"), silently
-- reported as a generic "Sync failed." (a separate bug, now also fixed, in
-- the webhook's error handling).
--
-- A plain `unique` constraint doesn't have this problem AND still allows
-- any number of NULLs (NULL is never considered equal to another NULL by a
-- standard unique constraint) — it's simply the correct tool here. This
-- migration drops the three partial indexes and replaces each with a real
-- unique constraint on the same column. Existing rows are unaffected: every
-- row's homeworks_id is still NULL at this point (nothing has synced
-- successfully yet), and a table full of NULLs trivially satisfies a
-- unique constraint.
--
-- Run this in Supabase Studio -> SQL Editor -> New query -> Run, after
-- confirming homeworks-integration-migration.sql already ran successfully.
-- =============================================================================

-- Postgres has no `ADD CONSTRAINT IF NOT EXISTS` — the DO block below is
-- the standard, documented way to make adding a constraint idempotent
-- (catch the "already exists" error and move on) so this whole file stays
-- safe to run more than once, consistent with every other migration here.
do $$
begin
  drop index if exists public.clients_homeworks_id_key;
  begin
    alter table public.clients add constraint clients_homeworks_id_key unique (homeworks_id);
  exception when duplicate_object then null;
  end;

  drop index if exists public.properties_homeworks_id_key;
  begin
    alter table public.properties add constraint properties_homeworks_id_key unique (homeworks_id);
  exception when duplicate_object then null;
  end;

  drop index if exists public.invoices_homeworks_id_key;
  begin
    alter table public.invoices add constraint invoices_homeworks_id_key unique (homeworks_id);
  exception when duplicate_object then null;
  end;
end $$;

-- =============================================================================
-- Done. No data is modified — this only replaces how uniqueness on
-- homeworks_id is enforced, not what's stored. After this runs, the
-- webhook's .upsert(..., {onConflict: "homeworks_id"}) calls will work.
-- =============================================================================
