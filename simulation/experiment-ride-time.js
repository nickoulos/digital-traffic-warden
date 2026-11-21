// Ποια ώρα της Τρίτης 3/11/2026 δείχνουμε στο ride.html; Αυτή με το μεγαλύτερο πρόβλημα στην κυκλοφορία.
// Δύο μέτρα ανά 15 λεπτά:
//   1. μετρημένο: μερίδιο των ανιχνευτών της περιοχής που φαίνεται στο ride.html με ταχύτητα κάτω από 45% (κόκκινο)
//      ή κάτω από 70% (κόκκινο + κίτρινο) της ελεύθερης ροής·
//   2. προσομοίωση: μέσος αριθμός σταματημένων οχημάτων στα 20 φανάρια με το ρολόι και με τον Ψηφιακό Τροχονόμο.
//   node experiment-ride-time.js   → knowledge-base/results/experiment-ride-time.md
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = {}; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data.js', 'sim-core.js', 'map-data.js', 'corridor-data.js', 'sofias-data.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app', f), 'utf8'), ctx);
const { DATA, SimCore, MAP, CORRIDOR, SOFIAS } = ctx;
DATA.sites = DATA.sites.filter(s => s.id === 'alex');
[CORRIDOR, SOFIAS].forEach(X => { DATA.sites.push(X.site); for (const d in X.detectors) DATA.detectors[d] = X.detectors[d]; });
const AX = [['kifx', 'optimal'], ['alex', 'adaptive'], ['sofias', 'adaptive']];   // όπως στο demo.html / ride.html, ανιχνευτής σε κάθε κάθετη
const T0 = 6 * 3600, T1 = 22 * 3600, B = 900;
const sims = AX.map(([id, c]) => ({ id, clock: SimCore.createSim(DATA, id, '2026-11-03', T0, T1, { seed: 7, blind: 0 }, 'fixed', null), ours: SimCore.createSim(DATA, id, '2026-11-03', T0, T1, { seed: 7, blind: 0 }, c, null) }));
const dets = MAP.dets.filter(d => d.lat > 37.970 && d.lat < 37.998 && d.lon > 23.730 && d.lon < 23.775);
const bins = {};
for (let t = T0; t < T1; t++) {
  const b = Math.floor(t / B); const x = bins[b] = bins[b] || { qc: 0, qo: 0, n: 0 };
  sims.forEach(s => { s.clock.step(); s.ours.step(); });
  sims.forEach(s => { for (let a = 0; a < s.clock.net.apps.length; a++) { x.qc += s.clock.qlen(a); x.qo += s.ours.qlen(a); } });
  x.n++;
}
const rows = Object.keys(bins).map(Number).sort((a, b) => a - b).map(b => {
  const s0 = b * B / 300, x = bins[b]; let red = 0, amb = 0, n = 0;
  for (const d of dets) for (let s = s0; s < s0 + 3; s++) { const v = d.v[s]; if (v == null || !d.ff) continue; n++; const r = v / d.ff; if (r < 0.45) red++; else if (r < 0.7) amb++; }
  const h = Math.floor(b * B / 3600), m = (b * B % 3600) / 60;
  return { t: String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'), red: 100 * red / n, ra: 100 * (red + amb) / n, qc: x.qc / x.n, qo: x.qo / x.n };
});
const top = (k, n) => rows.slice().sort((a, b) => b[k] - a[k]).slice(0, n).map(r => r.t).join(', ');
const out = [
  '# Ποια ώρα δείχνουμε στο ride.html',
  '',
  'Τρίτη 3/11/2026. Μετρημένο: ' + dets.length + ' ανιχνευτές της Περιφέρειας μέσα στην περιοχή που φαίνεται από ψηλά, ταχύτητα / ταχύτητα ελεύθερης ροής, ανά 5 λεπτά. Προσομοίωση: οι τρεις άξονες του ride.html (20 φανάρια, ανιχνευτής σε κάθε κάθετη, σπόρος 7), μέσος αριθμός σταματημένων οχημάτων ανά 15λεπτο.',
  '',
  '**Συμπέρασμα:** **08:00 έως 08:15** είναι η καλύτερη αρχή. Εκεί συμπίπτουν τρία πράγματα. Η πόλη είναι από τις πιο φορτωμένες στιγμές της μέρας: ' + rows.find(r => r.t === '08:00').ra.toFixed(0) + '% των ανιχνευτών σε κόκκινο ή κίτρινο. Οι ουρές στους τρεις άξονες με το ρολόι είναι από τις μεγαλύτερες. Η διαφορά με τον Ψηφιακό Τροχονόμο είναι από τις μεγαλύτερες. Στις 08:30, όπου η μέτρηση κορυφώνεται, η διαφορά στην προσομοίωση είναι μικρή.',
  '',
  '- Περισσότερο κόκκινο στη μέτρηση: ' + top('red', 4) + '.',
  '- Περισσότερο κόκκινο και κίτρινο: ' + top('ra', 4) + '.',
  '- Περισσότερα σταματημένα οχήματα με το ρολόι: ' + top('qc', 4) + '.',
  '',
  '| Ώρα | Κόκκινο | Κόκκινο + κίτρινο | Σταματημένα, ρολόι | Σταματημένα, Τροχονόμος | Διαφορά |',
  '|---|---:|---:|---:|---:|---:|'
].concat(rows.map(r => '| ' + r.t + ' | ' + r.red.toFixed(0) + '% | ' + r.ra.toFixed(0) + '% | ' + r.qc.toFixed(0) + ' | ' + r.qo.toFixed(0) + ' | ' + (r.qc - r.qo).toFixed(0) + ' |'))
  .concat(['', 'Προσομοίωση με μία εκτέλεση (σπόρος 7). Οι τιμές μετά τις 21:15 επηρεάζονται από το τέλος της εκτέλεσης στις 22:00. Το μετρημένο χρώμα είναι πραγματικό, οι ουρές είναι προσομοίωση.', '']).join('\n');
fs.writeFileSync(path.join(__dirname, '..', 'knowledge-base', 'results', 'experiment-ride-time.md'), out);
console.log(out.split('\n').slice(4, 10).join('\n'));
