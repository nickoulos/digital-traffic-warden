// experiment-impact.js — ΤΑ ΝΟΥΜΕΡΑ ΤΟΥ ΑΠΛΟΥ PITCH: οι τρεις άξονες της οθόνης demo.html μαζί, ρολόι εναντίον Ψηφιακού Τροχονόμου.
//   node experiment-impact.js run <σπόρος>     → ../knowledge-base/results/raw/impact/run-<σπόρος>.json
//   node experiment-impact.js report          → ../knowledge-base/results/experiment-impact.md
// Άξονες: Λ. Κηφισίας (Αρκαδίας, Λαρίσης, Πανόρμου), Λ. Αλεξάνδρας (3 φανάρια), Λ. Βασ. Σοφίας (14 φανάρια). Ελεγκτής ανά άξονα όπως στο
// demo.html: Κηφισίας βελτιστοποίηση ανά κόμβο, Αλεξάνδρας και Βασ. Σοφίας απλοί κανόνες (σε άξονα μετρήθηκαν καλύτεροι).
// Δύο σενάρια ανιχνευτών: «σημερινοί» (ελέγχεται μόνο φανάρι που βλέπει και τις δύο φάσεις του· η Αλεξάνδρας μένει στο ρολόι, γιατί εκεί
// με τους σημερινούς χάνει) και «σε κάθε κάθετη» (15 νέοι ανιχνευτές: 2 Κηφισίας, 2 Αλεξάνδρας, 11 Βασ. Σοφίας).
// Και ένα όχημα έκτακτης ανάγκης στη Βασ. Σοφίας από την Ακαδημίας ως το Ιπποκράτειο, κάθε 20 λεπτά 07:00–21:00.
// Κάθε αριθμός είναι ΠΡΟΣΟΜΟΙΩΣΗ. Έλεγχος ορίων ασφαλείας σε κάθε δευτερόλεπτο.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { window: {}, module: { exports: {} }, Math, console };
vm.createContext(ctx);
for (const f of ['data.js', 'sim-core.js', 'corridor-data.js', 'sofias-data.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app', f), 'utf8'), ctx);
const DATA = ctx.window.DATA, Sim = ctx.module.exports, DAY = '2026-11-03';
for (const X of [ctx.window.CORRIDOR, ctx.window.SOFIAS]) { DATA.sites.push(X.site); for (const d in X.detectors) DATA.detectors[d] = X.detectors[d]; }
const OUT = path.join(__dirname, '..', 'knowledge-base', 'results', 'raw', 'impact');
const AXES = [
  { id: 'kifx', name: 'Λ. Κηφισίας (3 φανάρια)', ctrl: 'optimal', now: true, newDet: 2 },
  { id: 'alex', name: 'Λ. Αλεξάνδρας (3 φανάρια)', ctrl: 'adaptive', now: false, newDet: 2 },
  { id: 'sofias', name: 'Λ. Βασ. Σοφίας (14 φανάρια)', ctrl: 'adaptive', now: true, newDet: 11 }
];
const EV = { site: 'sofias', route: ['ak_E', 'ko_E', 'rg_E', 'rz_E', 'ma_E', 'vk_E', 'pp_E', 'db_E'], name: 'Λ. Βασ. Σοφίας: Ακαδημίας → Ιπποκράτειο (8 φανάρια)' };

function mkSafety(sim) {
  const P = sim.P, minG = [P.minGreenMain, P.minGreenSide], bad = [];
  const clockRed = sim.net.juncs.map((x, j) => Math.max(P.maxRed, ...sim.plans.map(p => Math.max(p.j[j].g0, p.j[j].g1) + 2 * P.lost)));
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
      if (sim.ctrl !== 'fixed' && (sim.mode(j) === 'adaptive' || sim.preempted(j))) for (let p = 0; p < 2; p++) if (g !== p && t - s.redSince[p] > (sim.mode(j) === 'adaptive' ? P.maxRed : clockRed[j])) { bad.push('j' + j + ' t=' + t + ' κόκκινο'); s.redSince[p] = t; }
    });
  } };
}
function day(A, seed, scen) {
  const ctrl = scen === 'fixed' || (scen === 'now' && !A.now) ? 'fixed' : A.ctrl;
  const sim = Sim.createSim(DATA, A.id, DAY, 0, 86400, { seed, blind: scen === 'all' ? 0 : 1 }, ctrl, null), safe = mkSafety(sim);
  while (!sim.done) { sim.step(); safe.tick(); }
  const s = sim.summary();
  return { h: s.delayH, arrived: s.arrived, stops: s.stopsPct, ctl: sim.net.juncs.filter((x, j) => sim.mode(j) === 'adaptive').length, n: sim.net.juncs.length, safety: safe.bad.length + (s.conserved ? 0 : 1) };
}
function evPass(T, seed, ours) {
  const sim = Sim.createSim(DATA, EV.site, DAY, T - 1800, T + 900, { seed, blind: 0 }, ours ? 'adaptive' : 'fixed', null), safe = mkSafety(sim);
  const ev = sim.addEV(EV.route, T, { preempt: ours, notice: ours ? 60 : 0 });
  while (!sim.done) { sim.step(); safe.tick(); }
  const free = sim.P.lookahead + ev.route.slice(1).reduce((x, a) => x + sim.net.apps[a].travel, 0);
  return { wait: ev.done ? ev.tEnd - ev.t0 - free : 900, safety: safe.bad.length };
}
function run(seed) {
  const r = { seed, axes: {}, ev: [] };
  for (const A of AXES) r.axes[A.id] = { fixed: day(A, seed, 'fixed'), now: day(A, seed, 'now'), all: day(A, seed, 'all') };
  for (let T = 7 * 3600; T <= 21 * 3600; T += 1200) r.ev.push({ T, clock: evPass(T, seed, false), ours: evPass(T, seed, true) });
  fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'run-' + seed + '.json'), JSON.stringify(r) + '\n');
}
function report() {
  const rows = fs.readdirSync(OUT).filter(f => /^run-\d+\.json$/.test(f)).map(f => JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')));
  const med = xs => { const s = xs.slice().sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
  const q = (xs, p) => { const s = xs.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
  const f0 = x => Math.round(x).toLocaleString('el-GR'), pc = x => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(1).replace('.', ',') + '%';
  const tot = (r, sc) => AXES.reduce((s, A) => s + r.axes[A.id][sc].h, 0);
  let md = '# Τα νούμερα του απλού pitch — ΠΡΟΣΟΜΟΙΩΣΗ\n\nΠαράγεται από `simulation/experiment-impact.js`. Τρίτη 3/11/2026, όλη η μέρα, ' + rows.length + ' σπόροι, διάμεσος. ' +
    'Οι τρεις άξονες της οθόνης `demo.html`, 20 φανάρια. Έναντι συντονισμένου σταθερού προγράμματος δικού μας σχεδιασμού (όχι του ισχύοντος).\n\n' +
    '| Άξονας | Ρολόι: ώρες αναμονής/ημέρα | Σημερινοί ανιχνευτές: φανάρια που ελέγχονται | Δ | Ώρες λιγότερες | Ανιχνευτής σε κάθε κάθετη: νέοι ανιχνευτές | Δ | Ώρες λιγότερες | Παραβάσεις ορίων |\n|---|---|---|---|---|---|---|---|---|\n';
  for (const A of AXES) {
    const g = sc => rows.map(r => r.axes[A.id][sc]);
    md += '| ' + A.name + ' | ' + f0(med(g('fixed').map(x => x.h))) + ' | ' + med(g('now').map(x => x.ctl)) + ' / ' + g('now')[0].n + ' | ' + pc(med(rows.map(r => 100 * (r.axes[A.id].now.h / r.axes[A.id].fixed.h - 1)))) + ' | ' + f0(med(rows.map(r => r.axes[A.id].fixed.h - r.axes[A.id].now.h))) +
      ' | ' + A.newDet + ' | ' + pc(med(rows.map(r => 100 * (r.axes[A.id].all.h / r.axes[A.id].fixed.h - 1)))) + ' | ' + f0(med(rows.map(r => r.axes[A.id].fixed.h - r.axes[A.id].all.h))) + ' | ' + rows.reduce((s, r) => s + r.axes[A.id].now.safety + r.axes[A.id].all.safety, 0) + ' |\n';
  }
  const sNow = med(rows.map(r => tot(r, 'fixed') - tot(r, 'now'))), sAll = med(rows.map(r => tot(r, 'fixed') - tot(r, 'all')));
  md += '| **Σύνολο, 20 φανάρια** | ' + f0(med(rows.map(r => tot(r, 'fixed')))) + ' | | ' + pc(med(rows.map(r => 100 * (tot(r, 'now') / tot(r, 'fixed') - 1)))) + ' | **' + f0(sNow) + '** | 15 | ' + pc(med(rows.map(r => 100 * (tot(r, 'all') / tot(r, 'fixed') - 1)))) + ' | **' + f0(sAll) + '** | |\n\n';
  md += '**Καυσαέρια και καύσιμο (εκτίμηση, όχι μέτρηση):** επιβατικό στο ρελαντί περίπου 1 kg CO₂ και 0,6 λίτρα καυσίμου την ώρα (κάτω άκρο των πηγών, βλ. `facts.md`, Δ). ' +
    'Σημερινοί ανιχνευτές: περίπου ' + f0(sNow) + ' kg CO₂ και ' + f0(sNow * 0.6) + ' λίτρα τη μέρα. Ανιχνευτής σε κάθε κάθετη: περίπου ' + f0(sAll) + ' kg CO₂ και ' + f0(sAll * 0.6) + ' λίτρα τη μέρα. Η αναμονή δεν είναι όλη ρελαντί και οχήματα με start-stop ή ηλεκτρικά βγάζουν λιγότερο.\n\n';
  const ev = rows.flatMap(r => r.ev);
  md += '## Όχημα έκτακτης ανάγκης: ' + EV.name + '\n\nΠόσα δευτερόλεπτα μένει κολλημένο πίσω από ουρές, σε σχέση με ελεύθερη διέλευση. ' + ev.length + ' περάσματα. Ρολόι χωρίς προτεραιότητα εναντίον Τροχονόμου (ανιχνευτής σε κάθε κάθετη) με προτεραιότητα που δίνεται 1 λεπτό πριν μπει το όχημα.\n\n' +
    '| Έλεγχος | Διάμεσος | 9 στα 10 περάσματα κάτω από | Χειρότερο | Παραβάσεις ορίων |\n|---|---|---|---|---|\n';
  for (const [k, n] of [['clock', 'Ρολόι, χωρίς προτεραιότητα'], ['ours', 'Τροχονόμος + προτεραιότητα']]) { const w = ev.map(e => e[k].wait); md += '| ' + n + ' | ' + f0(med(w)) + ' s | ' + f0(q(w, 0.9)) + ' s | ' + f0(Math.max(...w)) + ' s | ' + ev.reduce((s, e) => s + e[k].safety, 0) + ' |\n'; }
  fs.writeFileSync(path.join(__dirname, '..', 'knowledge-base', 'results', 'experiment-impact.md'), md); console.log(md);
}
if (process.argv[2] === 'report') report(); else if (process.argv[2] === 'run') run(+process.argv[3]); else console.log('βλ. σχόλια στην αρχή του αρχείου');
