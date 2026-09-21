alter table resources alter column original_url drop not null;
alter table resources add column storage_path text;

alter type license_status add value 'PERSONAL_UPLOAD';

drop policy "resources_public_read" on resources;

create policy "resources_public_read" on resources
  for select using (storage_path is null);

create policy "resources_own_uploads_read" on resources
  for select using (auth.uid() = created_by and storage_path is not null);

insert into storage.buckets (id, name, public)
values ('library-uploads', 'library-uploads', false);
