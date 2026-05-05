// Multi-tab reader: connects directly to every TradingView CDP target
// (one per chart tab in TV Desktop) and runs the boxes-extraction JS
// on each one in parallel. Avoids disrupting the user by NOT switching tabs.
//
// We don't reuse the tradingview-mcp here because that lib was designed for
// a single active target. CDP itself is happy to host multiple parallel
// Runtime.evaluate connections — one per target — which is what we do.

import CDP from 'chrome-remote-interface';

const HOST = 'localhost';
const PORT = 9222;

// JS evaluated on each target. Mirrors data.js buildGraphicsJS('dwgboxes', 'boxes', 'LuxAlgo')
// from tradingview-mcp, but inlined so we don't need the dep.
const BOXES_JS = `
(function() {
  try {
    if (!window.TradingViewApi || !window.TradingViewApi._activeChartWidgetWV) return { error: 'no_chart_widget' };
    var chart = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget;
    var model = chart.model();
    var sources = model.model().dataSources();
    var symbol = (function() {
      try { return chart._model.mainSeries().symbol(); } catch(e) {}
      try { return model.mainSeries().symbol(); } catch(e) {}
      return null;
    })();
    var resolution = (function() {
      try { return model.mainSeries().interval(); } catch(e) {}
      return null;
    })();
    var results = [];
    for (var si = 0; si < sources.length; si++) {
      var s = sources[si];
      if (!s.metaInfo) continue;
      try {
        var meta = s.metaInfo();
        var name = meta.description || meta.shortDescription || '';
        if (!name || name.indexOf('LuxAlgo') === -1) continue;
        var g = s._graphics;
        if (!g || !g._primitivesCollection) continue;
        var pc = g._primitivesCollection;
        var items = [];
        if (pc.dwgboxes) {
          var inner = pc.dwgboxes.get('boxes');
          if (inner) {
            var coll = inner.get(false);
            if (coll && coll._primitivesDataById && coll._primitivesDataById.size > 0) {
              coll._primitivesDataById.forEach(function(v, id) {
                items.push({ id: id, x1: v.x1, x2: v.x2, y1: v.y1, y2: v.y2, bgColor: v.bc });
              });
            }
          }
        }
        if (items.length > 0) results.push({ name: name, count: items.length, items: items });
      } catch (e) {}
    }
    return { symbol: symbol, resolution: resolution, studies: results };
  } catch (e) {
    return { error: e.message };
  }
})();
`;

let clients = new Map(); // targetId → { client, lastUsed }

async function listTargets() {
  // GET /json returns all CDP targets including TradingView tabs.
  const res = await fetch(`http://${HOST}:${PORT}/json`);
  if (!res.ok) throw new Error(`CDP /json returned ${res.status}`);
  const all = await res.json();
  // Filter to TradingView chart pages only
  return all.filter(t => t.type === 'page' && t.url && t.url.includes('tradingview.com/chart'));
}

async function getOrConnect(targetId) {
  const existing = clients.get(targetId);
  if (existing) {
    try {
      await existing.client.Runtime.evaluate({ expression: '1', returnByValue: true });
      return existing.client;
    } catch {
      try { await existing.client.close(); } catch {}
      clients.delete(targetId);
    }
  }
  const client = await CDP({ host: HOST, port: PORT, target: targetId });
  await client.Runtime.enable();
  clients.set(targetId, { client, lastUsed: Date.now() });
  return client;
}

async function readOneTarget(target) {
  const client = await getOrConnect(target.id);
  const result = await client.Runtime.evaluate({
    expression: BOXES_JS,
    returnByValue: true,
    awaitPromise: false,
  });
  if (result.exceptionDetails) {
    return { targetId: target.id, error: result.exceptionDetails.text || 'eval exception' };
  }
  const value = result.result?.value || {};
  return {
    targetId: target.id,
    chartId: target.url ? (target.url.match(/\/chart\/([^/?]+)/) || [])[1] : null,
    symbol: value.symbol,
    resolution: value.resolution,
    studies: value.studies || [],
    error: value.error,
  };
}

// Public: read box data from every TradingView tab in parallel.
// Returns array of { targetId, symbol, resolution, studies: [{name, items: [{id,y1,y2,bgColor}, ...]}] }
export async function readAllTabs() {
  const targets = await listTargets();
  if (targets.length === 0) return [];
  const results = await Promise.allSettled(targets.map(readOneTarget));
  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return { targetId: targets[i].id, error: r.reason?.message || 'unknown error' };
  });
}

export async function closeAll() {
  for (const { client } of clients.values()) {
    try { await client.close(); } catch {}
  }
  clients.clear();
}

// Cleanup on exit
process.on('SIGINT', () => closeAll().finally(() => process.exit(0)));
process.on('SIGTERM', () => closeAll().finally(() => process.exit(0)));
