-- Add disabled flag to organization_members
alter table public.organization_members
  add column disabled boolean not null default false;
