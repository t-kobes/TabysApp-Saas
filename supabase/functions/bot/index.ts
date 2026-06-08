// Edge Function `bot` — Telegram webhook бота-консьержа Табыс.
//
// Бот НЕ считает — весь функционал в TMA, он только заводит туда.
//   /start          → что уже работает + вопрос «боль?» + кнопки + «Открыть Табыс»
//   нажатие кнопки  → точечный ответ по боли + web_app «Открыть Табыс»
//   любое сообщение → короткая консультация (Gemini), всегда возврат в TMA
//
// Telegram'у отвечаем 200 СРАЗУ (иначе ретраит → дубли), работу доделываем
// в фоне через EdgeRuntime.waitUntil. Gemini грузится лениво (динамический
// import) — /start и кнопки не платят за холодный старт SDK.

const BOT_TOKEN = Deno.env.get('BOT_TOKEN')!
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!
const WEBHOOK_SECRET = Deno.env.get('BOT_WEBHOOK_SECRET')!
const TMA_URL = Deno.env.get('TMA_URL') ?? 'https://kaspi-seller-miniapp.vercel.app'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const API = `https://api.telegram.org/bot${BOT_TOKEN}`

const OPEN_APP_ROW = [{ text: '🚀 Открыть Табыс', web_app: { url: TMA_URL } }]
const OPEN_APP = { inline_keyboard: [OPEN_APP_ROW] }

// Старт: квалификация по боли + быстрый вход в приложение.
const START_KB = {
  inline_keyboard: [
    [{ text: '📊 Не знаю реальную маржу', callback_data: 'pain_margin' }],
    [{ text: '⚖️ Где выгоднее — Kaspi или WB', callback_data: 'pain_compare' }],
    [{ text: '📝 Карточки плохо находят', callback_data: 'pain_seo' }],
    [{ text: '🔍 Ищу нишу для старта', callback_data: 'pain_niche' }],
    OPEN_APP_ROW,
  ],
}

// Точечный ответ на боль → всегда возврат в приложение. Отражает живые фичи.
const PAIN_REPLY: Record<string, string> = {
  pain_margin:
    'Калькулятор маржи уже работает 💰\nВбей закуп, цену, категорию и вес — за 30 секунд увидишь прибыль и ROI на Kaspi и WB сразу + где выгоднее. Открывай 👇',
  pain_compare:
    'Сравнение Kaspi vs WB — наша главная фишка ⚖️\nОдин товар, обе площадки рядом, сразу видно где прибыль выше. На реальных комиссиях. Открой и сравни 👇',
  pain_seo:
    'SEO-генератор уже работает ✍️\nДвуязычные описания (рус + каз), ключевые слова и советы по оформлению карточки — за пару секунд. Открой 👇',
  pain_niche:
    'Поиск ниш — скоро 🔍\nА пока в приложении бесплатно: маржа со сравнением, валютный калькулятор и SEO. Посчитай будущий товар, чтобы не уйти в минус 👇',
}

async function tg(method: string, payload: unknown): Promise<void> {
  await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

function sendMessage(
  chatId: number,
  text: string,
  replyMarkup?: unknown,
): Promise<void> {
  return tg('sendMessage', { chat_id: chatId, text, reply_markup: replyMarkup })
}

const SYSTEM = `Ты — Табыс, дружелюбный ассистент продавца маркетплейсов Казахстана (Kaspi, Wildberries).
В приложении Табыс УЖЕ работают бесплатно: калькулятор маржи со сравнением Kaspi·WB, валютный калькулятор (живой курс), SEO-генератор карточек (рус + каз), история расчётов.
Отвечай коротко: 2–4 предложения, по-деловому и тепло, дай одну конкретную полезную мысль.
НЕ выдумывай точные числа, комиссии и курсы — для этого есть калькулятор.
В конце всегда мягко направь в приложение Табыс (кнопка ниже). Отвечай на языке пользователя.`

const FALLBACK =
  'Помогу с маржой, выбором площадки, закупом и SEO. Всё это уже в приложении Табыс 👇'

// Gemini грузится лениво — только когда реально нужна консультация.
async function consult(userText: string): Promise<string> {
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    const model = new GoogleGenerativeAI(GEMINI_API_KEY).getGenerativeModel({
      model: 'gemini-3.5-flash',
      systemInstruction: SYSTEM,
    })
    const r = await model.generateContent(userText)
    return r.response.text() || FALLBACK
  } catch {
    return FALLBACK
  }
}

function intro(name: string): string {
  return [
    `Привет, ${name}! 👋`,
    '',
    'Табыс — приложение для продавцов Kaspi и WB. Уже бесплатно работает:',
    '📊 Маржа + сравнение Kaspi·WB',
    '💱 Валютный калькулятор (живой курс)',
    '✍️ SEO-карточки (рус + каз)',
    '🕘 История расчётов',
    '',
    'Открывай ниже 👇 А чтобы подсказать точнее — что сейчас главная боль?',
  ].join('\n')
}

// Обработка апдейта (в фоне, после ACK Telegram).
async function processUpdate(update: Record<string, any>): Promise<void> {
  const cq = update.callback_query
  if (cq) {
    await tg('answerCallbackQuery', { callback_query_id: cq.id })
    const chatId: number | undefined = cq.message?.chat?.id
    const reply = PAIN_REPLY[cq.data as string]
    if (chatId && reply) await sendMessage(chatId, reply, OPEN_APP)
    return
  }

  const msg = update.message ?? update.edited_message
  const text: string | undefined = msg?.text
  if (msg && text) {
    const chatId = msg.chat.id
    const name = msg.from?.first_name ?? 'продавец'
    if (text.trim().startsWith('/start')) {
      await sendMessage(chatId, intro(name), START_KB)
    } else {
      await sendMessage(chatId, await consult(text), OPEN_APP)
    }
  }
}

// Дедуп: пытаемся застолбить update_id. 201 — новый (обрабатываем),
// 409 (конфликт PK) — дубликат, пропускаем. Ошибка → не теряем апдейт.
async function claimUpdate(updateId: number): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/processed_updates`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ update_id: updateId }),
    })
    return res.status !== 409
  } catch {
    return true
  }
}

Deno.serve(async (req: Request) => {
  if (req.headers.get('x-telegram-bot-api-secret-token') !== WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 401 })
  }

  let update: Record<string, any>
  try {
    update = await req.json()
  } catch {
    return new Response('ok')
  }

  // Дубликат доставки → молча подтверждаем и выходим.
  if (typeof update.update_id === 'number') {
    const isNew = await claimUpdate(update.update_id)
    if (!isNew) return new Response('ok')
  }

  // ACK Telegram СРАЗУ, работу — в фон.
  const work = processUpdate(update).catch(() => {})
  ;(globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
    .EdgeRuntime?.waitUntil?.(work)

  return new Response('ok')
})
