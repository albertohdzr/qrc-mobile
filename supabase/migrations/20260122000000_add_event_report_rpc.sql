create or replace function public.get_event_report(
  p_event_id uuid,
  p_date_from date default null,
  p_date_to date default null
)
returns jsonb
language sql
stable
set search_path = public
as $$
with base_movements as (
  select
    m.*,
    ((m.created_at at time zone 'UTC') + interval '-6 hours')::date as local_date
  from public.movements m
  where m.event_id = p_event_id
    and m.type in ('payment', 'deposit', 'initial_deposit', 'refund')
),
filtered_movements as (
  select *
  from base_movements
  where (p_date_from is null or local_date >= p_date_from)
    and (p_date_to is null or local_date <= p_date_to)
),
sales_items as (
  select
    mi.*,
    fm.local_date,
    fm.created_by as cashier_id,
    fm.payment_method
  from public.movement_items mi
  join filtered_movements fm
    on fm.id = mi.movement_id
   and fm.type = 'payment'
),
sales_items_detail as (
  select
    si.local_date,
    si.quantity,
    si.line_total_cents,
    si.cashier_id,
    si.payment_method,
    si.base_product_id as product_id,
    p.name as product_name,
    ep.area_id,
    ea.name as area_name
  from sales_items si
  left join public.products p on p.id = si.base_product_id
  left join public.event_products ep on ep.id = si.event_product_id
  left join public.event_areas ea on ea.id = ep.area_id
),
refund_movements as (
  select
    fm.id,
    fm.local_date,
    fm.created_by
  from filtered_movements fm
  where fm.type = 'refund'
),
refund_items_detail as (
  select
    rm.local_date,
    ri.amount_cents,
    omi.base_product_id as product_id,
    p.name as product_name,
    ep.area_id,
    ea.name as area_name
  from public.refund_items ri
  join refund_movements rm on rm.id = ri.refund_movement_id
  join public.movement_items omi on omi.id = ri.original_movement_item_id
  left join public.products p on p.id = omi.base_product_id
  left join public.event_products ep on ep.id = omi.event_product_id
  left join public.event_areas ea on ea.id = ep.area_id
),
daily_sales as (
  select
    local_date,
    sum(line_total_cents) as sales_cents,
    sum(quantity) as items_count
  from sales_items_detail
  group by local_date
),
daily_refunds_items as (
  select
    local_date,
    sum(amount_cents) as refunds_items_cents
  from refund_items_detail
  group by local_date
),
daily_movements as (
  select
    local_date,
    sum(case when type = 'payment' then amount_cents else 0 end) as sales_movement_cents,
    sum(case when type in ('deposit', 'initial_deposit') then amount_cents else 0 end) as deposits_cents,
    sum(case when type = 'refund' then amount_cents else 0 end) as refunds_cents,
    count(*) as transactions_count,
    sum(case when type = 'payment' then 1 else 0 end) as sales_count,
    sum(case when type in ('deposit', 'initial_deposit') then 1 else 0 end) as deposits_count,
    sum(case when type = 'refund' then 1 else 0 end) as refunds_count
  from filtered_movements
  group by local_date
),
daily as (
  select
    dm.local_date,
    coalesce(ds.sales_cents, 0) as sales_cents,
    coalesce(ds.items_count, 0) as items_count,
    coalesce(dm.deposits_cents, 0) as deposits_cents,
    coalesce(dm.refunds_cents, 0) as refunds_cents,
    coalesce(dm.transactions_count, 0) as transactions_count,
    coalesce(dm.sales_count, 0) as sales_count,
    coalesce(dm.deposits_count, 0) as deposits_count,
    coalesce(dm.refunds_count, 0) as refunds_count,
    coalesce(dri.refunds_items_cents, 0) as refunds_items_cents
  from daily_movements dm
  left join daily_sales ds on ds.local_date = dm.local_date
  left join daily_refunds_items dri on dri.local_date = dm.local_date
),
products_total_sales as (
  select
    product_id,
    product_name,
    sum(line_total_cents) as sales_cents,
    sum(quantity) as quantity
  from sales_items_detail
  group by product_id, product_name
),
products_total_refunds as (
  select
    product_id,
    product_name,
    sum(amount_cents) as refunds_cents
  from refund_items_detail
  group by product_id, product_name
),
products_total as (
  select
    coalesce(ps.product_id, pr.product_id) as product_id,
    coalesce(ps.product_name, pr.product_name) as product_name,
    coalesce(ps.quantity, 0) as quantity,
    coalesce(ps.sales_cents, 0) as sales_cents,
    coalesce(pr.refunds_cents, 0) as refunds_cents,
    coalesce(ps.sales_cents, 0) - coalesce(pr.refunds_cents, 0) as net_cents
  from products_total_sales ps
  full join products_total_refunds pr
    on pr.product_id = ps.product_id
),
products_daily_sales as (
  select
    local_date,
    product_id,
    product_name,
    sum(line_total_cents) as sales_cents,
    sum(quantity) as quantity
  from sales_items_detail
  group by local_date, product_id, product_name
),
products_daily_refunds as (
  select
    local_date,
    product_id,
    product_name,
    sum(amount_cents) as refunds_cents
  from refund_items_detail
  group by local_date, product_id, product_name
),
products_daily as (
  select
    coalesce(ps.local_date, pr.local_date) as local_date,
    coalesce(ps.product_id, pr.product_id) as product_id,
    coalesce(ps.product_name, pr.product_name) as product_name,
    coalesce(ps.quantity, 0) as quantity,
    coalesce(ps.sales_cents, 0) as sales_cents,
    coalesce(pr.refunds_cents, 0) as refunds_cents,
    coalesce(ps.sales_cents, 0) - coalesce(pr.refunds_cents, 0) as net_cents
  from products_daily_sales ps
  full join products_daily_refunds pr
    on pr.local_date = ps.local_date
   and pr.product_id = ps.product_id
),
areas_total_sales as (
  select
    area_id,
    area_name,
    sum(line_total_cents) as sales_cents,
    sum(quantity) as quantity
  from sales_items_detail
  group by area_id, area_name
),
areas_total_refunds as (
  select
    area_id,
    area_name,
    sum(amount_cents) as refunds_cents
  from refund_items_detail
  group by area_id, area_name
),
areas_total as (
  select
    coalesce(sa.area_id, ra.area_id) as area_id,
    coalesce(sa.area_name, ra.area_name, 'General') as area_name,
    coalesce(sa.quantity, 0) as quantity,
    coalesce(sa.sales_cents, 0) as sales_cents,
    coalesce(ra.refunds_cents, 0) as refunds_cents,
    coalesce(sa.sales_cents, 0) - coalesce(ra.refunds_cents, 0) as net_cents
  from areas_total_sales sa
  full join areas_total_refunds ra
    on ra.area_id = sa.area_id
),
areas_daily_sales as (
  select
    local_date,
    area_id,
    area_name,
    sum(line_total_cents) as sales_cents,
    sum(quantity) as quantity
  from sales_items_detail
  group by local_date, area_id, area_name
),
areas_daily_refunds as (
  select
    local_date,
    area_id,
    area_name,
    sum(amount_cents) as refunds_cents
  from refund_items_detail
  group by local_date, area_id, area_name
),
areas_daily as (
  select
    coalesce(sa.local_date, ra.local_date) as local_date,
    coalesce(sa.area_id, ra.area_id) as area_id,
    coalesce(sa.area_name, ra.area_name, 'General') as area_name,
    coalesce(sa.quantity, 0) as quantity,
    coalesce(sa.sales_cents, 0) as sales_cents,
    coalesce(ra.refunds_cents, 0) as refunds_cents,
    coalesce(sa.sales_cents, 0) - coalesce(ra.refunds_cents, 0) as net_cents
  from areas_daily_sales sa
  full join areas_daily_refunds ra
    on ra.local_date = sa.local_date
   and ra.area_id = sa.area_id
),
payment_methods as (
  select
    coalesce(payment_method::text, 'unknown') as method,
    sum(amount_cents) as sales_cents,
    count(*) as transactions_count
  from filtered_movements
  where type = 'payment'
  group by payment_method
),
cashier_sales as (
  select
    created_by as cashier_id,
    sum(amount_cents) as sales_cents,
    count(*) as transactions_count
  from filtered_movements
  where type = 'payment'
  group by created_by
),
cashier_items as (
  select
    cashier_id,
    sum(quantity) as items_count
  from sales_items_detail
  group by cashier_id
),
cashiers as (
  select
    cs.cashier_id as user_id,
    coalesce(ci.items_count, 0) as items_count,
    coalesce(cs.sales_cents, 0) as sales_cents,
    coalesce(cs.transactions_count, 0) as transactions_count
  from cashier_sales cs
  left join cashier_items ci on ci.cashier_id = cs.cashier_id
)
select jsonb_build_object(
  'totals', jsonb_build_object(
    'sales_cents', coalesce((select sum(amount_cents) from filtered_movements where type = 'payment'), 0),
    'sales_items', coalesce((select sum(quantity) from sales_items_detail), 0),
    'sales_transactions', coalesce((select count(*) from filtered_movements where type = 'payment'), 0),
    'deposits_cents', coalesce((select sum(amount_cents) from filtered_movements where type in ('deposit', 'initial_deposit')), 0),
    'refunds_cents', coalesce((select sum(amount_cents) from filtered_movements where type = 'refund'), 0),
    'net_cents', coalesce((select sum(amount_cents) from filtered_movements where type in ('deposit', 'initial_deposit')), 0)
      - coalesce((select sum(amount_cents) from filtered_movements where type = 'refund'), 0),
    'transactions_count', coalesce((select count(*) from filtered_movements), 0)
  ),
  'daily', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'date', local_date::text,
        'sales_cents', sales_cents,
        'sales_items', items_count,
        'deposits_cents', deposits_cents,
        'refunds_cents', refunds_cents,
        'net_cents', deposits_cents - refunds_cents,
        'transactions_count', transactions_count,
        'sales_count', sales_count,
        'deposits_count', deposits_count,
        'refunds_count', refunds_count
      )
      order by local_date
    )
    from daily
  ), '[]'::jsonb),
  'products_total', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', product_id,
        'name', product_name,
        'quantity', quantity,
        'sales_cents', sales_cents,
        'refunds_cents', refunds_cents,
        'net_cents', net_cents
      )
      order by sales_cents desc nulls last
    )
    from products_total
  ), '[]'::jsonb),
  'products_daily', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'date', local_date::text,
        'id', product_id,
        'name', product_name,
        'quantity', quantity,
        'sales_cents', sales_cents,
        'refunds_cents', refunds_cents,
        'net_cents', net_cents
      )
      order by local_date, sales_cents desc nulls last
    )
    from products_daily
  ), '[]'::jsonb),
  'areas_total', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', area_id,
        'name', area_name,
        'quantity', quantity,
        'sales_cents', sales_cents,
        'refunds_cents', refunds_cents,
        'net_cents', net_cents
      )
      order by sales_cents desc nulls last
    )
    from areas_total
  ), '[]'::jsonb),
  'areas_daily', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'date', local_date::text,
        'id', area_id,
        'name', area_name,
        'quantity', quantity,
        'sales_cents', sales_cents,
        'refunds_cents', refunds_cents,
        'net_cents', net_cents
      )
      order by local_date, sales_cents desc nulls last
    )
    from areas_daily
  ), '[]'::jsonb),
  'payment_methods', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'method', method,
        'sales_cents', sales_cents,
        'transactions_count', transactions_count
      )
      order by sales_cents desc nulls last
    )
    from payment_methods
  ), '[]'::jsonb),
  'cashiers', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', c.user_id,
        'name', coalesce(nullif(concat_ws(' ', p.first_name, p.last_name), ''), p.email, 'Desconocido'),
        'email', coalesce(p.email, ''),
        'items_count', c.items_count,
        'sales_cents', c.sales_cents,
        'transactions_count', c.transactions_count
      )
      order by c.sales_cents desc nulls last
    )
    from cashiers c
    left join public.profiles p on p.user_id = c.user_id
  ), '[]'::jsonb)
);
$$;
