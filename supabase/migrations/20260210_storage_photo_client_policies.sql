-- Ensure the bucket exists and remains public for read URLs
insert into storage.buckets (id, name, public)
values ('bso', 'bso', true)
on conflict (id) do update
set public = excluded.public;

-- Read access for client photos
drop policy if exists "Public read bso photo_client" on storage.objects;
create policy "Public read bso photo_client"
on storage.objects
for select
to public
using (
  bucket_id = 'bso'
  and (storage.foldername(name))[1] = 'photo_client'
);

-- Upload access for authenticated users
drop policy if exists "Authenticated upload bso photo_client" on storage.objects;
create policy "Authenticated upload bso photo_client"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'bso'
  and (storage.foldername(name))[1] = 'photo_client'
);

-- Update access for authenticated users
drop policy if exists "Authenticated update bso photo_client" on storage.objects;
create policy "Authenticated update bso photo_client"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'bso'
  and (storage.foldername(name))[1] = 'photo_client'
)
with check (
  bucket_id = 'bso'
  and (storage.foldername(name))[1] = 'photo_client'
);

-- Delete access for authenticated users
drop policy if exists "Authenticated delete bso photo_client" on storage.objects;
create policy "Authenticated delete bso photo_client"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'bso'
  and (storage.foldername(name))[1] = 'photo_client'
);
