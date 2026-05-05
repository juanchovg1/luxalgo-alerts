import { sendTelegram, formatAlert } from './telegram.js';

const sample = formatAlert({
  symbol: 'XAUUSD',
  type: 'INTERNAL',
  direction: 'BULLISH',
  price: '4598.50',
  time: Date.now(),
});

const header = '✅ <b>Pipeline test</b> — luxalgo-alerts conectado a Telegram\n\n';

try {
  await sendTelegram(header + sample);
  console.log('Test message sent.');
} catch (err) {
  console.error('Failed:', err.message);
  process.exit(1);
}
