-- Storage bucket and policies for product images
insert into storage.buckets (id, name, public)
values ('storage', 'storage', true)
on conflict (id) do nothing;

create policy "storage_read_public"
on storage.objects
for select
using (bucket_id = 'storage');

create policy "storage_insert_authenticated"
on storage.objects
for insert
with check (bucket_id = 'storage' and auth.role() = 'authenticated');

create policy "storage_update_authenticated"
on storage.objects
for update
using (bucket_id = 'storage' and auth.role() = 'authenticated');

create policy "storage_delete_authenticated"
on storage.objects
for delete
using (bucket_id = 'storage' and auth.role() = 'authenticated');
