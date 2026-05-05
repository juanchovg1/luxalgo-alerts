import 'dotenv/config';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const TV_CLI = process.env.TV_CLI;
const ALERT_ENDPOINT = process.env.ALERT_ENDPOINT || 'http://localhost:3000/alert';
const INTERVAL = Number(process.env.POLL_INTERVAL_MS || 5000);
const COLOR_BULLISH = Number(process.env.COLOR_BULLISH);
const COLOR_BEARISH = Number(process.env.COLOR_BEARISH);
const WARMUP_SKIP = String(process.env.WARMUP_SKIP || 'true') === 'true';
const DRY_RUN = process.argv.includes('--dry-run');
const INSPECT_COLORS = process.argv.includes('--inspect-colors');

if (!TV_CLI) throw new Error('TV_CLI not set in .env');

const seenIds = new Set();
let firstCycle = true;
let currentSymbol = 'UNKNOWN';

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

function runTvCli(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [TV_CLI, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    proc.stdout.on('data', d => out += d.toString());
    proc.stderr.on('data', d => err += d.toString());
    proc.on('error', reject);
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(`tv CLI exited ${code}: ${err}`));
      try { resolve(JSON.parse(out)); } catch (e) { reject(new Error(`tv CLI bad JSON: ${e.message}\nRAW: ${out.slice(0, 200)}`)); }
    });
  });
}

async function fetchStatus() {
  const r = await runTvCli(['status']);
  if (!r.success) throw new Error('tv status failed');
  return r;
}

async function fetchBoxes() {
  const r = await runTvCli(['data', 'boxes', '-v', '-f', 'LuxAlgo']);
  if (!r.success) throw new Error('tv data boxes failed');
  const study = r.studies && r.studies[0];
  if (!study) return [];
  return study.all_boxes || [];
}

function classify(box) {
  if (box.bgColor === COLOR_BULLISH) return 'BULLISH';
  if (box.bgColor === COLOR_BEARISH) return 'BEARISH';
  return null;
}

// LuxAlgo draws 2 adjacent boxes per OB (sharing a midpoint y).
// Group by (x1, color) so each pair becomes one OB.
function groupBoxesIntoOBs(boxes) {
  const groups = new Map();
  for (const b of boxes) {
    const direction = classify(b);
    if (!direction) continue;
    const key = `${b.x1}:${direction}`;
    if (!groups.has(key)) groups.set(key, { x1: b.x1, x2: b.x2, direction, boxes: [] });
    groups.get(key).boxes.push(b);
  }
  const obs = [];
  for (const g of groups.values()) {
    const ys = g.boxes.flatMap(b => [b.high, b.low]);
    const high = Math.max(...ys);
    const low = Math.min(...ys);
    const ids = g.boxes.map(b => b.id).sort((a, b) => a - b);
    obs.push({
      direction: g.direction,
      high: Number(high.toFixed(8)),
      low: Number(low.toFixed(8)),
      mid: Number(((high + low) / 2).toFixed(8)),
      x1: g.x1,
      x2: g.x2,
      ids,
      key: ids.join('-'),
    });
  }
  return obs;
}

async function postAlert(ob) {
  const payload = {
    symbol: currentSymbol,
    type: 'INTERNAL',
    direction: ob.direction,
    price: String(ob.mid),
    time: Date.now(),
    extra: { high: ob.high, low: ob.low, x1: ob.x1, ids: ob.ids },
  };
  const text = `OB_${ob.direction}_INTERNAL|${ob.mid}|${Date.now()}|${currentSymbol}`;
  if (DRY_RUN) {
    log('[DRY-RUN] would POST:', text);
    return;
  }
  try {
    const res = await fetch(ALERT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: text,
    });
    if (!res.ok) log('POST failed:', res.status, await res.text());
    else log('→ Telegram:', text);
  } catch (e) {
    log('POST error:', e.message);
  }
}

async function pollOnce() {
  // Refresh symbol every cycle so alerts always reflect the chart the user is currently viewing.
  // If the symbol changed since last poll, reset seenIds and re-warmup (existing OBs on the new
  // chart are pre-existing, not "new" alerts).
  let symbolChanged = false;
  try {
    const s = await fetchStatus();
    const newSymbol = s.chart_symbol || 'UNKNOWN';
    if (newSymbol !== currentSymbol) {
      log(`symbol changed: ${currentSymbol} → ${newSymbol} — re-warming up`);
      currentSymbol = newSymbol;
      seenIds.clear();
      symbolChanged = true;
    }
  } catch (e) {
    log('status refresh failed:', e.message);
  }

  const boxes = await fetchBoxes();
  const obs = groupBoxesIntoOBs(boxes);

  const newOBs = [];
  for (const ob of obs) {
    const newIds = ob.ids.filter(id => !seenIds.has(id));
    if (newIds.length > 0) {
      newOBs.push(ob);
      ob.ids.forEach(id => seenIds.add(id));
    }
  }

  if (firstCycle || symbolChanged) {
    firstCycle = false;
    obs.forEach(ob => ob.ids.forEach(id => seenIds.add(id)));
    log(`warmup: indexed ${obs.length} existing OBs on ${currentSymbol} (${obs.filter(o => o.direction === 'BULLISH').length} bull / ${obs.filter(o => o.direction === 'BEARISH').length} bear)`);
    if (WARMUP_SKIP || symbolChanged) return;
  }

  if (newOBs.length > 0) {
    log(`detected ${newOBs.length} new OB(s) on ${currentSymbol}`);
    for (const ob of newOBs) {
      log(`  ${ob.direction} OB @ mid=${ob.mid} [${ob.low}-${ob.high}]`);
      await postAlert(ob);
    }
  }
}

async function inspectColors() {
  const boxes = await fetchBoxes();
  const tally = new Map();
  for (const b of boxes) {
    const c = b.bgColor;
    tally.set(c, (tally.get(c) || 0) + 1);
  }
  const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  log('Color distribution across LuxAlgo boxes:');
  for (const [argb, count] of sorted) {
    const u = argb >>> 0;
    const a = (u >>> 24) & 0xff;
    const r = (u >>> 16) & 0xff;
    const g = (u >>> 8) & 0xff;
    const bl = u & 0xff;
    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
    const dominant = [['R', r], ['G', g], ['B', bl]].sort((a, b) => b[1] - a[1])[0][0];
    log(`  ${argb}  alpha=${a} rgb=${hex}  count=${count}  → dominant channel: ${dominant}`);
  }
  log('Update COLOR_BULLISH and COLOR_BEARISH in poller/.env with the values above.');
}

async function main() {
  if (INSPECT_COLORS) {
    await inspectColors();
    return;
  }
  log(`luxalgo-alerts poller starting (interval=${INTERVAL}ms, dry-run=${DRY_RUN})`);
  try {
    const s = await fetchStatus();
    currentSymbol = s.chart_symbol || 'UNKNOWN';
    log(`connected to TradingView: ${currentSymbol} @ ${s.chart_resolution}m`);
  } catch (e) {
    log('initial status check failed:', e.message);
    process.exit(1);
  }

  while (true) {
    try {
      await pollOnce();
    } catch (e) {
      log('poll error:', e.message);
    }
    await delay(INTERVAL);
  }
}

main();
