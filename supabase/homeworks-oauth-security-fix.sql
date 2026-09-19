-- Corrective fix for homeworks_oauth_connection's RLS policy. The original
-- migration used this project's normal `to authenticated using (true)`
-- pattern, which is correct for ordinary business tables but wrong here:
-- this table holds live bearer tokens for an external system, and RLS
-- cannot distinguish "this app's own server code" from "an authenticated
-- owner's browser calling Supabase's REST API directly with the same JWT"
-- — so that policy let any authenticated session read raw access/refresh
-- tokens directly, bypassing the application-code discipline that was the
-- only real protection. Flagged directly by the owner (2026-09-18).
--
-- This migration only changes the policy — it does not touch, delete, or
-- modify the table, its columns, or any stored row/token.
--
-- Run this once in the Supabase SQL editor. Safe to re-run.
-- Run AFTER pulling the latest application code (which switches
-- lib/integrations/homeworks-connection.ts to the service-role client —
-- see lib/supabase/admin.ts for why that's the correct fix here, not
-- `connected_by = auth.uid()`, which would break the integration for any
-- session other than whichever one originally clicked Connect).

drop policy if exists "authenticated_full_access" on homeworks_oauth_connection;

-- No replacement policy is created. RLS stays enabled with zero policies
-- for authenticated/anon, meaning that role is denied entirely — the
-- table becomes reachable only via the service-role client.
