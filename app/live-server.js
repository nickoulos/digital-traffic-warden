// live-server.js — ΣΚΙΩΔΗΣ ΛΕΙΤΟΥΡΓΙΑ ΖΩΝΤΑΝΑ.  node live-server.js  →  http://localhost:8765
// Κάθε λεπτό διαβάζει τις μετρήσεις των ανιχνευτών από την ανοιχτή ροή της Περιφέρειας Αττικής (data.gov.gr), φτιάχνει τη σημερινή
// μέρα μέχρι αυτή τη στιγμή και τρέχει πάνω της το σταθερό πρόγραμμα και τον Ψηφιακό Τροχονόμο. Δεν αγγίζει κανένα φανάρι.
// ΠΡΑΓΜΑΤΙΚΑ: οι μετρήσεις ροής, ταχύτητας, κατάληψης. ΠΡΟΣΟΜΟΙΩΣΗ: οι ουρές, η αναμονή και οι δύο ελεγκτές.
// Μετρήσεις της ημέρας πριν ξεκινήσει ο διακομιστής: από τον τοπικό καταγραφέα (../data/traffic) και από ό,τι
// αρχείο YYYY-MM-DD.csv.gz υπάρχει κάτω από το ./live-cache (π.χ. λήψεις του καταγραφέα στο cloud).
const http = require('http'), https = require('https'), fs = require('fs'), path = require('path'), zlib = require('zlib'), vm = require('vm');
const PORT = +process.env.PORT || 8765, FEED = 'https://loader.data.gov.gr/data/attica-region-traffic-data';
const ctx = { window: {}, module: { exports: {} }, Math, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'data.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'sim-core.js'), 'utf8'), ctx);
const DATA = ctx.window.DATA, Sim = ctx.module.exports, NB = 288;
const DETS = {}; DATA.sites.forEach(s => s.junctions.forEach(j => j.approaches.forEach(a => { DETS[a.det || a.assume[0]] = 1; })));

const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
function athens(d) {           // → { date: 'YYYY-MM-DD', sec: δευτερόλεπτα από τα μεσάνυχτα, dow }
  const s = fmt.format(d), date = s.slice(0, 10), h = +s.slice(11, 13) % 24, m = +s.slice(14, 16), x = +s.slice(17, 19);
  return { date, sec: h * 3600 + m * 60 + x, dow: new Date(date + 'T12:00:00Z').getUTCDay() };
}

const readings = {};           // readings[det][ts ISO] = [count, occ, speed]
let lastOk = 0, lastTry = 0, lastErr = '', feedTs = '';
function put(id, ts, c, o, v) {
  if (!DETS[id] || !ts || c === '' || c == null || isNaN(+c)) return;
  (readings[id] = readings[id] || {})[ts] = [+c, o === '' || o == null ? null : +o, v === '' || v == null ? null : +v];
  if (ts > feedTs) feedTs = ts;
}
function ingestCsv(file) {
  let n = 0;
  try {
    zlib.gunzipSync(fs.readFileSync(file)).toString('utf8').split('\n').forEach(l => { const r = l.trim().split(','); if (r.length >= 6 && r[1] === 'all' && DETS[r[0]]) { put(r[0], r[2], r[3], r[4], r[5]); n++; } });
  } catch (e) { console.log('δεν διαβάστηκε', file, e.message); }
  return n;
}
function walk(dir, name, out) {
  let list = []; try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  list.forEach(e => { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, name, out); else if (e.name === name) out.push(p); });
  return out;
}
function backfill() {
  const now = new Date(), names = [athens(now).date + '.csv.gz', athens(new Date(now - 864e5)).date + '.csv.gz'];   // η χθεσινή UTC μέρα καλύπτει 00:00–02:00 ώρα Ελλάδας
  let n = 0;
  names.forEach(nm => {
    const f = path.join(__dirname, '..', 'data', 'traffic', nm);
    if (fs.existsSync(f)) n += ingestCsv(f);
    walk(path.join(__dirname, 'live-cache'), nm, []).filter(p => /traffic/.test(p)).forEach(p => { n += ingestCsv(p); });
  });
  console.log('μετρήσεις από αρχεία:', n);
}
function poll(done) {
  lastTry = Date.now();
  const req = https.get(FEED, { headers: { 'User-Agent': 'traffic-shadow-demo/1.0' }, timeout: 30000 }, res => {
    if (res.statusCode !== 200) { lastErr = 'HTTP ' + res.statusCode; res.resume(); return done(false); }
    const chunks = []; res.on('data', c => chunks.push(c));
    res.on('end', () => {
      let n = 0;
      Buffer.concat(chunks).toString('utf8').split('\n').forEach(l => { if (!l.trim()) return; try { const r = JSON.parse(l); if (r.vehicle === 'all') { put(r.id, r.timestamp, r.count, r.occ, r.speed); n++; } } catch (e) { /* γραμμή που δεν διαβάζεται */ } });
      if (n) { lastOk = Date.now(); lastErr = ''; }
      done(n > 0);
    });
  });
  req.on('timeout', () => req.destroy(new Error('timeout')));
  req.on('error', e => { lastErr = e.message; done(false); });
}

// σημερινές 5λεπτες σειρές ενός ανιχνευτή· κενά με γραμμική παρεμβολή, όπως στο build_data.py
function daySeries(det, date, nowBin) {
  const sum = [], cnt = [], R = readings[det] || {};
  for (const ts in R) { const a = athens(new Date(ts)); if (a.date !== date) continue; const b = Math.floor(a.sec / 300); sum[b] = (sum[b] || 0) + R[ts][0]; cnt[b] = (cnt[b] || 0) + 1; }
  const idx = []; for (let b = 0; b <= nowBin; b++) if (cnt[b]) idx.push(b);
  if (!idx.length) return null;
  const f = new Array(NB).fill(0);
  for (let b = 0; b < NB; b++) {
    if (cnt[b] && b <= nowBin) { f[b] = sum[b] / cnt[b]; continue; }
    let lo = -1, hi = -1; for (const k of idx) { if (k < b) lo = k; else if (k > b && hi < 0) hi = k; }
    f[b] = lo < 0 ? sum[hi] / cnt[hi] : hi < 0 ? sum[lo] / cnt[lo] : (sum[lo] / cnt[lo]) + ((sum[hi] / cnt[hi]) - (sum[lo] / cnt[lo])) * (b - lo) / (hi - lo);
  }
  return { f, first: idx[0], bins: idx.length };
}
function latest(det) { const R = readings[det] || {}; let best = ''; for (const ts in R) if (ts > best) best = ts; return best ? { ts: best, count: R[best][0], occ: R[best][1], speed: R[best][2] } : null; }

let state = { ready: false }, lastKey = '';
function compute() {
  const now = new Date(), A = athens(now), nowBin = Math.floor(A.sec / 300), type = (A.dow === 0 || A.dow === 6) ? 'we' : 'wk';
  DATA.days = DATA.days.filter(d => d.key !== 'live').concat({ key: 'live', type, label: 'Σήμερα' });
  const ser = {}; let first = NB;
  for (const d in DETS) { ser[d] = daySeries(d, A.date, nowBin); DATA.detectors[d].prof.live = { f: ser[d] ? ser[d].f : DATA.detectors[d].prof[type].f }; if (ser[d] && ser[d].first < first) first = ser[d].first; }
  const out = { ready: first < NB && nowBin - first >= 1, date: A.date, dayType: type, nowSec: A.sec, fromSec: first * 300, feedTs, lastOk, lastErr, sites: [] };
  if (out.ready) for (const site of DATA.sites) {
    const t0 = first * 300, t1 = Math.max(t0 + 300, A.sec - (A.sec % 60));
    const runs = {};
    for (const c of ['fixed', 'optimal']) {
      const sim = Sim.createSim(DATA, site.id, 'live', t0, t1, { seed: 7 }, c, null), nJ = sim.net.juncs.length, g = []; for (let j = 0; j < nJ; j++) g.push([0, 0]);
      while (!sim.done) { sim.step(); if (sim.t > t1 - 900) for (let j = 0; j < nJ; j++) if (sim.sig[j].g >= 0) g[j][sim.sig[j].g]++; }
      runs[c] = { s: sim.summary(), series: sim.series, green: g, modes: sim.net.juncs.map((J, j) => sim.mode(j)), q: sim.net.apps.map((x, a) => sim.qlen(a)), sim };
    }
    const F = runs.fixed, O = runs.optimal, cum = []; let acc = 0;
    for (let b = 0; b < F.series.t.length; b++) { acc += (F.series.qInt[b] - O.series.qInt[b]) / 3600; cum.push(+acc.toFixed(2)); }
    const net = O.sim.net;
    out.sites.push({
      id: site.id, name: site.short, arrived: F.s.arrived,
      waitFixed: +F.s.meanDelay.toFixed(1), waitOurs: +O.s.meanDelay.toFixed(1), savedH: +(F.s.delayH - O.s.delayH).toFixed(1),
      deltaPct: F.s.meanDelay ? +(100 * (O.s.meanDelay - F.s.meanDelay) / F.s.meanDelay).toFixed(1) : 0, cum, t0,
      juncs: net.juncs.map((J, j) => ({ name: J.name, mode: O.modes[j], greenFixed: F.green[j], greenOurs: O.green[j] })),
      approaches: net.apps.map((x, a) => {
        const s = ser[x.ref], L = latest(x.ref);
        return { id: x.id, label: x.label, phase: x.phase, det: x.det, measured: x.measured, factor: x.factor,
          flow: L ? Math.round(L.count * x.factor) : null, speed: x.measured && L ? L.speed : null, occ: x.measured && L ? L.occ : null, ts: L ? L.ts : null,
          spark: s ? s.f.slice(first, nowBin + 1).map(v => Math.round(v * x.factor)) : [], bins: s ? s.bins : 0, qFixed: F.q[a], qOurs: O.q[a] };
      })
    });
  }
  state = out;
}
function tick() {
  poll(ok => {
    const key = feedTs + '|' + Math.floor(Date.now() / 60000);
    if (key !== lastKey) { lastKey = key; const t = Date.now(); try { compute(); } catch (e) { console.log('σφάλμα υπολογισμού:', e.stack); } console.log(new Date().toISOString().slice(11, 19), ok ? 'ροή ΟΚ' : 'ροή: ' + lastErr, 'υπολογισμός', Date.now() - t, 'ms', state.sites ? state.sites.map(s => s.id + ' ' + s.savedH + 'h').join(' · ') : ''); }
  });
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/api/now') { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(JSON.stringify(Object.assign({ serverNow: Date.now() }, state, { lastOk, lastErr }))); }
  const f = path.join(__dirname, path.normalize(u === '/' ? 'now.html' : decodeURIComponent(u)).replace(/^([\\/]|\.\.)+/, ''));
  if (!f.startsWith(__dirname) || !TYPES[path.extname(f)] || !fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)], 'Cache-Control': 'no-store' }); res.end(fs.readFileSync(f));
}).listen(PORT, '127.0.0.1', () => console.log('Σκιώδης λειτουργία ζωντανά: http://localhost:' + PORT));
backfill(); tick(); setInterval(tick, 30000);
