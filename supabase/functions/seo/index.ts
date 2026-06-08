// Edge Function `seo` — двуязычный SEO-генератор карточек для TMA.
// Вход: { name, attributes, keywords, platform }. Выход: строгий JSON
// { title, description_ru, description_kk, keywords[], advice[] } через Gemini.
// verify_jwt по умолчанию включён → вызывается с Bearer-токеном из TMA.

import { GoogleGenerativeAI } from '@google/generative-ai'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)

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

const SYSTEM = `Ты — профессиональный SEO-копирайтер для маркетплейсов Казахстана (Kaspi, Wildberries).
По данным о товаре сгенерируй продающую карточку. Казахский язык — нативный (как у носителя),
без дословного перевода с русского, с правильной e-commerce терминологией Казахстана.
Адаптируй текст под алгоритмы ранжирования указанной площадки.

Верни СТРОГО JSON (без markdown, без лишних символов) с полями:
- "title": продающий заголовок на русском (до ~90 символов, с главным ключом в начале)
- "description_ru": SEO-описание на русском (цепляющий абзац + список преимуществ через эмодзи + аккуратно вписанные поисковые ключи)
- "description_kk": SEO-описание на казахском (нативное, не перевод, та же структура)
- "keywords": массив из 8-12 поисковых ключей (строки), по которым товар ищут
- "advice": массив из 3-5 коротких практичных советов по оформлению карточки (фото, атрибуты, цена, отзывы)`

interface SeoInput {
  name?: string
  attributes?: string
  keywords?: string
  platform?: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const { name, attributes, keywords, platform } =
      ((await req.json().catch(() => ({}))) as SeoInput) ?? {}

    if (!name || !name.trim()) return json({ error: 'name required' }, 400)

    const userPrompt = [
      `Площадка: ${platform || 'Kaspi'}`,
      `Товар: ${name}`,
      `Характеристики: ${attributes || '—'}`,
      `Ключевые слова от продавца: ${keywords || '—'}`,
    ].join('\n')

    const model = genAI.getGenerativeModel({
      model: 'gemini-3.5-flash',
      systemInstruction: SYSTEM,
      generationConfig: { responseMimeType: 'application/json', temperature: 0.7 },
    })

    const r = await model.generateContent(userPrompt)
    const text = r.response.text()
    if (!text) return json({ error: 'empty model output' }, 502)

    try {
      return json(JSON.parse(text))
    } catch {
      return json({ error: 'bad model output' }, 502)
    }
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
