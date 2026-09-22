-- =============================================================================
-- JARVIS — QuickBooks OAuth token storage (additive, safe to re-run)
-- =============================================================================
-- Single-row token store, same security model as homeworks_oauth_connection
-- (see homeworks-oauth-migration.sql / homeworks-oauth-security-fix.sql for
-- the full reasoning): this table holds live bearer tokens for an external
-- financial system, a materially worse exposure than ordinary business data
-- if leaked. RLS is enabled with NO policy for authenticated/anon at all —
-- that role can never read or write this table under any circumstances, not
-- even this app's own server code, which is why
-- lib/integrations/quickbooks-connection.ts uses the service-role client and
-- independently checks for a real signed-in session before every read/write.
--
-- realm_id is Intuit's company identifier — required on every QuickBooks API
-- call, not just the tokens, so it's stored alongside them.
--
-- Run this once in the Supabase SQL editor. Safe to re-run.
-- =============================================================================

create table if not exists public.quickbooks_oauth_connection (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  connected_by uuid references auth.users(id),
  realm_id text not null,
  access_token text not null,
  refresh_token text not null,
  access_token_expires_at timestamptz not null,
  refresh_token_expires_at timestamptz not null
);

alter table public.quickbooks_oauth_connection enable row level security;

-- Deliberately no policy for authenticated/anon — only the service-role
-- client (which bypasses RLS) can reach this table.
drop policy if exists "authenticated_full_access" on public.quickbooks_oauth_connection;
