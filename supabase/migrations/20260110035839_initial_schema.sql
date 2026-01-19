-- extensions
create extension if not exists "pgcrypto";

-- enums
create type public.org_role as enum ('owner', 'admin', 'cashier');
create type public.wallet_status as enum ('active', 'blocked');
create type public.qr_status as enum ('available', 'assigned', 'inactive');
create type public.movement_type as enum ('payment', 'deposit', 'initial_deposit', 'refund');
create type public.event_status as enum ('draft', 'active', 'paused', 'ended');
create type public.product_status as enum ('active', 'inactive');
create type public.product_type as enum ('limited', 'unlimited');

-- profiles (user preferences)
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  first_name text,
  last_name text,
  email text,
  phone text,
  avatar_url text,
  last_org_id uuid,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- organizations (tenant root)
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.org_role not null default 'cashier',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- wallets
create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  event_id uuid not null,
  phone text,
  name text,
  status public.wallet_status not null default 'active',
  balance_cents bigint not null default 0 check (balance_cents >= 0),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, phone)
);

-- qrs
create table public.qrs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  code_5 char(5) not null unique,
  key text not null unique,
  wallet_id uuid references public.wallets (id) on delete set null,
  status public.qr_status not null default 'available',
  manufactured_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- movements
create table public.movements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  wallet_id uuid not null references public.wallets (id) on delete cascade,
  event_id uuid not null,
  type public.movement_type not null,
  amount_cents bigint not null check (amount_cents > 0),
  qr_id uuid references public.qrs (id) on delete set null,
  original_movement_id uuid references public.movements (id) on delete set null,
  reference text,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- events
create table public.events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  status public.event_status not null default 'draft',
  starts_at timestamptz,
  ends_at timestamptz,
  description text,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

alter table public.profiles
  add constraint profiles_last_org_id_fkey
  foreign key (last_org_id) references public.organizations (id) on delete set null;

alter table public.wallets
  add constraint wallets_event_id_fkey
  foreign key (event_id) references public.events (id) on delete cascade;

alter table public.movements
  add constraint movements_event_id_fkey
  foreign key (event_id) references public.events (id) on delete cascade;

-- event areas
create table public.event_areas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, name)
);

-- base products
create table public.products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  type public.product_type not null default 'limited',
  status public.product_status not null default 'active',
  base_price_cents bigint not null check (base_price_cents >= 0),
  image_path text,
  description text,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- event products
create table public.event_products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  area_id uuid references public.event_areas (id) on delete set null,
  base_product_id uuid not null references public.products (id) on delete restrict,
  initial_stock integer check (initial_stock >= 0),
  stock integer check (stock >= 0),
  price_cents bigint not null check (price_cents >= 0),
  status public.product_status not null default 'active',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, base_product_id, area_id)
);

create table public.movement_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  movement_id uuid not null references public.movements (id) on delete cascade,
  event_product_id uuid not null references public.event_products (id) on delete restrict,
  base_product_id uuid not null references public.products (id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  line_total_cents bigint not null check (line_total_cents >= 0),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.refund_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  refund_movement_id uuid not null references public.movements (id) on delete cascade,
  original_movement_item_id uuid not null references public.movement_items (id) on delete restrict,
  quantity integer not null check (quantity > 0),
  amount_cents bigint not null check (amount_cents > 0),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
-- indexes
create index organization_members_user_id_idx on public.organization_members (user_id);
create index wallets_org_id_idx on public.wallets (org_id);
create index wallets_event_id_idx on public.wallets (event_id);
create index wallets_phone_idx on public.wallets (phone);
create index qrs_org_id_idx on public.qrs (org_id);
create index qrs_wallet_id_idx on public.qrs (wallet_id);
create index movements_wallet_id_idx on public.movements (wallet_id);
create index movements_event_id_idx on public.movements (event_id);
create index movements_created_at_idx on public.movements (created_at);
create index movements_original_movement_id_idx on public.movements (original_movement_id);
create index movement_items_movement_id_idx on public.movement_items (movement_id);
create index movement_items_event_product_id_idx on public.movement_items (event_product_id);
create index movement_items_base_product_id_idx on public.movement_items (base_product_id);
create index refund_items_refund_movement_id_idx on public.refund_items (refund_movement_id);
create index refund_items_original_movement_item_id_idx on public.refund_items (original_movement_item_id);
create index events_org_id_idx on public.events (org_id);
create index events_starts_at_idx on public.events (starts_at);
create index event_areas_event_id_idx on public.event_areas (event_id);
create index products_org_id_idx on public.products (org_id);
create index event_products_event_id_idx on public.event_products (event_id);
create index event_products_area_id_idx on public.event_products (area_id);
create index profiles_last_org_id_idx on public.profiles (last_org_id);
create index movements_qr_id_idx on public.movements (qr_id);

-- audit trigger helper
create or replace function public.set_audit_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    if to_jsonb(new) ? 'created_by' and new.created_by is null then
      new.created_by = auth.uid();
    end if;
  end if;

  if to_jsonb(new) ? 'updated_by' then
    new.updated_by = auth.uid();
  end if;

  if to_jsonb(new) ? 'updated_at' then
    new.updated_at = now();
  end if;

  return new;
end;
$$;

create trigger profiles_set_audit
before insert or update on public.profiles
for each row execute function public.set_audit_fields();

create trigger organizations_set_audit
before update on public.organizations
for each row execute function public.set_audit_fields();

create trigger organization_members_set_audit
before insert or update on public.organization_members
for each row execute function public.set_audit_fields();

create trigger wallets_set_audit
before insert or update on public.wallets
for each row execute function public.set_audit_fields();

create trigger qrs_set_audit
before insert or update on public.qrs
for each row execute function public.set_audit_fields();

create trigger movements_set_audit
before insert or update on public.movements
for each row execute function public.set_audit_fields();

create trigger events_set_audit
before insert or update on public.events
for each row execute function public.set_audit_fields();

create trigger event_areas_set_audit
before insert or update on public.event_areas
for each row execute function public.set_audit_fields();

create trigger products_set_audit
before insert or update on public.products
for each row execute function public.set_audit_fields();

create trigger event_products_set_audit
before insert or update on public.event_products
for each row execute function public.set_audit_fields();

create trigger movement_items_set_audit
before insert or update on public.movement_items
for each row execute function public.set_audit_fields();

create trigger refund_items_set_audit
before insert or update on public.refund_items
for each row execute function public.set_audit_fields();

-- helper functions for rls
create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.org_id = target_org_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.has_org_role(target_org_id uuid, roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.org_id = target_org_id
      and m.user_id = auth.uid()
      and m.role = any (roles::public.org_role[])
  );
$$;

-- rls
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.wallets enable row level security;
alter table public.qrs enable row level security;
alter table public.movements enable row level security;
alter table public.events enable row level security;
alter table public.products enable row level security;
alter table public.event_products enable row level security;
alter table public.event_areas enable row level security;
alter table public.profiles enable row level security;
alter table public.movement_items enable row level security;
alter table public.refund_items enable row level security;

-- organizations policies
create policy organizations_select
on public.organizations
for select
using (public.is_org_member(id));

create policy organizations_insert
on public.organizations
for insert
with check (auth.uid() is not null and created_by = auth.uid());

create policy organizations_update
on public.organizations
for update
using (public.has_org_role(id, array['owner']))
with check (public.has_org_role(id, array['owner']));

create policy organizations_delete
on public.organizations
for delete
using (public.has_org_role(id, array['owner']));

-- organization_members policies
create policy organization_members_select
on public.organization_members
for select
using (public.is_org_member(org_id));

create policy organization_members_insert_owner
on public.organization_members
for insert
with check (
  (user_id = auth.uid()
    and exists (
      select 1
      from public.organizations o
      where o.id = org_id
        and o.created_by = auth.uid()
    )
  )
  or public.has_org_role(org_id, array['owner', 'admin'])
);

create policy organization_members_update
on public.organization_members
for update
using (public.has_org_role(org_id, array['owner', 'admin']))
with check (public.has_org_role(org_id, array['owner', 'admin']));

create policy organization_members_delete
on public.organization_members
for delete
using (public.has_org_role(org_id, array['owner', 'admin']));

-- wallets policies
create policy wallets_select
on public.wallets
for select
using (public.is_org_member(org_id));

create policy wallets_insert
on public.wallets
for insert
with check (public.has_org_role(org_id, array['owner', 'admin', 'cashier']));

create policy wallets_update
on public.wallets
for update
using (public.has_org_role(org_id, array['owner', 'admin', 'cashier']))
with check (public.has_org_role(org_id, array['owner', 'admin', 'cashier']));

create policy wallets_delete
on public.wallets
for delete
using (public.has_org_role(org_id, array['owner', 'admin']));

-- qrs policies
create policy qrs_select
on public.qrs
for select
using (public.is_org_member(org_id));

create policy qrs_insert
on public.qrs
for insert
with check (public.has_org_role(org_id, array['owner', 'admin']));

create policy qrs_update
on public.qrs
for update
using (public.has_org_role(org_id, array['owner', 'admin']))
with check (public.has_org_role(org_id, array['owner', 'admin']));

create policy qrs_delete
on public.qrs
for delete
using (public.has_org_role(org_id, array['owner', 'admin']));

-- movements policies
create policy movements_select
on public.movements
for select
using (public.is_org_member(org_id));

create policy movements_insert
on public.movements
for insert
with check (
  (type <> 'refund' and public.has_org_role(org_id, array['owner', 'admin', 'cashier']))
  or (type = 'refund' and public.has_org_role(org_id, array['owner', 'admin']))
);

create policy movements_update
on public.movements
for update
using (public.has_org_role(org_id, array['owner', 'admin']))
with check (public.has_org_role(org_id, array['owner', 'admin']));

create policy movements_delete
on public.movements
for delete
using (public.has_org_role(org_id, array['owner', 'admin']));

-- movement_items policies
create policy movement_items_select
on public.movement_items
for select
using (public.is_org_member(org_id));

create policy movement_items_insert
on public.movement_items
for insert
with check (public.has_org_role(org_id, array['owner', 'admin', 'cashier']));

create policy movement_items_update
on public.movement_items
for update
using (public.has_org_role(org_id, array['owner', 'admin']))
with check (public.has_org_role(org_id, array['owner', 'admin']));

create policy movement_items_delete
on public.movement_items
for delete
using (public.has_org_role(org_id, array['owner', 'admin']));

-- refund_items policies (only owner/admin)
create policy refund_items_select
on public.refund_items
for select
using (public.is_org_member(org_id));

create policy refund_items_insert
on public.refund_items
for insert
with check (public.has_org_role(org_id, array['owner', 'admin']));

create policy refund_items_update
on public.refund_items
for update
using (public.has_org_role(org_id, array['owner', 'admin']))
with check (public.has_org_role(org_id, array['owner', 'admin']));

create policy refund_items_delete
on public.refund_items
for delete
using (public.has_org_role(org_id, array['owner', 'admin']));

-- events policies
create policy events_select
on public.events
for select
using (public.is_org_member(org_id));

create policy events_insert
on public.events
for insert
with check (public.has_org_role(org_id, array['owner', 'admin']));

create policy events_update
on public.events
for update
using (public.has_org_role(org_id, array['owner', 'admin']))
with check (public.has_org_role(org_id, array['owner', 'admin']));

create policy events_delete
on public.events
for delete
using (public.has_org_role(org_id, array['owner', 'admin']));

-- event_areas policies
create policy event_areas_select
on public.event_areas
for select
using (public.is_org_member(org_id));

create policy event_areas_insert
on public.event_areas
for insert
with check (public.has_org_role(org_id, array['owner', 'admin']));

create policy event_areas_update
on public.event_areas
for update
using (public.has_org_role(org_id, array['owner', 'admin']))
with check (public.has_org_role(org_id, array['owner', 'admin']));

create policy event_areas_delete
on public.event_areas
for delete
using (public.has_org_role(org_id, array['owner', 'admin']));

-- products policies
create policy products_select
on public.products
for select
using (public.is_org_member(org_id));

create policy products_insert
on public.products
for insert
with check (public.has_org_role(org_id, array['owner', 'admin']));

create policy products_update
on public.products
for update
using (public.has_org_role(org_id, array['owner', 'admin']))
with check (public.has_org_role(org_id, array['owner', 'admin']));

create policy products_delete
on public.products
for delete
using (public.has_org_role(org_id, array['owner', 'admin']));

-- event_products policies
create policy event_products_select
on public.event_products
for select
using (public.is_org_member(org_id));

create policy event_products_insert
on public.event_products
for insert
with check (public.has_org_role(org_id, array['owner', 'admin']));

create policy event_products_update
on public.event_products
for update
using (public.has_org_role(org_id, array['owner', 'admin']))
with check (public.has_org_role(org_id, array['owner', 'admin']));

create policy event_products_delete
on public.event_products
for delete
using (public.has_org_role(org_id, array['owner', 'admin']));

-- profiles policies
create policy profiles_select
on public.profiles
for select
using (auth.uid() = user_id);

create policy profiles_insert
on public.profiles
for insert
with check (auth.uid() = user_id);

create policy profiles_update
on public.profiles
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy profiles_delete
on public.profiles
for delete
using (auth.uid() = user_id);
