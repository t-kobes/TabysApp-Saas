# Supabase — Табыс

Серверная часть авторизации Telegram Mini App: Edge Function `tg-auth` + миграции.
Это «бэкенд за $0» — после авторизации TMA ходит в Supabase напрямую под RLS,
всегда-включённый NestJS не нужен.

## Что внутри
- `migrations/` — SQL. Сейчас: добавляет `users.name`.
- `functions/tg-auth/` — проверка `initData` (HMAC токеном бота) → mint Supabase-JWT
  с claim `telegram_id`. Находит/создаёт юзера по `tg_id`.

## Разовая настройка деплоя

```bash
# 1. CLI
brew install supabase/tap/supabase
supabase login

# 2. Привязать проект (PROJECT_REF: Dashboard → Project Settings → General → Reference ID)
cd "/Users/kobestamerlan/Documents/B2B TG"
supabase link --project-ref <PROJECT_REF>

# 3. Применить миграцию (добавит users.name)
supabase db push

# 4. Секреты функции
#    JWT_SECRET: Dashboard → Project Settings → API → JWT Secret
#    BOT_TOKEN:  токен @kaspi_calc_bot из BotFather (тот же, что в backend .env)
supabase secrets set BOT_TOKEN=<telegram_bot_token>
supabase secrets set JWT_SECRET=<project_jwt_secret>

# 5. Деплой функции. --no-verify-jwt, т.к. это публичный логин-эндпоинт
#    (вызывается ДО того, как у юзера появился свой JWT).
supabase functions deploy tg-auth --no-verify-jwt
```

`SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY` платформа подставляет в функцию сама —
задавать вручную не нужно.

## Проверка

```bash
# initData возьми из реального запуска TMA: в консоли Mini App — window.Telegram.WebApp.initData
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/tg-auth" \
  -H 'Content-Type: application/json' \
  -H 'apikey: <ANON_KEY>' \
  -d '{"initData":"<строка>"}'
# Ожидаемо: {"token":"<jwt>","user":{"id":"...","tg_id":...,"name":"...","balance_tokens":3}}
```

## Сторона TMA
В TMA задать публичные env (`.env` локально + Vercel → Settings → Environment Variables):
```
VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon_key>
```
TMA при входе вызывает `tg-auth`, кладёт JWT в `localStorage` (`tabys:jwt`).
Приветствие «Привет, {first_name}» рисуется сразу из Telegram-данных, авторизация идёт фоном.
