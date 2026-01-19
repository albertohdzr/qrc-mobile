-- Ensure storage bucket is public for product images
update storage.buckets
set public = true
where id = 'storage';
