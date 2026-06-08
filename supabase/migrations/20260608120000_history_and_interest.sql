-- История расчётов TMA + интерес к Fake Door, с RLS по telegram_id из JWT.
-- JWT минтит Edge Function tg-auth (claim telegram_id). PostgREST кладёт клеймы
-- в request.jwt.claims — отсюда их и читаем. Клиент telegram_id НЕ присылает:
-- его подставляет дефолт-функция из токена, подделать нельзя.

-- Helper: telegram_id текущего пользователя из JWT-клейма.
create or replace function public.tg_claim()
returns bigint
language sql
stable
as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::json ->> 'telegram_id')::bigint;
$$;

-- Расчёты маржи из TMA (один ввод → Kaspi + WB).
create table if not exists public.margin_calcs (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null default public.tg_claim(),
  category text,
  purchase integer,
  selling integer,
  weight numeric,
  kaspi_profit integer,
  kaspi_roi numeric,
  wb_profit integer,
  wb_roi numeric,
  created_at timestamptz not null default now()
);

create index if not exists margin_calcs_owner_time_idx
  on public.margin_calcs (telegram_id, created_at desc);

alter table public.margin_calcs enable row level security;

create policy "margin_calcs_select_own" on public.margin_calcs
  for select using (telegram_id = public.tg_claim());

create policy "margin_calcs_insert_own" on public.margin_calcs
  for insert with check (telegram_id = public.tg_claim());

-- Интерес к Fake Door: один пользователь = один голос на сервис.
create table if not exists public.interest (
  telegram_id bigint not null default public.tg_claim(),
  service_id text not null,
  created_at timestamptz not null default now(),
  primary key (telegram_id, service_id)
);

alter table public.interest enable row level security;

create policy "interest_select_own" on public.interest
  for select using (telegram_id = public.tg_claim());

create policy "interest_insert_own" on public.interest
  for insert with check (telegram_id = public.tg_claim());
