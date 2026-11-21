// build_map.js — φτιάχνει το map-data.js για το κέντρο ελέγχου (control.html).
//   node build_map.js [osm.json]
// ΑΝΙΧΝΕΥΤΕΣ: όλοι οι ανιχνευτές της Περιφέρειας μέσα στο πλαίσιο του χάρτη, με τις μετρήσεις της Τρίτης 3/11/2026 ανά 5 λεπτά
//   (ροή οχ/ώρα, ταχύτητα km/h), από το ../data/traffic (μόνο ανάγνωση).
// ΔΡΟΜΟΙ: γεωμετρία κύριων οδών από το OpenStreetMap (© OpenStreetMap contributors, ODbL), αποτέλεσμα ερωτήματος Overpass:
//   way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"](37.955,23.675,38.03,23.81); out geom;
//   Αν δεν δοθεί αρχείο, κρατά τους δρόμους που έχει ήδη το map-data.js.
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const ROOT = path.join(__dirname, '..', 'data', 'traffic'), DAY = '2026-11-03', NB = 288;
const BOX = { s: 37.955, w: 23.675, n: 38.03, e: 23.81 };
const OUT = path.join(__dirname, '..', 'app', 'map-data.js');

// μεταδεδομένα σταθμών: το πιο πρόσφατο αρχείο stations
let metaFile = null;
(function find(dir) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) find(p); else if (/_stations\.jsonl\.gz$/.test(e.name) && (!metaFile || e.name > path.basename(metaFile))) metaFile = p; } })(path.join(ROOT, 'stations'));
const dets = {};
zlib.gunzipSync(fs.readFileSync(metaFile)).toString('utf8').split('\n').filter(Boolean).forEach(l => {
  const r = JSON.parse(l);
  if (dets[r.id] || !(r.latitude > BOX.s && r.latitude < BOX.n && r.longitude > BOX.w && r.longitude < BOX.e)) return;
  dets[r.id] = { id: r.id, lat: +r.latitude.toFixed(5), lon: +r.longitude.toFixed(5), odos: r.odos, thesi: r.perigrafi_thesis, sf: new Array(NB).fill(0), nf: new Array(NB).fill(0), sv: new Array(NB).fill(0), nv: new Array(NB).fill(0) };
});
// μετρήσεις: ώρα Ελλάδας = UTC+2 (χειμερινή) στις 3/11
for (const f of ['2026-11-02', '2026-11-03']) {
  zlib.gunzipSync(fs.readFileSync(path.join(ROOT, f + '.csv.gz'))).toString('utf8').split('\n').forEach(l => {
    const r = l.trim().split(','); if (r.length < 6 || r[1] !== 'all' || !dets[r[0]] || r[3] === '') return;
    const t = new Date(Date.parse(r[2]) + 2 * 3600e3), iso = t.toISOString(); if (iso.slice(0, 10) !== DAY) return;
    const b = Math.floor((t.getUTCHours() * 60 + t.getUTCMinutes()) / 5), d = dets[r[0]];
    d.sf[b] += +r[3]; d.nf[b]++;
    if (r[5] !== '' && +r[5] > 0) { d.sv[b] += +r[5]; d.nv[b]++; }
  });
}
function fill(sum, n) {          // μέση τιμή ανά 5λεπτο, κενά με γραμμική παρεμβολή
  const idx = []; for (let b = 0; b < NB; b++) if (n[b]) idx.push(b);
  if (idx.length < NB / 4) return null;
  const v = b => sum[b] / n[b], out = [];
  for (let b = 0; b < NB; b++) {
    if (n[b]) { out.push(Math.round(v(b))); continue; }
    let lo = -1, hi = -1; for (const k of idx) { if (k < b) lo = k; else if (k > b && hi < 0) hi = k; }
    out.push(Math.round(lo < 0 ? v(hi) : hi < 0 ? v(lo) : v(lo) + (v(hi) - v(lo)) * (b - lo) / (hi - lo)));
  }
  return out;
}
const list = [];
for (const id in dets) {
  const d = dets[id], f = fill(d.sf, d.nf), v = fill(d.sv, d.nv); if (!f || !v) continue;
  const s = v.slice().sort((a, b) => a - b), ff = s[Math.floor(s.length * 0.85)];     // «ελεύθερη» ταχύτητα: 85ο εκατοστημόριο της ημέρας
  if (ff < 8) continue;
  list.push({ id, lat: d.lat, lon: d.lon, odos: d.odos, thesi: d.thesi, ff, f, v });
}

let roads = [];
if (process.argv[2]) {
  const W = { motorway: 4, trunk: 4, primary: 3, secondary: 2, tertiary: 1 };
  JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).elements.forEach(e => {
    if (e.type !== 'way' || !e.geometry || !W[e.tags.highway]) return;
    const pts = []; let last = null;
    e.geometry.forEach(p => { const q = [+p.lon.toFixed(5), +p.lat.toFixed(5)]; if (!last || Math.abs(q[0] - last[0]) + Math.abs(q[1] - last[1]) > 0.00012) { pts.push(q); last = q; } });
    const end = e.geometry[e.geometry.length - 1], q = [+end.lon.toFixed(5), +end.lat.toFixed(5)]; if (pts[pts.length - 1][0] !== q[0] || pts[pts.length - 1][1] !== q[1]) pts.push(q);
    if (pts.length > 1) roads.push({ c: W[e.tags.highway], n: e.tags.name || '', p: pts });
  });
} else if (fs.existsSync(OUT)) {
  const w = {}; require('vm').runInNewContext(fs.readFileSync(OUT, 'utf8'), { window: w }); roads = w.MAP.roads || [];
}
fs.writeFileSync(OUT, '// Παράγεται από το build_map.js. Δρόμοι: © OpenStreetMap contributors (ODbL). Μετρήσεις: Περιφέρεια Αττικής, ανοιχτά δεδομένα.\nwindow.MAP = ' +
  JSON.stringify({ day: DAY, box: BOX, dets: list, roads }) + ';\n');
console.log('ανιχνευτές με δεδομένα:', list.length, 'από', Object.keys(dets).length, '· δρόμοι:', roads.length, '·', (fs.statSync(OUT).size / 1e6).toFixed(2), 'MB');
