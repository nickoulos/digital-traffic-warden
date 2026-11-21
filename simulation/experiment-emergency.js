// experiment-emergency.js — ΠΕΙΡΑΜΑ: προτεραιότητα σε όχημα έκτακτης ανάγκης με εντολή του χειριστή.
//   node experiment-emergency.js run <seed>     → ../knowledge-base/results/raw/emergency/run-<seed>.json
//   node experiment-emergency.js report         → ../knowledge-base/results/experiment-emergency.md
// Ένα όχημα (ασθενοφόρο, πυροσβεστικό) διασχίζει μια διαδρομή κάθε 20 λεπτά από τις 07:00 ως τις 21:00, Τρίτη 3/11/2026. Κάθε πέρασμα τρέχει
// χωριστά (30 λεπτά πριν, 15 μετά) τέσσερις φορές με τις ίδιες αφίξεις: ρολόι ή Τροχονόμος, με ή χωρίς προτεραιότητα.
// ΚΟΚ: με φάρους και σειρήνα το όχημα περνά και με κόκκινο. Δεν το σταματά το φανάρι· το σταματούν τα οχήματα που στέκονται
// μπροστά του. Στο μοντέλο δεν τα προσπερνά, και όταν φτάσει πρώτο στη γραμμή με κόκκινο διασχίζει μετά από 3 s προσοχής. Η προτεραιότητα γυρίζει κάθε φανάρι της διαδρομής στο πράσινο της κατεύθυνσής του
// λίγο πριν φτάσει και το κρατά ώσπου να περάσει. Ελάχιστο πράσινο, ενδιάμεσος χρόνος και ανώτατη αναμονή ισχύουν κανονικά.
// ΠΑΡΑΔΟΧΕΣ: ο χειριστής ξέρει πότε μπαίνει το όχημα στη διαδρομή· στην πράξη θα ήθελε θέση από το ΕΚΑΒ ή την Πυροσβεστική.
// Κάθε αριθμός είναι ΠΡΟΣΟΜΟΙΩΣΗ. Έλεγχος ορίων ασφαλείας σε κάθε δευτερόλεπτο.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { window: {}, module: { exports: {} }, Math, console };
vm.createContext(ctx);
for (const f of ['data.js', 'sim-core.js', 'corridor-data.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app', f), 'utf8'), ctx);
const DATA = ctx.window.DATA, Sim = ctx.module.exports, DAY = '2026-11-03';
DATA.sites.push(ctx.window.CORRIDOR.site); for (const d in ctx.window.CORRIDOR.detectors) DATA.detectors[d] = ctx.window.CORRIDOR.detectors[d];
const OUT = path.join(__dirname, '..', 'knowledge-base', 'results', 'raw', 'emergency');
const ROUTES = [
  { key: 'kif-n', site: 'kifx', name: 'Λ. Κηφισίας προς Κηφισιά: Αρκαδίας, Λαρίσης, Πανόρμου (προς Ερυθρό Σταυρό)', route: ['ar_E', 'la_E', 'kp_E'] },
  { key: 'kif-s', site: 'kifx', name: 'Λ. Κηφισίας προς κέντρο: Πανόρμου, Λαρίσης, Αρκαδίας', route: ['kp_W', 'la_W', 'ar_W'] },
  { key: 'pan', site: 'kifx', name: 'Πανόρμου προς Λ. Κηφισίας (κάθετη)', route: ['kp_S'] },
  { key: 'alex-e', site: 'alex', name: 'Λ. Αλεξάνδρας προς Κηφισίας: Χαρ. Τρικούπη, Ιπποκράτους, Πανόρμου', route: ['xt_E', 'ip_E', 'pn_E'] },
  { key: 'alex-w', site: 'alex', name: 'Λ. Αλεξάνδρας προς Πατησίων: Πανόρμου, Ιπποκράτους, Χαρ. Τρικούπη', route: ['pn_W', 'ip_W', 'xt_W'] }
];
function mkSafety(sim) {
  const P = sim.P, minG = [P.minGreenMain, P.minGreenSide], bad = [];
  // Όριο κόκκινου: η ανώτατη αναμονή όπου ελέγχει ο Τροχονόμος. Σε φανάρι που μένει στο ρολόι και παίρνει μόνο προτεραιότητα, το όριο είναι
  // το μεγαλύτερο κόκκινο που δίνει ήδη το ρολόι στο ίδιο φανάρι: η προτεραιότητα δεν επιτρέπεται να το ξεπεράσει.
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
      if (sim.mode(j) === 'adaptive' || sim.preempted(j)) for (let p = 0; p < 2; p++) if (g !== p && t - s.redSince[p] > (sim.mode(j) === 'adaptive' ? P.maxRed : clockRed[j])) { bad.push('j' + j + ' t=' + t + ' κόκκινο'); s.redSince[p] = t; }
    });
  } };
}
function pass(R, T, seed, clock, preempt, notice) {
  const sim = Sim.createSim(DATA, R.site, DAY, T - 1800, T + 900, R.site === 'kifx' ? { seed, optH: 180 } : { seed }, 'optimal', null), safe = mkSafety(sim);
  if (clock) sim.net.juncs.forEach((J, j) => sim.hold(j, true));
  const ev = sim.addEV(R.route, T, { preempt, notice: notice || 0 });
  while (!sim.done) { sim.step(); safe.tick(); }
  const free = sim.P.lookahead + ev.route.slice(1).reduce((s, a) => s + sim.net.apps[a].travel, 0), s = sim.summary();
  return { done: ev.done, wait: ev.done ? ev.tEnd - ev.t0 - free : 900, stops: ev.log.filter(l => l.depart - l.arrive > 2).length, n: ev.log.length, green: ev.log.filter(l => l.depart >= 0 && !l.red).length, qInt: s.qInt, maxRed: Math.max(s.maxRed[0], s.maxRed[1]), safety: safe.bad.length + (s.conserved ? 0 : 1) };
}
function run(seed) {
  const rows = [];
  for (const R of ROUTES) for (let T = 7 * 3600; T <= 21 * 3600; T += 1200) {
    rows.push({ route: R.key, T, seed, clock: pass(R, T, seed, true, false), clockPre: pass(R, T, seed, true, true), ours: pass(R, T, seed, false, false), oursPre: pass(R, T, seed, false, true), oursPre60: pass(R, T, seed, false, true, 60) });
  }
  fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'run-' + seed + '.json'), JSON.stringify(rows) + '\n');
}
function report() {
  let rows = []; fs.readdirSync(OUT).filter(f => /^run-\d+\.json$/.test(f)).forEach(f => { rows = rows.concat(JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'))); });
  const q = (xs, p) => { const s = xs.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
  const f0 = x => Math.round(x).toString().replace('-', '−'), f1 = x => x.toFixed(1).replace('.', ',').replace('-', '−');
  const K = [['clock', 'Ρολόι'], ['clockPre', 'Ρολόι + προτεραιότητα'], ['ours', 'Τροχονόμος'], ['oursPre', 'Τροχονόμος + προτεραιότητα'], ['oursPre60', 'Τροχονόμος + προτεραιότητα, εντολή 1 λεπτό νωρίτερα']];
  let md = '# Πείραμα: προτεραιότητα σε όχημα έκτακτης ανάγκης — ΠΡΟΣΟΜΟΙΩΣΗ\n\nΠαράγεται από `simulation/experiment-emergency.js`. Τρίτη 3/11/2026, ένα πέρασμα κάθε 20 λεπτά από τις 07:00 ως τις 21:00, ' + new Set(rows.map(r => r.seed)).size + ' σπόροι.\n\n' +
    'Με φάρους και σειρήνα το όχημα περνά και με κόκκινο (ΚΟΚ). Αυτό που το σταματά είναι τα οχήματα που στέκονται μπροστά του. «Κολλημένο πίσω από ουρά» = πόσα δευτερόλεπτα χάνει στη διαδρομή σε σχέση με ελεύθερη διέλευση· στο μοντέλο δεν προσπερνά τα σταματημένα οχήματα (στην πράξη οι οδηγοί κάνουν εν μέρει στην άκρη) και, όταν φτάσει πρώτο στη γραμμή με κόκκινο, διασχίζει μετά από 3 s προσοχής. «Διασχίζει με πράσινο» = σε πόσες διασταυρώσεις περνά ενώ η κάθετη κίνηση είναι ήδη σταματημένη. Η προτεραιότητα δεν χαλαρώνει κανένα όριο ασφαλείας. ' +
    '«Κόστος για τους άλλους» = πόσο αυξάνεται η συνολική αναμονή όλων των υπόλοιπων οχημάτων στα φανάρια της διαδρομής, σε οχηματο-λεπτά ανά πέρασμα (αρνητικό = μειώνεται).\n\n';
  for (const R of ROUTES) {
    const rs = rows.filter(r => r.route === R.key); if (!rs.length) continue;
    md += '## ' + R.name + '\n\n| Έλεγχος | Κολλημένο πίσω από ουρά: διάμεσος | 9 στα 10 περάσματα κάτω από | Χειρότερο | Διασχίζει με πράσινο | Κόστος για τους άλλους (διάμεσος) | Παραβάσεις ορίων |\n|---|---|---|---|---|---|---|\n';
    for (const [k, name] of K) {
      const w = rs.map(r => r[k].wait), base = k === 'clockPre' ? 'clock' : /^oursPre/.test(k) ? 'ours' : null;
      md += '| ' + name + ' | ' + f0(q(w, 0.5)) + ' s | ' + f0(q(w, 0.9)) + ' s | ' + f0(Math.max(...w)) + ' s | ' + Math.round(100 * rs.reduce((x, r) => x + r[k].green, 0) / rs.reduce((x, r) => x + r[k].n, 0)) + '% | ' +
        (base ? f1(q(rs.map(r => (r[k].qInt - r[base].qInt) / 60), 0.5)) + ' οχ.·λεπτά' : '—') + ' | ' + rs.reduce((s, r) => s + r[k].safety, 0) + ' |\n';
    }
    md += '\n';
  }
  fs.writeFileSync(path.join(__dirname, '..', 'knowledge-base', 'results', 'experiment-emergency.md'), md); console.log(md);
}
if (process.argv[2] === 'report') report(); else if (process.argv[2] === 'run') run(+process.argv[3]); else console.log('βλ. σχόλια στην αρχή του αρχείου');
