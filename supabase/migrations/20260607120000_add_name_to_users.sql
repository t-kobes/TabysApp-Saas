-- Добавляет имя продавца в таблицу users.
-- Заполняется Edge Function `tg-auth` из Telegram first_name при первом входе в TMA.
-- Существующих юзеров бота (4 шт.) не ломает: колонка nullable, дозаполнится при входе.

alter table public.users
  add column if not exists name text;
