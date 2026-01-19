alter table public.profiles
  add column created_by uuid references auth.users (id) on delete set null;
