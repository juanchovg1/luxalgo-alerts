import { spawn } from 'node:child_process';

const TV_CLI = 'C:/Users/Juan V/tradingview-mcp/src/cli/index.js';

function tv(args) {
  return new Promise((resolve, reject) => {
    const p = spawn('node', [TV_CLI, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let o = '';
    p.stdout.on('data', d => (o += d));
    p.on('close', c => c === 0 ? resolve(JSON.parse(o)) : reject(new Error('exit ' + c)));
  });
}

const quote = await tv(['quote']);
const price = quote.close;
const boxes = await tv(['data', 'boxes', '-v', '-f', 'LuxAlgo']);
const all = boxes.studies[0].all_boxes;

const groups = new Map();
for (const b of all) {
  const k = `${b.x1}:${b.bgColor}`;
  if (!groups.has(k)) groups.set(k, { color: b.bgColor, x1: b.x1, ys: [] });
  groups.get(k).ys.push(b.high, b.low);
}

const obs = [...groups.values()].map(g => ({
  color: g.color,
  high: Math.max(...g.ys),
  low: Math.min(...g.ys),
  mid: (Math.max(...g.ys) + Math.min(...g.ys)) / 2,
}));

console.log(`Current price: ${price}\n`);
console.log(`OBs detected: ${obs.length}\n`);

const byColor = {};
for (const o of obs) {
  const pos = o.low > price ? 'ABOVE' : o.high < price ? 'BELOW' : 'AT';
  byColor[o.color] = byColor[o.color] || { above: 0, below: 0, at: 0 };
  byColor[o.color][pos.toLowerCase()]++;
}

for (const [color, c] of Object.entries(byColor)) {
  const u = Number(color) >>> 0;
  const r = (u >>> 16) & 0xff;
  const g = (u >>> 8) & 0xff;
  const b = u & 0xff;
  const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  const total = c.above + c.below + c.at;
  console.log(`Color ${color} (${hex}): ${total} OBs → above=${c.above}, below=${c.below}, at=${c.at}`);
  console.log(`  → if mostly ABOVE current price = BEARISH (resistance/supply)`);
  console.log(`  → if mostly BELOW current price = BULLISH (support/demand)\n`);
}

console.log('--- Individual OBs ---');
obs.sort((a, b) => b.high - a.high);
for (const o of obs) {
  const u = Number(o.color) >>> 0;
  const r = (u >>> 16) & 0xff, g = (u >>> 8) & 0xff, b = u & 0xff;
  const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  const pos = o.low > price ? '↑ above' : o.high < price ? '↓ below' : '= at';
  console.log(`  ${hex}  [${o.low.toFixed(2)} - ${o.high.toFixed(2)}]  mid=${o.mid.toFixed(2)}  ${pos}`);
}
