// Edge Function `fx-update` — тянет официальные курсы НБ РК и пишет в fx_rates.
// Вызывается по расписанию (pg_cron). Защита — заголовок x-fx-secret.
// Источник: https://nationalbank.kz/rss/rates_all.xml (KZT за `quant` единиц).

const FX_CRON_SECRET = Deno.env.get('FX_CRON_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const NBK_URL = 'https://nationalbank.kz/rss/rates_all.xml'
const WANT = new Set(['USD', 'CNY', 'RUB', 'EUR'])

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function field(block: string, tag: string): string | undefined {
  return new RegExp(`<${tag}>(.*?)</${tag}>`).exec(block)?.[1]
}

Deno.serve(async (req: Request) => {
  if (req.headers.get('x-fx-secret') !== FX_CRON_SECRET) {
    return new Response('forbidden', { status: 401 })
  }

  try {
    const xml = await (await fetch(NBK_URL)).text()
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1])

    const now = new Date().toISOString()
    const rows: Array<{
      currency: string
      rate_kzt: number
      source: string
      fetched_at: string
    }> = []

    for (const it of items) {
      const code = field(it, 'title')
      if (!code || !WANT.has(code)) continue
      const desc = Number(field(it, 'description'))
      const quant = Number(field(it, 'quant') || '1')
      if (!desc || !quant) continue
      rows.push({
        currency: code,
        rate_kzt: desc / quant,
        source: 'nationalbank.kz',
        fetched_at: now,
      })
    }

    if (!rows.length) return json({ error: 'no rates parsed' }, 502)

    // Upsert в fx_rates под service role (минует RLS).
    const res = await fetch(`${SUPABASE_URL}/rest/v1/fx_rates?on_conflict=currency`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(rows),
    })
    if (!res.ok) {
      return json({ error: 'upsert failed', status: res.status, body: await res.text() }, 500)
    }

    return json({ ok: true, updated: rows.map((r) => `${r.currency}=${r.rate_kzt}`) })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
