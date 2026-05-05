import 'dotenv/config';
import { setTimeout as delay } from 'node:timers/promises';
import { readAllTabs, closeAll } from './cdp-multi.js';

const ALERT_ENDPOINT = process.env.ALERT_ENDPOINT || 'http://localhost:3000/alert';
const INTERVAL = Number(process.env.POLL_INTERVAL_MS || 5000);
const COLOR_BULLISH = Number(process.env.COLOR_BULLISH);
const COLOR_BEARISH = Number(process.env.COLOR_BEARISH);
const WARMUP_SKIP = String(process.env.WARMUP_SKIP || 'true') === 'true';
const DRY_RUN = process.argv.includes('--dry-run');
const INSPECT_COLORS = process.argv.includes('--inspect-colors');

// Per-tab state. Each tab gets its own seenIds set, keyed by targetId.
// This keeps OB tracking isolated when the user has multiple charts open.
const tabState = new Map(); // targetId → { symbol, seenIds: Set<number>, firstCycle: boolean }

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

function classify(box) {
  if (box.bgColor === COLOR_BULLISH) return 'BULLISH';
  if (box.bgColor === COLOR_BEARISH) return 'BEARISH';
  return null;
}

// LuxAlgo draws 2 adjacent boxes per OB sharing a midpoint y.
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
    const ys = g.boxes.flatMap(b => [b.y1, b.y2]).filter(v => typeof v === 'number');
    if (ys.length === 0) continue;
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

async function postAlert(symbol, ob) {
  const text = `OB_${ob.direction}_INTERNAL|${ob.mid}|${Date.now()}|${symbol}`;
  if (DRY_RUN) {
    log('[DRY-RUN]', text);
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
  let tabs;
  try {
    tabs = await readAllTabs();
  } catch (e) {
    log('readAllTabs failed:', e.message);
    return;
  }

  if (tabs.length === 0) {
    log('no TradingView tabs found');
    return;
  }

  // Drop state for tabs that no longer exist (user closed them)
  const liveIds = new Set(tabs.map(t => t.targetId));
  for (const id of [...tabState.keys()]) {
    if (!liveIds.has(id)) {
      log(`tab closed: ${tabState.get(id).symbol} (${id.slice(0, 8)})`);
      tabState.delete(id);
    }
  }

  for (const tab of tabs) {
    if (tab.error) {
      // First poll of a fresh tab can hit a not-yet-loaded chart widget. Silently retry next cycle.
      continue;
    }
    const symbol = tab.symbol || 'UNKNOWN';
    const studies = tab.studies || [];
    const allBoxes = studies.flatMap(s => s.items || []);
    const obs = groupBoxesIntoOBs(allBoxes);

    let st = tabState.get(tab.targetId);
    if (!st) {
      st = { symbol, seenIds: new Set(), firstCycle: true };
      tabState.set(tab.targetId, st);
    }

    // If the symbol changed within the same tab (user changed ticker without closing tab),
    // re-warmup so we don't emit existing OBs as new.
    let symbolChanged = false;
    if (st.symbol !== symbol) {
      log(`symbol changed in tab ${tab.targetId.slice(0, 8)}: ${st.symbol} → ${symbol}`);
      st.symbol = symbol;
      st.seenIds.clear();
      symbolChanged = true;
    }

    const newOBs = [];
    for (const ob of obs) {
      const newIds = ob.ids.filter(id => !st.seenIds.has(id));
      if (newIds.length > 0) {
        newOBs.push(ob);
        ob.ids.forEach(id => st.seenIds.add(id));
      }
    }

    if (st.firstCycle || symbolChanged) {
      st.firstCycle = false;
      obs.forEach(ob => ob.ids.forEach(id => st.seenIds.add(id)));
      const bull = obs.filter(o => o.direction === 'BULLISH').length;
      const bear = obs.filter(o => o.direction === 'BEARISH').length;
      log(`warmup: ${symbol} (${tab.targetId.slice(0, 8)}) — indexed ${obs.length} OBs (${bull} bull / ${bear} bear)`);
      if (WARMUP_SKIP || symbolChanged) continue;
    }

    if (newOBs.length > 0) {
      log(`detected ${newOBs.length} new OB(s) on ${symbol}`);
      for (const ob of newOBs) {
        log(`  ${ob.direction} OB @ mid=${ob.mid} [${ob.low}-${ob.high}]`);
        await postAlert(symbol, ob);
      }
    }
  }
}

async function inspectColors() {
  const tabs = await readAllTabs();
  const tally = new Map();
  for (const tab of tabs) {
    if (tab.error) continue;
    for (const study of tab.studies || []) {
      for (const b of study.items || []) {
        tally.set(b.bgColor, (tally.get(b.bgColor) || 0) + 1);
      }
    }
  }
  const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  log(`Color distribution across ${tabs.length} tab(s):`);
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
    await closeAll();
    return;
  }
  log(`luxalgo-alerts poller starting (interval=${INTERVAL}ms, dry-run=${DRY_RUN}, multi-tab=true)`);

  // Initial connectivity check
  try {
    const tabs = await readAllTabs();
    log(`connected to TradingView: ${tabs.length} tab(s) detected`);
    for (const t of tabs) {
      log(`  • ${t.symbol || '?'} @ ${t.resolution || '?'}m  (${t.targetId.slice(0, 8)})`);
    }
  } catch (e) {
    log('initial CDP check failed:', e.message);
    log('Is TradingView Desktop running with --remote-debugging-port=9222?');
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
