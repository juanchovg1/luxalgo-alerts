import 'dotenv/config';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
// Accepts either TELEGRAM_CHAT_ID (single) or TELEGRAM_CHAT_IDS (comma-separated list).
// Use a negative ID for a Telegram group chat.
const CHAT_IDS_RAW = process.env.TELEGRAM_CHAT_IDS || process.env.TELEGRAM_CHAT_ID || '';
const CHAT_IDS = CHAT_IDS_RAW.split(',').map(s => s.trim()).filter(Boolean);

if (!TOKEN || CHAT_IDS.length === 0) {
  throw new Error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_IDS in .env');
}

const API = `https://api.telegram.org/bot${TOKEN}`;

async function sendOne(chatId, text) {
  const res = await fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegram error for chat ${chatId}: ${data.description}`);
  }
  return data.result;
}

export async function sendTelegram(text) {
  // Send to all configured chat IDs in parallel. If one fails the others still try.
  const results = await Promise.allSettled(CHAT_IDS.map(id => sendOne(id, text)));
  const failures = results.filter(r => r.status === 'rejected');
  if (failures.length > 0) {
    console.warn(`[telegram] ${failures.length}/${CHAT_IDS.length} sends failed:`, failures.map(f => f.reason.message).join('; '));
  }
  if (failures.length === CHAT_IDS.length) {
    throw new Error('All Telegram sends failed');
  }
  return results;
}

export function getChatIds() {
  return [...CHAT_IDS];
}

export function formatAlert({ symbol, type, direction, price, time }) {
  const emoji = direction === 'BULLISH' ? '🟢' : '🔴';
  const dirText = direction === 'BULLISH' ? 'Bullish' : 'Bearish';
  const typeText = type === 'INTERNAL' ? 'Internal OB' : 'Swing OB';
  const timeStr = time ? new Date(time).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '';
  return `${emoji} <b>${dirText} ${typeText}</b>\nSymbol: <code>${symbol || 'UNKNOWN'}</code>\nPrice: <code>${price}</code>\nTime: ${timeStr}`;
}
