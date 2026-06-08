-- Дедупликация Telegram-апдейтов: каждый update_id обрабатывается один раз.
-- Пишет только бот под service role (минует RLS); политик нет — анону недоступно.
create table if not exists public.processed_updates (
  update_id bigint primary key,
  created_at timestamptz not null default now()
);

alter table public.processed_updates enable row level security;
