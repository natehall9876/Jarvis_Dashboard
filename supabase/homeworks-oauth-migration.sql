-- Storage for a real Homeworks OAuth 2.1 + PKCE connection (api.home.works),
-- verified live against the actual API on 2026-09-18 — this is genuinely
-- different from the existing Zapier-webhook-based sync, which never
-- authenticates Jarvis TO Homeworks at all. Single-owner app, so this is a
-- single-row table (owner_id is just for auditability, not multi-tenancy).
--
-- Tokens are never exposed to client-side code — only server actions/route
-- handlers read this table, same discipline as SUPABASE_SERVICE_ROLE_KEY.
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

drop policy if exists "authenticated_full_access" on homeworks_oauth_connection;
create policy "authenticated_full_access" on homeworks_oauth_connection
  for all to authenticated using (true) with check (true);
