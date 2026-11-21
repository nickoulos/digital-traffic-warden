// experiment-neighbours.js — ΠΕΙΡΑΜΑ: τι παθαίνει το ΓΕΙΤΟΝΙΚΟ φανάρι όταν αλλάζουμε τους χρόνους στην Κηφισίας × Πανόρμου.
//   node experiment-neighbours.js run <seedFrom> <seedTo>     → ../knowledge-base/results/raw/neighbours/run-<from>.json
//   node experiment-neighbours.js report                      → ../knowledge-base/results/experiment-neighbours.md
//   node experiment-neighbours.js export                      → corridor-data.js (ο άξονας για το control.html)
// Στο κύριο demo η Κηφισίας × Πανόρμου είναι απομονωμένη: όσα οχήματα περνούν το φανάρι βγαίνουν από το μοντέλο. Εδώ η Λ. Κηφισίας
// γίνεται άξονας τριών κόμβων, στις θέσεις των σηματοδοτών του OpenStreetMap: Πανόρμου, Λαρίσης (200 m προς το κέντρο) και Αρκαδίας
// (320 m πιο κάτω· οι σηματοδότες στα 490 και 560 m από την Πανόρμου ενώνονται σε έναν κόμβο). Τα οχήματα που φεύγουν από τον έναν
// φτάνουν στον επόμενο μετά τον χρόνο διαδρομής, και αν ο σύνδεσμος γεμίσει ο ανάντη κόμβος μπλοκάρει.
// ΠΡΑΓΜΑΤΙΚΑ: οι θέσεις των φαναριών (OpenStreetMap)· οι ροές στην Κηφισίας (MS261 πριν από την Πανόρμου και MS259 πριν από την Αρκαδίας
//            προς κέντρο· MS258 και MS260 προς Κηφισιά· MS503 αμέσως μετά την Πανόρμου προς κέντρο) και στην Πανόρμου (MS262).
// ΠΑΡΑΔΟΧΕΣ: δύο φάσεις ανά κόμβο χωρίς στροφές· η κίνηση της Αρκαδίας (60% της Πανόρμου)· η κίνηση της Λαρίσης στην Κηφισίας (ίση με
//            του ανιχνευτή MS472, που είναι στο άλλο άκρο της οδού)· οι λωρίδες· και ότι το σταθερό πρόγραμμα του άξονα είναι
//            συντονισμένο (κοινός κύκλος, πράσινο κύμα) — δικός μας σχεδιασμός, όχι το ισχύον.
// Κάθε αριθμός είναι ΠΡΟΣΟΜΟΙΩΣΗ. Έλεγχος ορίων ασφαλείας σε κάθε δευτερόλεπτο.
const fs = require('fs'), path = require('path'), vm = require('vm'), zlib = require('zlib');
const ctx = { window: {}, module: { exports: {} }, Math, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app', 'data.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app', 'sim-core.js'), 'utf8'), ctx);
const DATA = ctx.window.DATA, Sim = ctx.module.exports, DAY = '2026-11-03', NB = 288;
const OUT = path.join(__dirname, '..', 'knowledge-base', 'results', 'raw', 'neighbours');

// προφίλ ροής για τους δύο ανιχνευτές που δεν υπάρχουν στο data.js (ίδια μέθοδος με το build_data.py: μέση τιμή 5λέπτου, διάμεσος εργάσιμων)
function addDetectors(ids) {
  const dates = DATA.wkDates.slice(); if (dates.indexOf(DAY) < 0) dates.push(DAY);
  const raw = {}; ids.forEach(id => { raw[id] = {}; });
  const files = new Set(); dates.forEach(d => { files.add(d); files.add(new Date(Date.parse(d + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10)); });
  files.forEach(f => {
    const p = path.join(__dirname, '..', 'data', 'traffic', f + '.csv.gz'); if (!fs.existsSync(p)) return;
    zlib.gunzipSync(fs.readFileSync(p)).toString('utf8').split('\n').forEach(l => {
      const r = l.split(','); if (r.length < 6 || r[1] !== 'all' || !raw[r[0]] || r[3] === '') return;
      const t = new Date(Date.parse(r[2]) + 2 * 3600e3), date = t.toISOString().slice(0, 10), b = Math.floor((t.getUTCHours() * 60 + t.getUTCMinutes()) / 5);   // UTC+2: όλες οι μέρες είναι μετά τις 25/10
      const day = raw[r[0]][date] || (raw[r[0]][date] = { s: new Array(NB).fill(0), n: new Array(NB).fill(0) });
      day.s[b] += +r[3]; day.n[b]++;
    });
  });
  const fill = a => { const idx = a.map((v, i) => v == null ? -1 : i).filter(i => i >= 0); return a.map((v, i) => { if (v != null) return v; let lo = -1, hi = -1; for (const k of idx) { if (k < i) lo = k; else if (hi < 0) hi = k; } return lo < 0 ? a[hi] : hi < 0 ? a[lo] : a[lo] + (a[hi] - a[lo]) * (i - lo) / (hi - lo); }); };
  ids.forEach(id => {
    const ser = d => { const x = raw[id][d]; return x ? x.s.map((v, i) => x.n[i] ? v / x.n[i] : null) : new Array(NB).fill(null); };
    const per = DATA.wkDates.map(ser), medv = []; for (let b = 0; b < NB; b++) { const v = per.map(p => p[b]).filter(x => x != null).sort((x, y) => x - y); medv.push(v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null); }
    DATA.detectors[id] = { prof: { wk: { f: fill(medv) }, [DAY]: { f: fill(ser(DAY)) } } };
  });
}
const EXTRA = ['MS258', 'MS259', 'MS503', 'MS472'];
addDetectors(EXTRA);
DATA.sites.push({ id: 'kifx', short: 'Λ. Κηφισίας (Αρκαδίας, Λαρίσης, Πανόρμου)', mainName: 'Λ. Κηφισίας', junctions: [
  { id: 'ar', name: 'Λ. Κηφισίας × Αρκαδίας', lat: 37.98900, lon: 23.76400, approaches: [
    { id: 'ar_E', dir: 'E', phase: 0, det: 'MS258', lanes: 2, assume: null, up: null, label: 'Λ. Κηφισίας → Κηφισιά' },
    { id: 'ar_W', dir: 'W', phase: 0, det: 'MS259', lanes: 3, assume: null, up: 'la_W', upDist: 320, label: 'Λ. Κηφισίας → κέντρο' },
    { id: 'ar_S', dir: 'S', phase: 1, det: null, lanes: 1, assume: ['MS262', 0.6], up: null, label: 'Αρκαδίας (κάθετη, παραδοχή)' }] },
  { id: 'la', name: 'Λ. Κηφισίας × Λαρίσης', lat: 37.99145, lon: 23.76600, approaches: [
    { id: 'la_E', dir: 'E', phase: 0, det: null, lanes: 2, assume: ['MS260', 1], up: 'ar_E', upDist: 320, label: 'Λ. Κηφισίας → Κηφισιά' },
    { id: 'la_W', dir: 'W', phase: 0, det: 'MS503', lanes: 3, assume: null, up: 'kp_W', upDist: 200, label: 'Λ. Κηφισίας → κέντρο' },
    { id: 'la_S', dir: 'S', phase: 1, det: null, lanes: 1, assume: ['MS472', 1], up: null, label: 'Λαρίσης (κάθετη, παραδοχή)' }] },
  { id: 'kp', name: 'Λ. Κηφισίας × Πανόρμου', lat: 37.993083, lon: 23.766832, approaches: [
    { id: 'kp_E', dir: 'E', phase: 0, det: 'MS260', lanes: 2, assume: null, up: 'la_E', upDist: 200, label: 'Λ. Κηφισίας → Κηφισιά' },
    { id: 'kp_W', dir: 'W', phase: 0, det: 'MS261', lanes: 3, assume: null, up: null, label: 'Λ. Κηφισίας → κέντρο' },
    { id: 'kp_S', dir: 'S', phase: 1, det: 'MS262', lanes: 1, assume: null, up: null, label: 'Πανόρμου → Λ. Κηφισίας' }] }] });

function mkSafety(sim) {
  const P = sim.P, minG = [P.minGreenMain, P.minGreenSide], bad = [];
  const J = sim.net.juncs.map(() => ({ g: -2, len: 0, inter: 0, last: -1, greens: 0, redSince: [sim.t0, sim.t0] }));
  return { bad, tick() {
    const t = sim.t - 1;
    sim.sig.forEach((S, j) => {
      const s = J[j], g = S.g;
      if (g !== s.g) {
        if (s.g >= 0) { if (s.greens > 1 && s.len < minG[s.g]) bad.push('j' + j + ' t=' + t + ' πράσινο ' + s.len); s.last = s.g; s.redSince[s.g] = t; s.inter = 0; }
        if (g >= 0) { if (s.last >= 0 && s.last !== g && s.inter < P.lost) bad.push('j' + j + ' t=' + t + ' ενδιάμεσος ' + s.inter); s.len = 0; s.greens++; }
        s.g = g;
      }
      if (g >= 0) s.len++; else s.inter++;
      if (sim.ctrl !== 'fixed' && sim.mode(j) === 'adaptive') for (let p = 0; p < 2; p++) if (g !== p && t - s.redSince[p] > P.maxRed) { bad.push('j' + j + ' t=' + t + ' κόκκινο'); s.redSince[p] = t; }
    });
  } };
}
// Σενάρια. only: 'kp' = ελέγχεται μόνο η Πανόρμου, οι γείτονες μένουν στο ρολόι τους (η περίπτωση του pitch). 'all' = ελέγχονται όλοι.
const SCEN = [
  { key: 'fixed', name: 'Ρολόι σε όλους (συντονισμένο)', ctrl: 'fixed', only: 'all' },
  { key: 'opt-kp', name: 'Βελτιστοποίηση ανά κόμβο στην Πανόρμου, ρολόι στους γείτονες', ctrl: 'optimal', only: 'kp' },
  { key: 'rules-kp', name: 'Απλοί κανόνες στην Πανόρμου, ρολόι στους γείτονες', ctrl: 'adaptive', only: 'kp' },
  { key: 'coord-kp', name: 'Συντονισμένος Τροχονόμος στην Πανόρμου, ρολόι στους γείτονες', ctrl: 'coord', only: 'kp' },
  { key: 'opt-all', name: 'Βελτιστοποίηση ανά κόμβο σε όλους', ctrl: 'optimal', only: 'all' },
  { key: 'rules-all', name: 'Απλοί κανόνες σε όλους', ctrl: 'adaptive', only: 'all' },
  { key: 'coord-all', name: 'Συντονισμένος Τροχονόμος σε όλους', ctrl: 'coord', only: 'all' },
  { key: 'netplan-all', name: 'Κοινό πρόγραμμα δικτύου σε όλους', ctrl: 'netplan', only: 'all' }
];
function one(seed, sc) {
  const sim = Sim.createSim(DATA, 'kifx', DAY, 0, 86400, { seed, blind: sc.only === 'kp' ? 1 : 0 }, sc.ctrl, null), safe = mkSafety(sim);
  while (!sim.done) { sim.step(); safe.tick(); }
  const s = sim.summary(), g = { ar: [0, 0], la: [0, 0], kp: [0, 0], main: [0, 0], side: [0, 0] };
  s.per.forEach((p, i) => { const A = sim.net.apps[i], w = p.delay * p.arrived, k = sim.net.juncs[A.j].id; g[k][0] += w; g[k][1] += p.arrived; const m = A.phase === 0 ? 'main' : 'side'; g[m][0] += w; g[m][1] += p.arrived; });
  return { h: s.delayH, ar: g.ar[0] / g.ar[1], la: g.la[0] / g.la[1], kp: g.kp[0] / g.kp[1], arH: g.ar[0] / 3600, laH: g.la[0] / 3600, kpH: g.kp[0] / 3600, main: g.main[0] / g.main[1], side: g.side[0] / g.side[1], stops: s.stopsPct, spill: s.spill, safety: safe.bad.length + (s.conserved ? 0 : 1), maxRed: s.maxRed };
}
function run(a, b) {
  const rows = [];
  for (let seed = a; seed <= b; seed++) {
    const r = { seed }; SCEN.forEach(sc => { r[sc.key] = one(seed, sc); });
    // αναφορά: η Πανόρμου απομονωμένη, όπως στο κύριο demo
    const iso = c => { const sim = Sim.createSim(DATA, 'kif', DAY, 0, 86400, { seed }, c, null).run(); return sim.summary().delayH; };
    r.isoFixed = iso('fixed'); r.isoOpt = iso('optimal');
    rows.push(r);
  }
  fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'run-' + a + '.json'), JSON.stringify(rows) + '\n');
}
function report() {
  let rows = []; fs.readdirSync(OUT).filter(f => /^run-\d+\.json$/.test(f)).forEach(f => { rows = rows.concat(JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'))); });
  const med = xs => { const s = xs.slice().sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
  const pc = x => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(1).replace('.', ',') + '%', f1 = x => x.toFixed(1).replace('.', ',');
  const d = (k, f) => med(rows.map(r => 100 * (f(r[k]) - f(r.fixed)) / f(r.fixed)));
  let md = '# Πείραμα: τι παθαίνει το γειτονικό φανάρι — ΠΡΟΣΟΜΟΙΩΣΗ\n\nΠαράγεται από `simulation/experiment-neighbours.js`. Τρίτη 3/11/2026, όλη η μέρα, ' + rows.length + ' σπόροι. ' +
    'Η Λ. Κηφισίας ως άξονας τριών κόμβων, στις θέσεις των σηματοδοτών του OpenStreetMap: Πανόρμου, Λαρίσης (200 m προς το κέντρο) και Αρκαδίας (320 m πιο κάτω). Δ = μεταβολή έναντι συντονισμένου σταθερού προγράμματος σε όλους τους κόμβους (διάμεσος).\n\n' +
    '**Πραγματικά:** οι θέσεις των φαναριών, οι ροές της Κηφισίας και της Πανόρμου. **Παραδοχές:** δύο φάσεις ανά κόμβο χωρίς στροφές, η κίνηση της Αρκαδίας (60% της Πανόρμου) και της Λαρίσης (ίση με του ανιχνευτή της στο άλλο άκρο της οδού), οι λωρίδες, και ότι το σταθερό πρόγραμμα είναι συντονισμένο (δικός μας σχεδιασμός, όχι το ισχύον).\n\n' +
    '| Σενάριο | Δ όλου του άξονα | Δ Πανόρμου | Δ Λαρίσης (γείτονας) | Δ Αρκαδίας (γείτονας) | Ώρες/ημέρα που γλιτώνουν | Αναμονή κάθετων (s) | Στάσεις | Καλύτερο από ρολόι | Παραβάσεις ορίων |\n|---|---|---|---|---|---|---|---|---|---|\n';
  SCEN.forEach(sc => {
    const k = sc.key;
    md += '| ' + sc.name + ' | ' + (k === 'fixed' ? '—' : pc(d(k, x => x.h))) + ' | ' + (k === 'fixed' ? f1(med(rows.map(r => r.fixed.kp))) + ' s' : pc(d(k, x => x.kp))) + ' | ' + (k === 'fixed' ? f1(med(rows.map(r => r.fixed.la))) + ' s' : pc(d(k, x => x.la))) + ' | ' + (k === 'fixed' ? f1(med(rows.map(r => r.fixed.ar))) + ' s' : pc(d(k, x => x.ar))) + ' | ' +
      (k === 'fixed' ? '—' : f1(med(rows.map(r => r.fixed.h - r[k].h)))) + ' | ' + f1(med(rows.map(r => r[k].side))) + ' | ' + f1(med(rows.map(r => r[k].stops))) + '% | ' + (k === 'fixed' ? '—' : rows.filter(r => r[k].h < r.fixed.h).length + '/' + rows.length) + ' | ' + rows.reduce((s, r) => s + r[k].safety, 0) + ' |\n';
  });
  md += '\n**Για σύγκριση, η Πανόρμου απομονωμένη (όπως στο κύριο demo):** ' + pc(med(rows.map(r => 100 * (r.isoOpt - r.isoFixed) / r.isoFixed))) + ', ' + f1(med(rows.map(r => r.isoFixed - r.isoOpt))) + ' ώρες/ημέρα. ' +
    'Στον άξονα, με ρολόι σε όλους, η Πανόρμου έχει ' + f1(med(rows.map(r => r.fixed.kpH))) + ' οχηματοώρες αναμονής τη μέρα, η Λαρίσης ' + f1(med(rows.map(r => r.fixed.laH))) + ' και η Αρκαδίας ' + f1(med(rows.map(r => r.fixed.arH))) + '.\n';
  fs.writeFileSync(path.join(__dirname, '..', 'knowledge-base', 'results', 'experiment-neighbours.md'), md); console.log(md);
}
if (process.argv[2] === 'export') {   // ο άξονας και τα δύο προφίλ για το κέντρο ελέγχου (control.html)
  const site = DATA.sites[DATA.sites.length - 1], det = {}; EXTRA.forEach(id => { det[id] = { prof: { wk: { f: DATA.detectors[id].prof.wk.f.map(Math.round) }, [DAY]: { f: DATA.detectors[id].prof[DAY].f.map(Math.round) } } }; });
  fs.writeFileSync(path.join(__dirname, '..', 'app', 'corridor-data.js'), '// Παράγεται από το experiment-neighbours.js export. Ο άξονας Λ. Κηφισίας (Αρκαδίας, Λαρίσης, Πανόρμου): βλ. παραδοχές στο experiment-neighbours.js.\nwindow.CORRIDOR = ' + JSON.stringify({ site, detectors: det }) + ';\n');
  console.log('corridor-data.js');
} else if (process.argv[2] === 'report') report(); else if (process.argv[2] === 'run') run(+process.argv[3], +process.argv[4]); else console.log('βλ. σχόλια στην αρχή του αρχείου');
