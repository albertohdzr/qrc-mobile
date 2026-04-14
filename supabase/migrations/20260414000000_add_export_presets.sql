-- Export presets table: stores configurable export settings per organization
create table if not exists public.export_presets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  settings jsonb not null default '{}',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for fast lookup by org
create index if not exists idx_export_presets_org_id on public.export_presets(org_id);

-- RLS
alter table public.export_presets enable row level security;

create policy "Members can view org export presets"
  on public.export_presets for select
  using (public.is_org_member(org_id));

create policy "Admins can insert export presets"
  on public.export_presets for insert
  with check (public.has_org_role(org_id, array['owner', 'admin']));

create policy "Admins can update export presets"
  on public.export_presets for update
  using (public.has_org_role(org_id, array['owner', 'admin']));

create policy "Admins can delete export presets"
  on public.export_presets for delete
  using (public.has_org_role(org_id, array['owner', 'admin']));
