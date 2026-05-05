import 'dotenv/config';
import express from 'express';
import { sendTelegram, formatAlert } from './telegram.js';

const app = express();
app.use(express.json());
app.use(express.text({ type: '*/*' }));

const PORT = process.env.PORT || 3000;

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/alert', async (req, res) => {
  try {
    const raw = typeof req.body === 'string' ? req.body : (req.body.message || JSON.stringify(req.body));
    console.log('[alert] received:', raw);

    const parsed = parseAlertMessage(raw);
    const text = parsed ? formatAlert(parsed) : `⚠️ Alert (raw):\n<code>${escapeHtml(raw)}</code>`;

    await sendTelegram(text);
    res.json({ ok: true });
  } catch (err) {
    console.error('[alert] error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

function parseAlertMessage(raw) {
  const parts = raw.split('|').map(s => s.trim());
  if (parts.length < 3) return null;
  const [tag, priceStr, timeStr, symbol] = parts;
  const m = tag.match(/^OB_(BULLISH|BEARISH)_(INTERNAL|SWING)$/);
  if (!m) return null;
  return {
    direction: m[1],
    type: m[2],
    price: priceStr,
    time: Number(timeStr) || Date.now(),
    symbol: symbol || 'XAUUSD',
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

app.listen(PORT, () => {
  console.log(`luxalgo-alerts server listening on http://localhost:${PORT}`);
  console.log(`POST alerts to http://localhost:${PORT}/alert`);
});
