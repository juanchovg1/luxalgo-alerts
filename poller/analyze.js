// Diagnostic: classifies each LuxAlgo OB color as BULLISH or BEARISH by
// checking whether its boxes are above or below current price.
// BULLISH = below price (support / demand). BEARISH = above price (resistance / supply).
//
// Reads ALL open TradingView tabs and aggregates results across them.

import { readAllTabs, closeAll } from './cdp-multi.js';

const tabs = await readAllTabs();
if (tabs.length === 0) {
  console.error('No TradingView tabs found. Is TV Desktop running with --remote-debugging-port=9222?');
  await closeAll();
  process.exit(1);
}

console.log(`Analyzing ${tabs.length} tab(s):\n`);

const colorStats = new Map(); // bgColor → { aboveAcross, belowAcross, atAcross }

for (const tab of tabs) {
  if (tab.error) {
    console.log(`Tab ${tab.targetId?.slice(0, 8) || '?'}: ERROR ${tab.error}`);
    continue;
  }

  const symbol = tab.symbol || '?';
  const all = (tab.studies || []).flatMap(s => s.items || []);
  if (all.length === 0) {
    console.log(`Tab ${symbol}: no LuxAlgo boxes\n`);
    continue;
  }

  // Group adjacent box pairs (LuxAlgo draws 2 boxes per OB)
  const groups = new Map();
  for (const b of all) {
    const k = `${b.x1}:${b.bgColor}`;
    if (!groups.has(k)) groups.set(k, { color: b.bgColor, ys: [] });
    groups.get(k).ys.push(b.y1, b.y2);
  }
  const obs = [...groups.values()].map(g => ({
    color: g.color,
    high: Math.max(...g.ys),
    low: Math.min(...g.ys),
  }));

  // Need a price reference. Use the average of all OB midpoints as a rough proxy
  // when we don't have a quote. (We could call data_get_ohlcv but inline it for simplicity.)
  // Better: ask the chart for its lastPrice. Inline JS call.
  // For now, classify per-tab using the most-recent OB high as a price proxy
  // and just print positions.
  obs.sort((a, b) => b.high - a.high);
  // Heuristic price: midpoint of the full OB range. Not perfect but enough to cluster.
  const allYs = obs.flatMap(o => [o.high, o.low]);
  const priceProxy = (Math.max(...allYs) + Math.min(...allYs)) / 2;

  console.log(`Tab ${symbol}  (price proxy ≈ ${priceProxy.toFixed(4)}):`);
  for (const o of obs) {
    const u = Number(o.color) >>> 0;
    const r = (u >>> 16) & 0xff, g = (u >>> 8) & 0xff, b = u & 0xff;
    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    const pos = o.low > priceProxy ? '↑ above' : o.high < priceProxy ? '↓ below' : '= at';
    console.log(`  ${hex}  [${o.low.toFixed(4)} - ${o.high.toFixed(4)}]  ${pos}`);
    const stat = colorStats.get(o.color) || { above: 0, below: 0, at: 0 };
    if (o.low > priceProxy) stat.above++;
    else if (o.high < priceProxy) stat.below++;
    else stat.at++;
    colorStats.set(o.color, stat);
  }
  console.log('');
}

console.log('=== Aggregate color summary ===');
console.log('Use BULLISH for the color with most "below" OBs (support).');
console.log('Use BEARISH for the color with most "above" OBs (resistance).\n');
for (const [color, s] of colorStats) {
  const u = Number(color) >>> 0;
  const r = (u >>> 16) & 0xff, g = (u >>> 8) & 0xff, b = u & 0xff;
  const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  const verdict = s.below > s.above ? 'BULLISH' : s.above > s.below ? 'BEARISH' : 'AMBIGUOUS';
  console.log(`Color ${color} (${hex}): above=${s.above}  below=${s.below}  at=${s.at}  → ${verdict}`);
}

await closeAll();
