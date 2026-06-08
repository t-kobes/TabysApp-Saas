// Edge Function `tg-auth` — авторизация Telegram Mini App.
//
// Принимает { initData } из TMA, проверяет HMAC-подпись токеном бота
// (нельзя доверять telegram_id с клиента!), находит/создаёт юзера в таблице
// `users` и возвращает Supabase-совместимый JWT с claim `telegram_id`.
// Это «бэкенд» TMA за $0 — дальше TMA ходит в Supabase напрямую под RLS.
//
// Деплой и секреты — см. supabase/README.md.

import { createClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'

const BOT_TOKEN = Deno.env.get('BOT_TOKEN')!
const JWT_SECRET = Deno.env.get('JWT_SECRET')!
// SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY платформа подставляет сама.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

/** HMAC-SHA256(key, message) → байты. */
async function hmac(
  key: Uint8Array,
  message: string,
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(message),
  )
  return new Uint8Array(sig)
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Проверяет подпись initData по спецификации Telegram WebApp.
 * secret_key = HMAC_SHA256(key="WebAppData", msg=bot_token)
 * hash       = HMAC_SHA256(key=secret_key, msg=data_check_string)
 * Возвращает разобранные параметры или null, если подпись/срок невалидны.
 */
async function verifyInitData(
  initData: string,
): Promise<URLSearchParams | null> {
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return null

  // data_check_string: отсортированные "key=value" (без hash), через \n.
  const pairs: string[] = []
  for (const [k, v] of params) {
    if (k === 'hash') continue
    pairs.push(`${k}=${v}`)
  }
  pairs.sort()
  const dataCheckString = pairs.join('\n')

  const secretKey = await hmac(
    new TextEncoder().encode('WebAppData'),
    BOT_TOKEN,
  )
  const computed = toHex(await hmac(secretKey, dataCheckString))
  if (computed !== hash) return null

  // Защита от replay: initData не старше 24 часов.
  const authDate = Number(params.get('auth_date') ?? '0')
  if (!authDate || Date.now() / 1000 - authDate > 86400) return null

  return params
}

interface TgUser {
  id: number
  username?: string
  first_name?: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const { initData } = await req.json().catch(() => ({}))
    if (!initData || typeof initData !== 'string') {
      return json({ error: 'initData required' }, 400)
    }

    const params = await verifyInitData(initData)
    if (!params) return json({ error: 'Invalid initData' }, 401)

    const userJson = params.get('user')
    if (!userJson) return json({ error: 'No user in initData' }, 400)
    const tgUser = JSON.parse(userJson) as TgUser

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    })

    const cols = 'id, tg_id, tg_username, name, balance_tokens'

    // Find or create по tg_id (та же колонка, что пишет бот).
    const { data: existing, error: selErr } = await admin
      .from('users')
      .select(cols)
      .eq('tg_id', tgUser.id)
      .maybeSingle()
    if (selErr) return json({ error: 'DB select failed' }, 500)

    let user = existing
    if (!user) {
      const { data: created, error: insErr } = await admin
        .from('users')
        .insert({
          tg_id: tgUser.id,
          tg_username: tgUser.username ?? null,
          name: tgUser.first_name ?? null,
        })
        .select(cols)
        .single()
      if (insErr) return json({ error: 'DB insert failed' }, 500)
      user = created
    } else if (!user.name && tgUser.first_name) {
      // Дозаполняем имя у существующих юзеров бота при первом входе в TMA.
      const { data: updated } = await admin
        .from('users')
        .update({ name: tgUser.first_name })
        .eq('tg_id', tgUser.id)
        .select(cols)
        .single()
      if (updated) user = updated
    }

    // Mint JWT (HS256, подписан JWT-секретом проекта → RLS его принимает).
    const token = await new SignJWT({
      role: 'authenticated',
      telegram_id: String(user!.tg_id),
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(user!.id)
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(new TextEncoder().encode(JWT_SECRET))

    return json({ token, user }, 200)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
