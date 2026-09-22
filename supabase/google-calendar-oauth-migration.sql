-- =============================================================================
-- JARVIS — Google Calendar OAuth token storage (additive, safe to re-run)
-- =============================================================================
-- Same security model as homeworks_oauth_connection and
-- quickbooks_oauth_connection: single-row bearer-token store, RLS enabled
-- with NO policy for authenticated/anon — only the service-role client
-- (lib/integrations/google-calendar-connection.ts) can reach this table,
-- and that file independently verifies a real signed-in session before
-- every read/write since bypassing RLS means it is the only access control
-- left. See homeworks-oauth-migration.sql for the full reasoning.
--
-- selected_calendar_id / selected_calendar_summary hold the ONE calendar the
-- owner picked after connecting (Google accounts often have several) — set
-- by the calendar-selection step, not at connect time.
--
-- Run this once in the Supabase SQL editor. Safe to re-run.
-- =============================================================================

create table if not exists public.google_calendar_oauth_connection (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  connected_by uuid references auth.users(id),
  access_token text not null,
  refresh_token text not null,
  access_token_expires_at timestamptz not null,
  scope text,
  selected_calendar_id text,
  selected_calendar_summary text
);

alter table public.google_calendar_oauth_connection enable row level security;

drop policy if exists "authenticated_full_access" on public.google_calendar_oauth_connection;
