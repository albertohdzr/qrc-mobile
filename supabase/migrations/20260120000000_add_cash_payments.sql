-- Add payment method and allow cash payments without wallet/qr
do $$
begin
  create type public.payment_method as enum ('qr', 'cash');
exception
  when duplicate_object then null;
end $$;

alter table public.movements
  add column if not exists payment_method public.payment_method;

alter table public.movements
  alter column wallet_id drop not null;

comment on column public.movements.payment_method is 'Payment method for POS payments (qr or cash).';
