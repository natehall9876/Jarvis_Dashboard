-- =============================================================================
-- JARVIS — RLS policies for authenticated-only access
-- =============================================================================
-- Keeps Row-Level Security fully ENABLED on every table (nothing is
-- disabled, nothing is opened up to the public/anon role). This just adds
-- one policy per table granting full read/write access to any user who is
-- signed in via Supabase Auth (the `authenticated` role) — matching the
-- "simple login for me" model: there's no public sign-up in the app, so in
-- practice this means only accounts you create yourself (Authentication ->
-- Users in the dashboard) can ever satisfy this policy.
--
-- Safe to re-run: every policy is dropped and recreated, and RLS being
-- already enabled is a no-op. Nothing here touches existing rows.
--
-- Run this in Supabase Studio -> SQL Editor -> New query -> Run.
-- =============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'properties', 'services', 'employees', 'routes',
    'service_agreements', 'route_stops', 'jobs', 'job_employees',
    'time_entries', 'equipment', 'job_equipment', 'equipment_maintenance',
    'quotes', 'quote_items', 'invoices', 'invoice_items', 'payments',
    'expenses', 'job_materials', 'job_photos', 'integration_mappings'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "authenticated_full_access" on public.%I', t);
    execute format(
      'create policy "authenticated_full_access" on public.%I for all to authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;

-- =============================================================================
-- Done. Every table above now has exactly one policy: any authenticated
-- user can select/insert/update/delete. The legacy capitalized "Properties"
-- table is intentionally untouched — Jarvis doesn't use it.
--
-- This is a single-owner-tool model (no per-row ownership or per-employee
-- restrictions) since the schema has no user_id/owner_id columns to scope
-- by. If you later want per-employee permissions (e.g. crew members can
-- see jobs but not edit pricing), that needs schema changes first — flag it
-- and we can design that properly rather than bolting it on here.
-- =============================================================================
