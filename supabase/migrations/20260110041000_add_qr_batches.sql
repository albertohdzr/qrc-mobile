-- enum for qr type
create type public.qr_type as enum ('bracelet', 'card', 'digital');

-- batches for qr production
create table public.qr_batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  notes text,
  manufactured_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);

alter table public.qrs
  add column batch_id uuid references public.qr_batches (id) on delete set null,
  add column type public.qr_type not null default 'card';

create index qr_batches_org_id_idx on public.qr_batches (org_id);
create index qrs_batch_id_idx on public.qrs (batch_id);

alter table public.qr_batches enable row level security;

create policy qr_batches_select
on public.qr_batches
for select
using (public.is_org_member(org_id));

create policy qr_batches_insert
on public.qr_batches
for insert
with check (public.has_org_role(org_id, array['owner', 'admin']));

create policy qr_batches_update
on public.qr_batches
for update
using (public.has_org_role(org_id, array['owner', 'admin']))
with check (public.has_org_role(org_id, array['owner', 'admin']));

create policy qr_batches_delete
on public.qr_batches
for delete
using (public.has_org_role(org_id, array['owner', 'admin']));

create trigger qr_batches_set_audit
before insert or update on public.qr_batches
for each row execute function public.set_audit_fields();
