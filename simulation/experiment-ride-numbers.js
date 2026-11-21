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
// Ώρα Ελλάδας: UTC+3 ως τις 25/10/2026 01:00 UTC (λήξη θερινής ώρας), μετά UTC+2.
const DST_END = Date.UTC(2026, 9, 25, 1);
const hmean = L => { const v = L.filter(x => x.s > 0); return v.length / v.reduce((s, x) => s + 1 / x.s, 0); };
const median = a => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
function measure(day) {
  const f = path.join(__dirname, '..', 'data', 'traffic', day + '.csv.gz'); if (!fs.existsSync(f)) return null;
  const want = new Set(segs.map(s => s.det).concat([COUNT_DET])), S = {};
  zlib.gunzipSync(fs.readFileSync(f)).toString('utf8').split('\n').forEach(l => {
    const p = l.split(','); if (!want.has(p[0]) || p[1] !== 'all' || p[3] === '' || p[5] === '') return;
    const t = new Date(p[2]); if (isNaN(t)) return;
    const off = t.getTime() < DST_END ? 3 : 2, m = ((t.getUTCHours() + off) % 24) * 60 + t.getUTCMinutes() + t.getUTCSeconds() / 60;
    (S[p[0]] = S[p[0]] || []).push({ m, c: +p[3], s: +p[5] });
  });
  const inWin = (id, a, b) => (S[id] || []).filter(x => x.m >= a && x.m < b);
  const cnt = inWin(COUNT_DET, W0, W1);
  let len = 0, tt = 0, tff = 0, minCov = 1;
  const rows = segs.map(sg => {
    const L = inWin(sg.det, W0, W1), v = hmean(L), ff = median(inWin(sg.det, 60, 300).filter(x => x.s > 0).map(x => x.s));
    minCov = Math.min(minCov, L.filter(x => x.s > 0).length / ((W1 - W0) / 1.5));
    len += sg.L; tt += sg.L / (v / 3.6); tff += sg.L / (ff / 3.6);
    return { id: sg.id, j: sg.j, L: sg.L, det: sg.det, own: sg.own, v, ff };
  });
  minCov = Math.min(minCov, cnt.length / ((W1 - W0) / 1.5));
  return { day, cars: cnt.length ? Math.round(cnt.reduce((s, x) => s + x.c, 0) / cnt.length * (W1 - W0) / 60) : 0, len, tt, tff, lost: tt - tff, rows, cov: minCov };
}
const M = measure(DAY), cars = M.cars, len = M.len, tt = M.tt, tff = M.tff, segRows = M.rows;
const lostMeas = M.lost;

// ---- όλες οι εργάσιμες που καταγράψαμε: είναι η 3/11 συνηθισμένη μέρα; ----
// Δευτέρα έως Παρασκευή, εκτός από την αργία της 28/10· μόνο μέρες με δείγματα για τουλάχιστον το 80% της ώρας σε κάθε ανιχνευτή.
const HOLIDAYS = ['2026-10-28'], WORKDAYS = 250;
const allDays = fs.readdirSync(path.dirname(path.join(__dirname, '..', 'data', 'traffic', DAY + '.csv.gz'))).map(f => f.slice(0, 10)).filter(d => /^\d{4}-\d\d-\d\d$/.test(d))
  .filter(d => { const w = new Date(d + 'T12:00:00Z').getUTCDay(); return w >= 1 && w <= 5 && !HOLIDAYS.includes(d); });
const days = allDays.map(measure).filter(x => x && x.cov >= 0.8 && isFinite(x.lost));
const dayAvg = k => days.reduce((s, x) => s + x[k], 0) / days.length;
const avgLost = dayAvg('lost'), avgCars = dayAvg('cars');

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
// Αναγωγή στον χρόνο: μέσος όρος των εργάσιμων που καταγράψαμε × 250 εργάσιμες. Με τον Τροχονόμο αφαιρείται κάθε μέρα το ίδιο κέρδος της προσομοίωσης της 3/11 (εκτίμηση).
const avgLostOurs = Math.max(0, avgLost - saved);
const year = { workdays: WORKDAYS, days: days.length, avgLostMin: avgLost / 60, avgCars,
  personH: avgLost * WORKDAYS / 3600, personHOurs: avgLostOurs * WORKDAYS / 3600,
  allH: avgCars * avgLost * WORKDAYS / 3600, allHOurs: avgCars * avgLostOurs * WORKDAYS / 3600 };
// ---- CO₂ στους τρεις άξονες του ride.html (20 φανάρια), 08:00–09:00: ώρες αναμονής στα φανάρια × 1 kg CO₂ την ώρα ρελαντί ----
// Ίδια εκτίμηση με το experiment-impact.js (κάτω άκρο των πηγών, facts.md Δ1–Δ2). Όπως στο ride.html: ανιχνευτής σε κάθε κάθετη.
const AXES = [['kifx', 'optimal'], ['alex', 'adaptive'], ['sofias', 'adaptive']], KG_PER_H = 1;
const waitH = (ctrl, seed) => AXES.reduce((sum, [id, c]) => {
  const sim = SimCore.createSim(DATA, id, DAY, W0 * 60 - 1800, W1 * 60 + 60, { seed, blind: 0 }, ctrl === 'fixed' ? 'fixed' : c, null);
  while (sim.t < W0 * 60) sim.step(); const q0 = sim.summary().qInt; while (sim.t < W1 * 60) sim.step();
  return sum + (sim.summary().qInt - q0) / 3600;
}, 0);
const co2 = SEEDS.map(seed => ({ seed, clock: waitH('fixed', seed) * KG_PER_H, ours: waitH('ours', seed) * KG_PER_H }));
const co2Clock = co2.reduce((s, r) => s + r.clock, 0) / co2.length, co2Ours = co2.reduce((s, r) => s + r.ours, 0) / co2.length;

const R = {
  day: DAY, from: '08:00', to: '09:00', app: apps.find(a => a.det === COUNT_DET && a.own).id, cars, seed: pick.seed, km: len / 1000,
  meas: { min: tt / 60, kmh: len / tt * 3.6, lostMin: lostMeas / 60, freeMin: tff / 60, hours: cars * lostMeas / 3600 },
  ours: { min: ttOurs / 60, kmh: len / ttOurs * 3.6, lostMin: lostOurs / 60, hours: cars * lostOurs / 3600 },
  year,
  co2: { axes: 3, signals: 20, kgPerH: KG_PER_H, clockKg: co2Clock, oursKg: co2Ours },
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
  '- **' + cars + ' αυτοκίνητα** πέρασαν από το φανάρι της Κουμπάρη (ανιχνευτής ' + COUNT_DET + ', μέση ροή των δειγμάτων των 90 s της ώρας).',
  '- Η διαδρομή Ακαδημίας → Αλεξάνδρας (' + r1(len / 1000) + ' km, ' + segs.length + ' τμήματα) κράτησε περίπου **' + r1(tt / 60) + ' λεπτά**, μέση ταχύτητα ' + r1(len / tt * 3.6) + ' km/h.',
  '- Χωρίς κίνηση (διάμεση ταχύτητα 01:00–05:00 στους ίδιους ανιχνευτές): ' + r1(tff / 60) + ' λεπτά.',
  '- Χαμένος χρόνος: **' + r1(lostMeas / 60) + ' λεπτά ανά αυτοκίνητο**, **' + Math.round(R.meas.hours) + ' ώρες** για τα ' + cars + ' αυτοκίνητα μέσα σε μία ώρα.',
  '',
  '| τμήμα ως | m | ανιχνευτής | km/h ' + R.from + '–' + R.to + ' | km/h νύχτα |', '|---|---:|---|---:|---:|',
  ...segRows.map(s => '| ' + s.j + ' | ' + s.L + ' | ' + s.det + (s.own ? '' : ' (γειτονικού τμήματος)') + ' | ' + r1(s.v) + ' | ' + s.ff + ' |'),
  '',
  'Η ταχύτητα σε κάθε τμήμα είναι η ταχύτητα σημείου του ανιχνευτή του, όχι μετρημένος χρόνος διαδρομής. Είναι εκτίμηση, όχι παρακολούθηση οχημάτων.',
  '',
  '## Είναι η 3/11 συνηθισμένη μέρα;',
  '',
  'Ο ίδιος υπολογισμός για κάθε εργάσιμη που καταγράψαμε (Δευτέρα–Παρασκευή, εκτός από την αργία της 28/10, μόνο μέρες με δείγματα για τουλάχιστον το 80% της ώρας σε κάθε ανιχνευτή): ' + days.length + ' μέρες. Μέσος όρος **' + r1(avgLost / 60) + ' λεπτά χαμένα ανά αυτοκίνητο**, ' + Math.round(avgCars) + ' αυτοκίνητα. Η 3/11: ' + r1(lostMeas / 60) + ' λεπτά, ' + cars + ' αυτοκίνητα.',
  '',
  '| μέρα | αυτοκίνητα | διαδρομή (λεπτά) | χαμένα (λεπτά) |', '|---|---:|---:|---:|',
  ...days.map(x => '| ' + x.day + ' | ' + x.cars + ' | ' + r1(x.tt / 60) + ' | ' + r1(x.lost / 60) + ' |'),
  '',
  '## Αναγωγή στον χρόνο',
  '',
  '' + WORKDAYS + ' εργάσιμες, με τον μέσο όρο των ' + days.length + ' εργάσιμων. Μόνο για αυτή τη μία ώρα και αυτά τα 2,6 km, προς Αμπελόκηπους.',
  '',
  '- Όποιος κάνει τη διαδρομή κάθε εργάσιμη στις 08:00–09:00 χάνει περίπου **' + Math.round(year.personH) + ' ώρες τον χρόνο**. Με τον Τροχονόμο (εκτίμηση) **' + Math.round(year.personHOurs) + '**.',
  '- Όλα τα αυτοκίνητα μαζί: περίπου **' + Math.round(year.allH) + ' ώρες τον χρόνο**. Με τον Τροχονόμο (εκτίμηση) **' + Math.round(year.allHOurs) + '**, δηλαδή ' + Math.round(year.allH - year.allHOurs) + ' ώρες λιγότερες.',
  '- Με τον Τροχονόμο αφαιρείται κάθε μέρα το κέρδος της προσομοίωσης της 3/11 (' + Math.round(saved) + ' s ανά αυτοκίνητο). Οι άλλες μέρες δεν έχουν προσομοιωθεί.',
  '',
  '## CO₂ στους τρεις άξονες (εκτίμηση)',
  '',
  'Βασ. Σοφίας, Αλεξάνδρας, Κηφισίας, 20 φανάρια, ' + R.from + '–' + R.to + ', ' + SEEDS.length + ' σπόροι. Ώρες αναμονής στα φανάρια × ' + KG_PER_H + ' kg CO₂ την ώρα ρελαντί (κάτω άκρο των πηγών, όπως στο experiment-impact.js): ρολόι περίπου **' + Math.round(co2Clock) + ' kg**, Τροχονόμος περίπου **' + Math.round(co2Ours) + ' kg** μέσα σε αυτή την ώρα. Η αναμονή δεν είναι όλη ρελαντί· αυτοκίνητα με start-stop, υβριδικά ή ηλεκτρικά βγάζουν λιγότερο.',
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
