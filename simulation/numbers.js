// numbers.js — όλοι οι αριθμοί της παρουσίασης:  node numbers.js
// Τρέχει κάθε κόμβο × σενάριο για 30 σπόρους τυχαίων αφίξεων και γράφει:
//   ../knowledge-base/results/numbers.json   πλήρη αποτελέσματα (διάμεσος, ελάχιστο, μέγιστο)
//   ../knowledge-base/results/numbers.md     αναγνώσιμος πίνακας
//   stage-config.js            ο σπόρος που παίζει η σκηνή (stage.html): ο πλησιέστερος στη διάμεσο
// Κάθε αριθμός εδώ είναι ΠΡΟΣΟΜΟΙΩΣΗ. Ίδια είσοδος → ίδια έξοδος, byte προς byte.
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = path.join(__dirname, '..', 'app'), out = path.join(__dirname, '..', 'knowledge-base', 'results');
const ctx = { window: {}, module: { exports: {} }, Math, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(dir, 'data.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(dir, 'sim-core.js'), 'utf8'), ctx);
const DATA = ctx.window.DATA, Sim = ctx.module.exports;

const SEEDS = 30, STAGE_DAY = '2026-11-03';
const CTRL = 'optimal';   // ο ελεγκτής της πρότασης: βελτιστοποίηση κυλιόμενου ορίζοντα. Οι τρεις κανόνες ('adaptive') μένουν ως σύγκριση.
const BREAK = { alex: 'MS421', kif: 'MS262', iera: 'MS658' };
const WINDOWS = [
  { id: 'day-wk', label: 'Τυπική καθημερινή, όλη η μέρα', day: 'wk', from: 0, to: 24 },
  { id: 'day-tue', label: 'Τρίτη 3/11, όλη η μέρα', day: '2026-11-03', from: 0, to: 24 },
  { id: 'day-fri', label: 'Παρασκευή 6/11, όλη η μέρα', day: '2026-11-06', from: 0, to: 24 },
  { id: 'am-tue', label: 'Τρίτη 3/11, 07–10', day: '2026-11-03', from: 7, to: 10 },
  { id: 'pm-tue', label: 'Τρίτη 3/11, 16–19', day: '2026-11-03', from: 16, to: 19 },
];

const r1 = x => Math.round(x * 10) / 10, r2 = x => Math.round(x * 100) / 100;
function stat(xs, rnd) { const s = xs.slice().sort((a, b) => a - b), n = s.length, m = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; return { median: rnd(m), min: rnd(s[0]), max: rnd(s[n - 1]) }; }
function run(site, w, params, ctrl) {
  const sim = Sim.createSim(DATA, site, w.day, w.from * 3600, w.to * 3600, params, ctrl, null).run(), s = sim.summary();
  if (!s.conserved) throw new Error('διατήρηση οχημάτων: ' + site + ' ' + w.id + ' ' + JSON.stringify(params) + ' ' + ctrl);
  return { sim, s };
}
const fixedCache = {};
function fixed(site, w, seed) { const k = site + w.id + seed; return fixedCache[k] || (fixedCache[k] = run(site, w, { seed }, 'fixed').s); }

function cell(site, w, blind, maxRed) {
  const F = [], A = [], D = [], H = [], R = [], per = [], arrived = [], redF = [], redA = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    const f = fixed(site, w, seed), a = run(site, w, { seed, blind, maxRed }, CTRL).s;
    R.push(100 * (run(site, w, { seed, blind, maxRed }, 'adaptive').s.meanDelay - f.meanDelay) / f.meanDelay);
    F.push(f.meanDelay); A.push(a.meanDelay); D.push(100 * (a.meanDelay - f.meanDelay) / f.meanDelay);
    H.push(f.delayH - a.delayH); per.push({ seed, saved: f.delayH - a.delayH }); arrived.push(f.arrived);
    redF.push(f.maxRed[1]); redA.push(a.maxRed[1]);
  }
  const wins = D.filter(d => d < 0).length;
  return {
    site, window: w.id, label: w.label, day: w.day, from: w.from, to: w.to, blind, maxRed,
    fixed: stat(F, r1), adaptive: stat(A, r1), deltaPct: stat(D, r1), rulesDeltaPct: stat(R, r1), savedVehH: stat(H, r1),
    arrived: stat(arrived, Math.round).median, seedsBetter: wins,
    maxRedSide: { fixed: stat(redF, Math.round).median, adaptive: stat(redA, Math.round).median },
    _per: per
  };
}

const runs = [];
for (const site of DATA.sites) for (const w of WINDOWS) for (const blind of [1, 0]) runs.push(cell(site.id, w, blind, 90));
const sens = [];
for (const site of DATA.sites) for (const maxRed of [45, 60, 90]) sens.push(cell(site.id, WINDOWS[1], 1, maxRed));

// σπόρος σκηνής: ο πλησιέστερος στη διάμεσο εξοικονόμηση, Τρίτη όλη η μέρα, blind=1
const stage = { sites: {} }, hourly = {};
for (const site of DATA.sites) {
  const c = runs.find(r => r.site === site.id && r.window === 'day-tue' && r.blind === 1);
  const best = c._per.slice().sort((a, b) => Math.abs(a.saved - c.savedVehH.median) - Math.abs(b.saved - c.savedVehH.median) || a.seed - b.seed)[0];
  const f = run(site.id, WINDOWS[1], { seed: best.seed }, 'fixed'), a = run(site.id, WINDOWS[1], { seed: best.seed, blind: 1 }, CTRL);
  stage.sites[site.id] = {
    day: STAGE_DAY, seed: best.seed, breakDet: BREAK[site.id],
    savedVehH: r2(f.s.delayH - a.s.delayH), deltaPct: r1(100 * (a.s.meanDelay - f.s.meanDelay) / f.s.meanDelay),
    fixedDelay: r1(f.s.meanDelay), adaptiveDelay: r1(a.s.meanDelay), arrived: f.s.arrived
  };
  // ανά ώρα της ημέρας (σπόρος σκηνής): καθυστέρηση s/όχημα
  hourly[site.id] = [];
  for (let h = 0; h < 24; h++) {
    const agg = sim => { let q = 0, n = 0; for (let b = h * 12; b < h * 12 + 12; b++) { q += sim.series.qInt[b]; n += sim.series.arr[b]; } return n ? q / n : 0; };
    hourly[site.id].push({ hour: h, fixed: r1(agg(f.sim)), adaptive: r1(agg(a.sim)) });
  }
}
const strip = r => { const o = Object.assign({}, r); delete o._per; return o; };
fs.writeFileSync(path.join(out, 'numbers.json'), JSON.stringify({ seeds: SEEDS, controller: CTRL, note: 'ΠΡΟΣΟΜΟΙΩΣΗ. adaptive = ο ελεγκτής της πρότασης (βελτιστοποίηση κυλιόμενου ορίζοντα)· rulesDeltaPct = οι τρεις κανόνες, για σύγκριση. blind=1: ο ελεγκτής βλέπει μόνο προσβάσεις με ανιχνευτή. blind=0: βλέπει όλες τις ουρές.', runs: runs.map(strip), sensitivityMaxRed: sens.map(strip), stage: stage.sites, hourly }, null, 1) + '\n');
fs.writeFileSync(path.join(dir, 'stage-config.js'), '// Παράγεται από το numbers.js — μην το επεξεργάζεστε με το χέρι.\nwindow.STAGE = ' + JSON.stringify(stage, null, 1) + ';\n');

const name = id => DATA.sites.find(s => s.id === id).name;
const rng = (o, u) => o.median + u + ' (' + o.min + ' έως ' + o.max + ')';
const sgn = x => (x > 0 ? '+' : '') + x;
const dl = o => sgn(o.median) + '% (' + sgn(o.min) + ' έως ' + sgn(o.max) + ')';
let md = '# Αριθμοί παρουσίασης — ΠΡΟΣΟΜΟΙΩΣΗ\n\nΠαράγεται από `simulation/numbers.js`. ' + SEEDS + ' σπόροι τυχαίων αφίξεων ανά περίπτωση· διάμεσος (ελάχιστο έως μέγιστο).\n' +
  'Καθυστέρηση σε s/όχημα. Αρνητικό Δ = λιγότερη αναμονή. «Προσαρμ.» = βελτιστοποίηση κυλιόμενου ορίζοντα (ο ελεγκτής της πρότασης)· «Κανόνες» = οι τρεις κανόνες, μόνο για σύγκριση.\n\n## Headline — Τρίτη 3/11, όλη η μέρα\n\n' +
  '| Κόμβος | Ανιχνευτές | Σταθερό | Προσαρμ. | Δ | Κανόνες Δ | Οχηματοώρες/ημέρα που κερδίζονται | Οχήματα | Σπόροι με όφελος |\n|---|---|---|---|---|---|---|---|---|\n';
for (const site of DATA.sites) for (const blind of [1, 0]) {
  const c = runs.find(r => r.site === site.id && r.window === 'day-tue' && r.blind === blind);
  md += '| ' + name(site.id) + ' | ' + (blind ? 'οι σημερινοί' : 'σε κάθε πρόσβαση') + ' | ' + c.fixed.median + ' | ' + c.adaptive.median + ' | ' + dl(c.deltaPct) + ' | ' + sgn(c.rulesDeltaPct.median) + '% | ' + rng(c.savedVehH, '') + ' | ' + c.arrived + ' | ' + c.seedsBetter + '/' + SEEDS + ' |\n';
}
md += '\n## Όλα τα σενάρια\n\n| Κόμβος | Σενάριο | Ανιχνευτές | Σταθερό | Προσαρμ. | Δ | Οχηματοώρες | Μέγ. κόκκινο κάθετης Σ/Π (s) |\n|---|---|---|---|---|---|---|---|\n';
for (const c of runs) md += '| ' + name(c.site) + ' | ' + c.label + ' | ' + (c.blind ? 'σημερινοί' : 'παντού') + ' | ' + c.fixed.median + ' | ' + c.adaptive.median + ' | ' + dl(c.deltaPct) + ' | ' + rng(c.savedVehH, '') + ' | ' + c.maxRedSide.fixed + ' / ' + c.maxRedSide.adaptive + ' |\n';
md += '\n## Ευαισθησία στην ανώτατη αναμονή (Τρίτη όλη η μέρα, σημερινοί ανιχνευτές)\n\n| Κόμβος | Ανώτατη αναμονή (s) | Δ | Οχηματοώρες | Μέγ. κόκκινο κάθετης Σ/Π (s) |\n|---|---|---|---|---|\n';
for (const c of sens) md += '| ' + name(c.site) + ' | ' + c.maxRed + ' | ' + dl(c.deltaPct) + ' | ' + rng(c.savedVehH, '') + ' | ' + c.maxRedSide.fixed + ' / ' + c.maxRedSide.adaptive + ' |\n';
md += '\n## Σπόρος σκηνής (stage.html)\n\n| Κόμβος | Σπόρος | Σταθερό | Προσαρμ. | Δ | Οχηματοώρες |\n|---|---|---|---|---|---|\n';
for (const id in stage.sites) { const s = stage.sites[id]; md += '| ' + name(id) + ' | ' + s.seed + ' | ' + s.fixedDelay + ' | ' + s.adaptiveDelay + ' | ' + sgn(s.deltaPct) + '% | ' + s.savedVehH + ' |\n'; }
md += '\n## Ανά ώρα της ημέρας (σπόρος σκηνής, s/όχημα σταθερό → προσαρμ.)\n\n| Ώρα | ' + DATA.sites.map(s => s.name).join(' | ') + ' |\n|---|' + DATA.sites.map(() => '---|').join('') + '\n';
for (let h = 0; h < 24; h++) md += '| ' + String(h).padStart(2, '0') + ' | ' + DATA.sites.map(s => hourly[s.id][h].fixed + ' → ' + hourly[s.id][h].adaptive).join(' | ') + ' |\n';
fs.writeFileSync(path.join(out, 'numbers.md'), md);
console.log('έγραψε numbers.json, numbers.md, stage-config.js');
