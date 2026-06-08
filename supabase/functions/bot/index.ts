// Edge Function `bot` — Telegram webhook бота-консьержа Табыс.
//
// Бот НЕ считает маржу и не трогает токены — весь функционал в TMA.
//   /start          → приветствие + вопрос «главная боль?» с 4 кнопками (сегментация)
//   нажатие кнопки  → точечный ответ по боли + кнопка web_app «Открыть Табыс»
//   любое сообщение → короткая консультация через Gemini, всегда с возвратом в TMA
//
// web_app-кнопка открывает Mini App с валидным initData → авторизация (tg-auth) срабатывает.
// Деплой и секреты — см. supabase/README.md.

import { GoogleGenerativeAI } from '@google/generative-ai'

const BOT_TOKEN = Deno.env.get('BOT_TOKEN')!
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!
const WEBHOOK_SECRET = Deno.env.get('BOT_WEBHOOK_SECRET')!
const TMA_URL = Deno.env.get('TMA_URL') ?? 'https://kaspi-seller-miniapp.vercel.app'

const API = `https://api.telegram.org/bot${BOT_TOKEN}`

// Кнопка, открывающая Mini App прямо в Telegram (с initData).
const OPEN_APP = {
  inline_keyboard: [[{ text: '🚀 Открыть Табыс', web_app: { url: TMA_URL } }]],
}

// Квалификация при старте: какая главная боль продавца.
const PAIN_KB = {
  inline_keyboard: [
    [{ text: '📊 Не знаю реальную маржу', callback_data: 'pain_margin' }],
    [{ text: '📝 Карточки плохо находят', callback_data: 'pain_seo' }],
    [{ text: '⚖️ Где выгоднее — Kaspi или WB', callback_data: 'pain_compare' }],
    [{ text: '🔍 Ищу нишу для старта', callback_data: 'pain_niche' }],
  ],
}

// Точечный ответ на каждую боль → всегда возврат в приложение.
const PAIN_REPLY: Record<string, string> = {
  pain_margin:
    'Это сердце Табыс 💰\nВбей закуп, цену, категорию и вес — за 30 секунд увидишь чистую прибыль и ROI на Kaspi и WB сразу. Открывай калькулятор 👇',
  pain_seo:
    'Карточки — это про SEO 📝\nГенератор описаний (рус + каз) под алгоритмы площадок уже на подходе. А пока загляни в приложение — там живой калькулятор маржи 👇',
  pain_compare:
    'Это наша главная фишка ⚖️\nОдин товар — обе площадки рядом, сразу видно, где прибыль выше. Открой калькулятор и сравни Kaspi vs WB 👇',
  pain_niche:
    'Старт — это про юнит-экономику 🔍\nПоиск ниш скоро будет, а пока посчитай будущий товар в калькуляторе, чтобы не уйти в минус с первой партии 👇',
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
  return tg('sendMessage', {
    chat_id: chatId,
    text,
    reply_markup: replyMarkup,
  })
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)

const SYSTEM = `Ты — Табыс, дружелюбный ассистент продавца маркетплейсов Казахстана (Kaspi, Wildberries, Ozon).
Отвечай коротко: 2–4 предложения, по-деловому и тепло. Дай одну конкретную полезную мысль по вопросу продавца.
НЕ выдумывай точные числа, комиссии и курсы — для этого есть калькулятор в приложении.
В конце всегда мягко направь в приложение: точный расчёт маржи и все инструменты — в приложении Табыс (кнопка ниже).
Отвечай на языке пользователя (русский или казахский).`

const FALLBACK =
  'Помогу с маржой, выбором площадки и закупом. Точный расчёт и инструменты — в приложении Табыс 👇'

async function consult(userText: string): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({
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
    'Табыс — платформа для продавцов Kaspi и WB.',
    'Пока всё бесплатно — тестируем вместе.',
    '',
    'Один вопрос: что сейчас самая большая головная боль в твоих продажах?',
  ].join('\n')
}

Deno.serve(async (req: Request) => {
  // Проверяем секрет вебхука — Telegram шлёт его в этом заголовке.
  if (req.headers.get('x-telegram-bot-api-secret-token') !== WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 401 })
  }

  try {
    const update = await req.json()

    // 1. Нажатие inline-кнопки боли.
    const cq = update.callback_query
    if (cq) {
      await tg('answerCallbackQuery', { callback_query_id: cq.id })
      const chatId: number | undefined = cq.message?.chat?.id
      const reply = PAIN_REPLY[cq.data as string]
      if (chatId && reply) await sendMessage(chatId, reply, OPEN_APP)
      return new Response('ok')
    }

    // 2. Текстовое сообщение.
    const msg = update.message ?? update.edited_message
    const text: string | undefined = msg?.text
    if (msg && text) {
      const chatId = msg.chat.id
      const name = msg.from?.first_name ?? 'продавец'
      if (text.trim().startsWith('/start')) {
        await sendMessage(chatId, intro(name), PAIN_KB)
      } else {
        await sendMessage(chatId, await consult(text), OPEN_APP)
      }
    }
  } catch {
    // глотаем — Telegram не должен ретраить из-за нашей ошибки
  }

  // Всегда 200, иначе Telegram будет повторять доставку апдейта.
  return new Response('ok')
})
