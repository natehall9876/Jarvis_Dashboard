-- Extends the existing job_photos table (already live — it already backs
-- the photo grids on the Job and Property detail pages) so a photo can
-- actually be uploaded, not just displayed once one somehow exists.
--
-- Changes, all additive/widening, nothing destructive:
--   - job_id becomes nullable: a photo of a property or a general work
--     sheet may not have a specific job picked yet at upload time.
--   - property_id, client_id: optional association when a job isn't known.
--   - uploaded_by, content_type, size_bytes, original_filename: real
--     provenance/metadata for anything uploaded through the app.
--   - source: 'owner_upload' by default, leaves room for a future distinct
--     value (e.g. an extraction pipeline) without another migration.
--
-- Also creates the private Storage bucket the app's storage helper already
-- assumed existed (job-photos) — PRIVATE, not public, so photos are only
-- ever served through a short-lived signed URL, never a public link.
--
-- Run this once in the Supabase SQL editor (Studio -> SQL Editor -> paste
-- -> Run), in the same sitting as demo-data-classification-migration.sql.
-- Safe to re-run: every statement is idempotent.

alter table job_photos alter column job_id drop not null;

alter table job_photos add column if not exists property_id uuid references properties(id) on delete set null;
alter table job_photos add column if not exists client_id uuid references clients(id) on delete set null;
alter table job_photos add column if not exists uploaded_by uuid references auth.users(id);
alter table job_photos add column if not exists content_type text;
alter table job_photos add column if not exists size_bytes bigint;
alter table job_photos add column if not exists original_filename text;
alter table job_photos add column if not exists source text not null default 'owner_upload';

-- A photo needs at least one real association — otherwise it's an orphaned
-- upload nothing on the site can ever show.
alter table job_photos drop constraint if exists job_photos_has_association;
alter table job_photos add constraint job_photos_has_association
  check (job_id is not null or property_id is not null or client_id is not null);

alter table job_photos enable row level security;

drop policy if exists "Authenticated users can read job_photos" on job_photos;
create policy "Authenticated users can read job_photos" on job_photos
  for select using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can insert job_photos" on job_photos;
create policy "Authenticated users can insert job_photos" on job_photos
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can delete job_photos" on job_photos;
create policy "Authenticated users can delete job_photos" on job_photos
  for delete using (auth.role() = 'authenticated');

insert into storage.buckets (id, name, public)
  values ('job-photos', 'job-photos', false)
  on conflict (id) do update set public = false;

drop policy if exists "Authenticated read job-photos" on storage.objects;
create policy "Authenticated read job-photos" on storage.objects
  for select using (bucket_id = 'job-photos' and auth.role() = 'authenticated');

drop policy if exists "Authenticated upload job-photos" on storage.objects;
create policy "Authenticated upload job-photos" on storage.objects
  for insert with check (bucket_id = 'job-photos' and auth.role() = 'authenticated');

drop policy if exists "Authenticated delete job-photos" on storage.objects;
create policy "Authenticated delete job-photos" on storage.objects
  for delete using (bucket_id = 'job-photos' and auth.role() = 'authenticated');
