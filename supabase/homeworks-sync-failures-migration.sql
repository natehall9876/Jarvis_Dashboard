-- =============================================================================
-- JARVIS — homeworks_sync_failures table (Homeworks inbound sync failures)
-- =============================================================================
-- Adds ONE new, purely additive table. Nothing existing is touched, no data
-- is modified, no column is dropped or renamed. Safe to run once; safe to
-- re-run (every statement is idempotent).
--
-- Purpose: a failed Homeworks webhook delivery or bulk-import row has no
-- corresponding Jarvis business record to attach an audit-trail entry to —
-- that is exactly the failure being recorded (e.g. "a property arrived
-- before its customer was synced", or "the webhook secret didn't match").
-- activity_log (see activity-log-migration.sql) requires a real entity_id
-- (uuid, not null) because it documents what happened to an existing
-- record; forcing a failure into that shape would mean either inventing a
-- fake uuid (explicitly rejected — "do not attach failures to fake customer
-- or job IDs") or attaching it to an unrelated real record (misleading).
-- This is a separate, small table instead, scoped to exactly this purpose.
--
-- Run this in Supabase Studio -> SQL Editor -> New query -> Run.
-- =============================================================================

create table if not exists public.homeworks_sync_failures (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- 'webhook' (the live Zapier-triggered single-record endpoint) or
  -- 'bulk_import' (the owner-triggered CSV/JSON backfill endpoint) — kept
  -- distinct so a burst of bulk-import failures during a one-time backfill
  -- never gets confused with the live webhook actually being broken.
  origin text not null check (origin in ('webhook', 'bulk_import')),
  -- 'invalid_secret' (auth failed before any payload was read),
  -- 'invalid_payload' (auth passed, but the body didn't match the expected
  -- shape), or 'processing_failed' (a well-formed, authenticated record
  -- that failed to sync — e.g. its parent customer/property doesn't exist
  -- yet, or a genuine database error).
  reason text not null check (reason in ('invalid_secret', 'invalid_payload', 'processing_failed')),
  -- Null for invalid_secret/invalid_payload, where there may be no parseable
  -- entity_type yet (an invalid_secret request's body is never even read).
  entity_type text,
  homeworks_id text,
  -- Always a clean, human-readable message — never a raw exception object,
  -- stack trace, request header, or the provided (wrong) secret itself. See
  -- lib/integrations/homeworks-sync-failures.ts's classifyRejection(), which
  -- is unit-tested specifically for this (e2e/homeworks-sync-failures.spec.ts).
  error_message text not null,
  detail jsonb
);

create index if not exists homeworks_sync_failures_created_at_idx on public.homeworks_sync_failures (created_at desc);
create index if not exists homeworks_sync_failures_origin_idx on public.homeworks_sync_failures (origin, created_at desc);

alter table public.homeworks_sync_failures enable row level security;
drop policy if exists "authenticated_full_access" on public.homeworks_sync_failures;
create policy "authenticated_full_access" on public.homeworks_sync_failures for all to authenticated using (true) with check (true);

-- =============================================================================
-- Done. The Homeworks webhook and bulk-import routes
-- (src/app/api/integrations/homeworks/{webhook,import}/route.ts) will start
-- writing rows here automatically the next time either runs into a failure —
-- no further setup needed. Written through the service-role client (same
-- narrow, documented exception as every other write those routes already
-- make — see lib/supabase/admin.ts), since neither route has a Supabase Auth
-- session for RLS to authorize against. The Settings page's "Sync status"
-- panel reads this table to show recent failures; before this migration is
-- run, that section just stays empty (queries fail soft).
-- =============================================================================
