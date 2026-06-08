-- Живые курсы валют (источник: НБ РК) + серверный конфиг ставок комиссий.
-- Оба читаются публично (RLS select true — данные не секретны), пишутся только
-- service role (fx-update) или вручную через дашборд/Management API.

-- Курсы валют: KZT за 1 единицу валюты.
create table if not exists public.fx_rates (
  currency text primary key,
  rate_kzt numeric not null,
  source text not null default 'nationalbank.kz',
  fetched_at timestamptz not null default now()
);

alter table public.fx_rates enable row level security;

create policy "fx_rates_public_read" on public.fx_rates
  for select using (true);

-- Ставки комиссий маркетплейсов по категориям. Источник правды — правишь здесь,
-- TMA читает live без редеплоя ("меняются при правках").
create table if not exists public.platform_rates (
  platform text not null,   -- 'kaspi' | 'wb'
  category text not null,   -- метка категории (совпадает с TMA)
  rate numeric not null,    -- комиссия площадки, %
  source text,
  updated_at timestamptz not null default now(),
  primary key (platform, category)
);

alter table public.platform_rates enable row level security;

create policy "platform_rates_public_read" on public.platform_rates
  for select using (true);
