-- Classifies client records by data provenance so demo/seed data can never
-- be silently presented as real WeedEater business figures. Additive only —
-- no rows are deleted or overwritten beyond this one new column.
--
-- Values:
--   'demo'            confirmed seed/demonstration data, excluded from
--                      Command Center / Business Pulse / AI Advisor totals
--   'homeworks_sync'  arrived through the real Homeworks webhook/import path
--   'owner_verified'  entered or confirmed by the owner through the app
--   'unverified'      unknown origin (the honest default — most existing
--                      rows land here until reviewed; this is NOT the same
--                      as 'demo' and must not be treated as fake)
--
-- Run this once in the Supabase SQL editor (Studio -> SQL Editor -> paste
-- -> Run). Safe to re-run: the ADD COLUMN IF NOT EXISTS and the UPDATEs are
-- idempotent.

alter table clients add column if not exists data_source text not null default 'unverified';

comment on column clients.data_source is
  'Provenance classification: demo | homeworks_sync | owner_verified | unverified. Used to exclude confirmed demo data from real business totals.';

-- Backfill: clients that already arrived via the real Homeworks sync path
-- (webhook or admin import) are classified accordingly, not left unverified.
update clients set data_source = 'homeworks_sync'
  where homeworks_id is not null and data_source = 'unverified';

-- Backfill: five client records confirmed as demo/seed data. Evidence: all
-- five share phone numbers in the XXX-555-01XX block, which the North
-- American Numbering Plan reserves exclusively for fictional use (555-0100
-- through 555-0199 are never assigned to a real subscriber) — this is a
-- verifiable fact about the phone numbers themselves, not a guess about the
-- names. Confirmed by direct inspection of the live Clients page on
-- 2026-09-17/18: Jessica Alvarez, Linda Park (Greenfield HOA), Mike
-- Thompson, Robert Chen, Sarah Delgado.
update clients set data_source = 'demo'
  where phone in ('704-555-0101', '704-555-0102', '704-555-0103', '704-555-0104', '704-555-0105');
