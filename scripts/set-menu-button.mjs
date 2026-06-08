#!/usr/bin/env node
/*
 * Одноразовая настройка: ставит Menu Button бота так, чтобы он открывал
 * Telegram Mini App «Табыс». Ничего не хостит — это один вызов Bot API,
 * который конфигурирует серверы Telegram. После запуска кнопка «Открыть Табыс»
 * появляется во всех личных чатах с ботом и работает, даже когда бот выключен.
 *
 * Запуск (из корня репозитория):
 *   node scripts/set-menu-button.mjs
 *
 * Переменные:
 *   TELEGRAM_BOT_TOKEN  обязательна (берётся из окружения или из .env в корне)
 *   TMA_URL             необязательна (по умолчанию — прод-адрес TMA на Vercel)
 *
 * Откатить (вернуть дефолтную кнопку-меню Telegram):
 *   node scripts/set-menu-button.mjs --reset
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DEFAULT_TMA_URL = 'https://kaspi-seller-miniapp.vercel.app';
const BUTTON_TEXT = 'Открыть Табыс';

/** Подхватывает переменные из .env в корне, не перетирая то, что уже в окружении. */
function loadEnvFromFile() {
  try {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const raw = readFileSync(join(root, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('='); // только первый '=' — токены содержат ':'
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, '');
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // .env необязателен — токен можно передать через окружение
  }
}

async function main() {
  loadEnvFromFile();

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('❌ TELEGRAM_BOT_TOKEN не задан (ни в окружении, ни в .env).');
    process.exit(1);
  }

  const reset = process.argv.includes('--reset');
  const tmaUrl = process.env.TMA_URL || DEFAULT_TMA_URL;

  const menuButton = reset
    ? { type: 'default' }
    : { type: 'web_app', text: BUTTON_TEXT, web_app: { url: tmaUrl } };

  const res = await fetch(
    `https://api.telegram.org/bot${token}/setChatMenuButton`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ menu_button: menuButton }),
    },
  );
  const data = await res.json();

  if (!data.ok) {
    console.error('❌ Ошибка Bot API:', JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log(
    reset
      ? '✅ Menu Button сброшена на дефолтную.'
      : `✅ Menu Button установлена: «${BUTTON_TEXT}» открывает ${tmaUrl}`,
  );
}

main().catch((err) => {
  console.error('❌ Непредвиденная ошибка:', err);
  process.exit(1);
});
