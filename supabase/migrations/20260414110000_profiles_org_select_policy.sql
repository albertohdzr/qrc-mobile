-- Allow org members to see profiles of users in the same organization
create policy profiles_select_org_members
on public.profiles
for select
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.organization_members my
    join public.organization_members their
      on my.org_id = their.org_id
    where my.user_id = auth.uid()
      and their.user_id = profiles.user_id
  )
);

-- Drop the old restrictive policy
drop policy if exists profiles_select on public.profiles;
