-- Storage for a real Homeworks OAuth 2.1 + PKCE connection (api.home.works),
-- verified live against the actual API on 2026-09-18 — this is genuinely
-- different from the existing Zapier-webhook-based sync, which never
-- authenticates Jarvis TO Homeworks at all. Single-owner app, so this is a
-- single-row table (owner_id is just for auditability, not multi-tenancy).
--
-- SECURITY: this table holds live bearer tokens for an external system —
-- a materially worse exposure than ordinary business data if leaked, so it
-- does NOT get the project's normal `to authenticated using (true)`
-- pattern (an earlier version of this file did; fixed 2026-09-18, see
-- supabase/homeworks-oauth-security-fix.sql for the corrective migration
-- if you already ran the old version). RLS is enabled with NO policy for
-- `authenticated`/`anon` at all, meaning that role can never read or write
-- this table under any circumstances — not even this app's own server
-- code, which is why lib/integrations/homeworks-connection.ts uses the
-- service-role client instead (see lib/supabase/admin.ts's doc comment
-- for the full reasoning: RLS structurally cannot distinguish "this app's
-- server" from "an authenticated user's browser calling Supabase's REST
-- API directly with the same JWT," so denying the role entirely and
-- moving access to server-only code — which independently verifies a real
-- session before touching this table — is the only correct boundary here.
--
-- Run this once in the Supabase SQL editor, in the same sitting as the
-- other pending migrations. Safe to re-run.

create table if not exists homeworks_oauth_connection (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  connected_by uuid references auth.users(id),
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scope text
);

alter table homeworks_oauth_connection enable row level security;

-- Deliberately no policy for authenticated/anon — see the SECURITY note
-- above. Only the service-role client (which bypasses RLS) can reach this
-- table; drop any pre-existing permissive policy in case this file is
-- re-run against a table that still has the old, insecure one.
drop policy if exists "authenticated_full_access" on homeworks_oauth_connection;
