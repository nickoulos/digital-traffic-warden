// Οι αριθμοί που δείχνει το ride.html για τη Λ. Βασ. Σοφίας, Τρίτη 3/11/2026, 08:00–09:00, προς Αμπελόκηπους
// (η κατεύθυνση του αυτοκινήτου που ακολουθεί η κάμερα).
//   Μέτρηση (ανιχνευτές της Περιφέρειας, ακατέργαστα δείγματα ανά 90 s):
//     · αυτοκίνητα: μέση ροή του ανιχνευτή στο φανάρι της Κουμπάρη (MS391) × 1 ώρα·
//     · χρόνος διαδρομής από Ακαδημίας ως Αλεξάνδρας: άθροισμα μήκος τμήματος / ταχύτητα του ανιχνευτή του τμήματος
//       (αρμονικός μέσος της ώρας)· χωρίς κίνηση: ίδιο άθροισμα με τη διάμεση ταχύτητα 01:00–05:00·
//     · χαμένος χρόνος = διαφορά των δύο· μαζί = × αυτοκίνητα.
//   Με τον Ψηφιακό Τροχονόμο (προσομοίωση, όπως στο ride.html): πόσο λιγότερο περιμένει κάθε αυτοκίνητο στα φανάρια
//   της διαδρομής από το Ακαδημίας ως την Αλεξάνδρας, ρολόι → Τροχονόμος, μέσος όρος 10 σπόρων. Αφαιρείται από τον μετρημένο χρόνο.
//   node experiment-ride-numbers.js   → ride-numbers.js (για το ride.html) και knowledge-base/results/experiment-ride-numbers.md
const fs = require('fs'), path = require('path'), vm = require('vm'), zlib = require('zlib');
const ctx = {}; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data.js', 'sim-core.js', 'corridor-data.js', 'sofias-data.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app', f), 'utf8'), ctx);
const { DATA, SimCore, CORRIDOR, SOFIAS } = ctx;
DATA.sites = DATA.sites.filter(s => s.id === 'alex');
[CORRIDOR, SOFIAS].forEach(X => { DATA.sites.push(X.site); for (const d in X.detectors) DATA.detectors[d] = X.detectors[d]; });

const DAY = '2026-11-03', W0 = 8 * 60, W1 = 9 * 60, DIR = 'E', COUNT_DET = 'MS391', UTC_OFF = 2;   // Νοέμβριος: ώρα Ελλάδας = UTC+2
const apps = [];
SOFIAS.site.junctions.forEach(j => j.approaches.forEach(a => { if (a.dir === DIR && a.phase === 0) apps.push({ id: a.id, j: j.name, L: a.upDist || 0, det: a.det || a.assume[0], own: !!a.det }); }));
const segs = apps.filter(a => a.L > 0);

// ---- μέτρηση ----
const want = new Set(segs.map(s => s.det).concat([COUNT_DET])), S = {};
zlib.gunzipSync(fs.readFileSync(path.join(__dirname, '..', 'data', 'traffic', DAY + '.csv.gz'))).toString('utf8').split('\n').forEach(l => {
  const p = l.split(','); if (!want.has(p[0]) || p[1] !== 'all' || p[3] === '' || p[5] === '') return;
  const t = new Date(p[2]), m = ((t.getUTCHours() + UTC_OFF) % 24) * 60 + t.getUTCMinutes() + t.getUTCSeconds() / 60;
  (S[p[0]] = S[p[0]] || []).push({ m, c: +p[3], s: +p[5] });
});
const inWin = (id, a, b) => (S[id] || []).filter(x => x.m >= a && x.m < b);
const hmean = L => { const v = L.filter(x => x.s > 0); return v.length / v.reduce((s, x) => s + 1 / x.s, 0); };
const median = a => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const cnt = inWin(COUNT_DET, W0, W1), cars = Math.round(cnt.reduce((s, x) => s + x.c, 0) / cnt.length * (W1 - W0) / 60);
let len = 0, tt = 0, tff = 0;
const segRows = segs.map(sg => {
  const v = hmean(inWin(sg.det, W0, W1)), ff = median(inWin(sg.det, 60, 300).filter(x => x.s > 0).map(x => x.s));
  len += sg.L; tt += sg.L / (v / 3.6); tff += sg.L / (ff / 3.6);
  return { id: sg.id, j: sg.j, L: sg.L, det: sg.det, own: sg.own, v, ff };
});
const lostMeas = tt - tff;

// ---- προσομοίωση: αναμονή στα φανάρια της ίδιας διαδρομής ----
const ids = segs.map(s => s.id), SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const waitOf = (ctrl, seed) => {
  const sim = SimCore.createSim(DATA, 'sofias', DAY, W0 * 60 - 1800, W1 * 60 + 60, { seed, blind: 0 }, ctrl, null);
  while (sim.t < W0 * 60) sim.step();
  const p0 = sim.summary().per; while (sim.t < W1 * 60) sim.step(); const p1 = sim.summary().per;
  let w = 0, served = 0;
  p1.forEach((p, i) => { if (!ids.includes(p.id)) return; const q0 = p0[i], dq = p.delay * p.arrived - q0.delay * q0.arrived, da = p.arrived - q0.arrived; w += da ? dq / da : 0; if (p.id === 'ko_E') served = p.served - q0.served; });
  return { w, served };
};
const runs = SEEDS.map(seed => ({ seed, clock: waitOf('fixed', seed), ours: waitOf('adaptive', seed) }));
const avg = f => runs.reduce((s, r) => s + f(r), 0) / runs.length;
const waitClock = avg(r => r.clock.w), waitOurs = avg(r => r.ours.w), saved = waitClock - waitOurs;
const simCars = avg(r => r.clock.served);
// το ride.html τρέχει τον σπόρο που δίνει στο φανάρι της Κουμπάρη όσα αυτοκίνητα μετρήθηκαν: όσα βλέπουμε στον δρόμο είναι όσα πέρασαν
const pick = runs.slice().sort((a, b) => Math.abs(a.clock.served - cars) - Math.abs(b.clock.served - cars))[0];

const ttOurs = tt - saved, lostOurs = Math.max(0, lostMeas - saved);
const R = {
  day: DAY, from: '08:00', to: '09:00', app: apps.find(a => a.det === COUNT_DET && a.own).id, cars, seed: pick.seed, km: len / 1000,
  meas: { min: tt / 60, kmh: len / tt * 3.6, lostMin: lostMeas / 60, freeMin: tff / 60, hours: cars * lostMeas / 3600 },
  ours: { min: ttOurs / 60, kmh: len / ttOurs * 3.6, lostMin: lostOurs / 60, hours: cars * lostOurs / 3600 },
  sim: { waitClockS: waitClock, waitOursS: waitOurs, savedS: saved, carsAtKo: simCars, carsAtKoSeed: pick.clock.served }
};
const r1 = x => Math.round(x * 10) / 10;
fs.writeFileSync(path.join(__dirname, '..', 'app', 'ride-numbers.js'), '// Παράγεται από το experiment-ride-numbers.js. Μην αλλάζετε με το χέρι.\nwindow.RIDENUM = ' + JSON.stringify(R, (k, v) => typeof v === 'number' ? Math.round(v * 100) / 100 : v) + ';\n');

const out = [
  '# Οι αριθμοί του ride.html',
  '',
  'Λ. Βασ. Σοφίας, Τρίτη 3/11/2026, ' + R.from + '–' + R.to + ', προς Αμπελόκηπους (η κατεύθυνση του αυτοκινήτου της κάμερας). `node experiment-ride-numbers.js`.',
  '',
  '## Τι μετρήθηκε',
  '',
  '- **' + cars + ' αυτοκίνητα** πέρασαν από το φανάρι της Κουμπάρη (ανιχνευτής ' + COUNT_DET + ', μέση ροή ' + cnt.length + ' δειγμάτων των 90 s).',
  '- Η διαδρομή Ακαδημίας → Αλεξάνδρας (' + r1(len / 1000) + ' km, ' + segs.length + ' τμήματα) κράτησε περίπου **' + r1(tt / 60) + ' λεπτά**, μέση ταχύτητα ' + r1(len / tt * 3.6) + ' km/h.',
  '- Χωρίς κίνηση (διάμεση ταχύτητα 01:00–05:00 στους ίδιους ανιχνευτές): ' + r1(tff / 60) + ' λεπτά.',
  '- Χαμένος χρόνος: **' + r1(lostMeas / 60) + ' λεπτά ανά αυτοκίνητο**, **' + Math.round(R.meas.hours) + ' ώρες** για τα ' + cars + ' αυτοκίνητα μέσα σε μία ώρα.',
  '',
  '| τμήμα ως | m | ανιχνευτής | km/h ' + R.from + '–' + R.to + ' | km/h νύχτα |', '|---|---:|---|---:|---:|',
  ...segRows.map(s => '| ' + s.j + ' | ' + s.L + ' | ' + s.det + (s.own ? '' : ' (γειτονικού τμήματος)') + ' | ' + r1(s.v) + ' | ' + s.ff + ' |'),
  '',
  'Η ταχύτητα σε κάθε τμήμα είναι η ταχύτητα σημείου του ανιχνευτή του, όχι μετρημένος χρόνος διαδρομής. Είναι εκτίμηση, όχι παρακολούθηση οχημάτων.',
  '',
  '## Με τον Ψηφιακό Τροχονόμο (προσομοίωση)',
  '',
  '- Αναμονή στα ' + segs.length + ' φανάρια της διαδρομής, ανά αυτοκίνητο, ' + R.from + '–' + R.to + ', μέσος όρος ' + SEEDS.length + ' σπόρων: ρολόι **' + Math.round(waitClock) + ' s**, Τροχονόμος **' + Math.round(waitOurs) + ' s**, κέρδος **' + Math.round(saved) + ' s**.',
  '- Αφαιρείται από τον μετρημένο χρόνο: διαδρομή **' + r1(tt / 60) + ' → ' + r1(ttOurs / 60) + ' λεπτά**, ' + r1(len / tt * 3.6) + ' → ' + r1(len / ttOurs * 3.6) + ' km/h, χαμένος χρόνος ' + r1(lostMeas / 60) + ' → ' + r1(lostOurs / 60) + ' λεπτά ανά αυτοκίνητο, ' + Math.round(R.meas.hours) + ' → ' + Math.round(R.ours.hours) + ' ώρες συνολικά.',
  '- Τα αυτοκίνητα είναι τα ίδια: η προσομοίωση παίρνει τη ροή από τους ίδιους ανιχνευτές. Στο φανάρι της Κουμπάρη περνούν ' + Math.round(simCars) + ' την ώρα κατά μέσο όρο. Το ride.html τρέχει τον σπόρο ' + pick.seed + ', που δίνει ' + pick.clock.served + ', έναντι ' + cars + ' μετρημένων.',
  '',
  'Το «ρολόι» είναι σταθερό πρόγραμμα δικού μας σχεδιασμού, όχι το πρόγραμμα που ισχύει σήμερα. Η διαφορά ρολογιού και Τροχονόμου είναι αποτέλεσμα προσομοίωσης.',
  '',
  '| σπόρος | αναμονή ρολόι (s) | αναμονή Τροχονόμος (s) | αυτοκίνητα στην Κουμπάρη |', '|---:|---:|---:|---:|',
  ...runs.map(r => '| ' + r.seed + ' | ' + Math.round(r.clock.w) + ' | ' + Math.round(r.ours.w) + ' | ' + r.clock.served + ' |'),
  ''
];
fs.writeFileSync(path.join(__dirname, '..', 'knowledge-base', 'results', 'experiment-ride-numbers.md'), out.join('\n'));
console.log(JSON.stringify(R, null, 1));
