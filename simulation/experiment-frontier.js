// experiment-frontier.js — ΠΕΙΡΑΜΑΤΑ: πόσο απέχουμε από το βέλτιστο, τι δίνει το ιστορικό, πού αξίζει ανιχνευτής.
//   node experiment-frontier.js oracle  <site> <blind> <seedFrom> <seedTo>   τέλεια γνώση αφίξεων / μεγαλύτερος ορίζοντας (όλη η μέρα)
//   node experiment-frontier.js offline <site> <blind> <seed>               αναζήτηση με γνώση όλης της αιχμής 07–09: μετακινεί κάθε αλλαγή φάσης
//   node experiment-frontier.js est     <site> <seedFrom> <seedTo>          εκτιμώμενη ουρά από ιστορικό όπου δεν υπάρχει ανιχνευτής
//   node experiment-frontier.js sensors <site> <ctrl> <seedFrom> <seedTo>   άπληστη επιλογή: ποιος ανιχνευτής δίνει το μεγαλύτερο κέρδος κάθε φορά
//   node experiment-frontier.js tune    <site> <blind>                      ρύθμιση παραμέτρων σε άλλες μέρες, έλεγχος στην Τρίτη 3/11
//   node experiment-frontier.js report                                      → ../knowledge-base/results/experiment-frontier.md
// Αποτελέσματα σε ../knowledge-base/results/raw/frontier/. Κάθε αριθμός είναι ΠΡΟΣΟΜΟΙΩΣΗ. Έλεγχος ορίων ασφαλείας σε κάθε δευτερόλεπτο.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { window: {}, module: { exports: {} }, Math, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app', 'data.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app', 'sim-core.js'), 'utf8'), ctx);
const DATA = ctx.window.DATA, Sim = ctx.module.exports, DAY = '2026-11-03';
const OUT = path.join(__dirname, '..', 'knowledge-base', 'results', 'raw', 'frontier');
const save = (name, obj) => { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify(obj) + '\n'); };
const med = xs => { const s = xs.slice().sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

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
// μία εκτέλεση με έλεγχο ασφαλείας
function go(site, day, t0, t1, params, ctrl) {
  const sim = Sim.createSim(DATA, site, day, t0, t1, params, ctrl, null), safe = mkSafety(sim);
  while (!sim.done) { sim.step(); safe.tick(); }
  const s = sim.summary();
  return { delay: s.meanDelay, qInt: s.qInt, queued: s.queued, safety: safe.bad.length + (s.conserved ? 0 : 1), maxRed: s.maxRed, sw: sim.swLog };
}
// Δ% έναντι σταθερού προγράμματος, διάμεσος σε σπόρους
function delta(site, day, seeds, params, ctrl, blind) {
  const D = []; let safety = 0;
  for (const seed of seeds) {
    const base = { seed, blind }; if (params.demandScale) base.demandScale = params.demandScale;
    const f = go(site, day, 0, 86400, base, 'fixed'), r = go(site, day, 0, 86400, Object.assign({ seed, blind }, params), ctrl);
    D.push(100 * (r.delay - f.delay) / f.delay); safety += r.safety;
  }
  return { med: med(D), min: Math.min(...D), max: Math.max(...D), n: D.length, safety };
}
const range = (a, b) => { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; };

// 1α. Τέλεια γνώση των αφίξεων και μεγαλύτερος ορίζοντας
function oracle(site, blind, a, b) {
  const V = [['βάση (ορίζοντας 120 s)', {}], ['ορίζοντας 180 s', { optH: 180 }], ['ορίζοντας 240 s', { optH: 240 }],
    ['τέλεια γνώση αφίξεων, 120 s', { oracle: 1 }], ['τέλεια γνώση αφίξεων, 180 s', { oracle: 1, optH: 180 }], ['τέλεια γνώση αφίξεων, 240 s', { oracle: 1, optH: 240 }]];
  save('oracle-' + site + '-b' + blind + '-' + a, V.map(([name, p]) => Object.assign({ name }, delta(site, DAY, range(a, b), p, 'optimal', blind))));
}

// 1β. Αναζήτηση με γνώση όλης της αιχμής: ξεκινά από το πρόγραμμα που έβγαλε ο καλύτερος ελεγκτής και μετακινεί ή αφαιρεί
// αλλαγές φάσης, μία τη φορά, κρατώντας ό,τι μικραίνει τη συνολική αναμονή ΟΛΟΥ του δικτύου (πραγματικό κόστος, όχι πρόβλεψη).
function offline(site, blind, seed) {
  const t0 = 7 * 3600, t1 = 9 * 3600, base = { seed, blind };
  const J = r => r.qInt + 60 * r.queued;
  const res = {}; let start = null;
  for (const c of ['fixed', 'adaptive', 'optimal']) { const r = go(site, DAY, t0, t1, base, c); res[c] = r.delay; if (c !== 'fixed' && (!start || J(r) < J(start))) start = Object.assign({ c }, r); }
  let sc = start.sw.map(x => x.slice()), best = J(start), evals = 0;
  const run = s => { evals++; return go(site, DAY, t0, t1, Object.assign({ schedule: s }, base), 'replay'); };
  const T0 = Date.now(), log = [];
  for (let pass = 0; pass < 8; pass++) {
    const before = best;
    for (let j = 0; j < sc.length; j++) for (let i = 0; i < sc[j].length; i++) {
      for (const d of [-3, 3, -6, 6, -12, 12, 0]) {
        const s = sc[j].slice();
        if (d === 0) { if (i + 1 >= s.length) continue; s.splice(i, 2); }      // αφαίρεση δύο διαδοχικών αλλαγών = παράλειψη μίας φάσης
        else { s[i] += d; if ((i > 0 && s[i] <= s[i - 1]) || (i + 1 < s.length && s[i] >= s[i + 1]) || s[i] < t0) continue; }
        const trial = sc.slice(); trial[j] = s;
        const c = J(run(trial));
        if (c < best - 1e-9) { best = c; sc = trial; if (d === 0) i = Math.max(-1, i - 1); break; }
      }
    }
    log.push({ pass, best, evals, sec: Math.round((Date.now() - T0) / 1000) });
    if ((before - best) / before < 0.002) break;
  }
  const fin = go(site, DAY, t0, t1, Object.assign({ schedule: sc }, base), 'replay');
  save('offline-' + site + '-b' + blind + '-' + seed, { site, blind, seed, fixed: res.fixed, adaptive: res.adaptive, optimal: res.optimal, start: start.c, offline: fin.delay, safety: fin.safety, maxRed: fin.maxRed, log });
}

// 3. Εκτιμώμενη ουρά όπου δεν υπάρχει ανιχνευτής (est = πόσο λάθος είναι η εκτίμηση της ροής: 1 = σωστή κατά μέσο όρο)
function est(site, a, b) {
  const rows = [], seeds = range(a, b);
  for (const ctrl of ['optimal', 'adaptive']) {
    rows.push(Object.assign({ ctrl, name: 'σημερινοί ανιχνευτές' }, delta(site, DAY, seeds, {}, ctrl, 1)));
    for (const e of [0.5, 0.75, 1, 1.5, 2]) rows.push(Object.assign({ ctrl, name: 'εκτίμηση ×' + e, e }, delta(site, DAY, seeds, { est: e }, ctrl, 1)));
    rows.push(Object.assign({ ctrl, name: 'ανιχνευτής παντού' }, delta(site, DAY, seeds, {}, ctrl, 0)));
  }
  save('est-' + site + '-' + a, rows);
}

// 4. Πού αξίζει ανιχνευτής: ξεκινάμε χωρίς κανέναν (ο ελεγκτής δουλεύει μόνο με εκτίμηση από ιστορικό) και προσθέτουμε κάθε φορά
// εκείνον που μικραίνει περισσότερο την αναμονή.
function sensors(site, ctrl, a, b) {
  const net = Sim.buildNet(DATA, site, Sim.DEFAULTS, null), all = net.apps.map(A => A.id), meas = {}; net.apps.forEach(A => { meas[A.id] = A.measured; });
  const seeds = range(a, b);
  const evalSet = S => delta(site, DAY, seeds, { est: 1, detAdd: S.filter(x => !meas[x]), detDrop: all.filter(x => meas[x] && S.indexOf(x) < 0) }, ctrl, 1);
  const steps = [Object.assign({ add: null, set: [] }, evalSet([]))];
  let cur = [];
  while (cur.length < all.length) {
    let bestId = null, bestR = null; const cand = [];
    for (const id of all) { if (cur.indexOf(id) >= 0) continue; const r = evalSet(cur.concat(id)); cand.push({ id, med: r.med }); if (!bestR || r.med < bestR.med) { bestR = r; bestId = id; } }
    cur = cur.concat(bestId); steps.push(Object.assign({ add: bestId, set: cur.slice(), cand }, bestR));
  }
  save('sensors-' + site + '-' + ctrl, { site, ctrl, seeds: seeds.length, measured: meas, steps });
}

// 2. Ρύθμιση παραμέτρων από άλλες μέρες (ιστορικό) και έλεγχος στην Τρίτη 3/11
function tune(site, blind) {
  const TRAIN = [['wk', 101], ['wk', 102], ['2026-11-06', 103], ['2026-11-06', 104]];
  const score = (p, ctrl) => med(TRAIN.map(([day, seed]) => { const f = go(site, day, 0, 86400, { seed, blind }, 'fixed'), r = go(site, day, 0, 86400, Object.assign({ seed, blind }, p), ctrl); return 100 * (r.delay - f.delay) / f.delay; }));
  const out = {};
  const grids = { adaptive: [], optimal: [] };
  for (const ratio of [1, 1.25, 1.5, 2, 3]) for (const margin of [0, 1, 2, 3, 5, 8]) grids.adaptive.push({ ratio, margin });
  for (const optH of [120, 150, 180, 240]) for (const optNet of [0, 1]) grids.optimal.push({ optH, optNet });
  for (const ctrl of ['adaptive', 'optimal']) {
    let best = null; const all = [];
    for (const p of grids[ctrl]) { const s = score(p, ctrl); all.push({ p, s }); if (!best || s < best.s) best = { p, s }; }
    out[ctrl] = { best, grid: all, testDefault: delta(site, DAY, range(1, 30), {}, ctrl, blind), testTuned: delta(site, DAY, range(1, 30), best.p, ctrl, blind) };
  }
  save('tune-' + site + '-b' + blind, out);
}

function report() {
  const files = fs.readdirSync(OUT), load = f => JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));
  const f1 = x => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(1).replace('.', ',') + '%';
  const short = id => DATA.sites.find(s => s.id === id).short;
  let md = '# Πειράματα: απόσταση από το βέλτιστο, ιστορικό, θέσεις ανιχνευτών — ΠΡΟΣΟΜΟΙΩΣΗ\n\nΠαράγεται από `simulation/experiment-frontier.js`. Τρίτη 3/11/2026. Δ = μεταβολή μέσης αναμονής έναντι του σταθερού προγράμματος (διάμεσος σε σπόρους).\n\n';
  md += '## 1α. Τι δίνει η τέλεια γνώση των αφίξεων\n\nΗ βελτιστοποίηση ανά κόμβο, όλη η μέρα. «Τέλεια γνώση»: ο ελεγκτής ξέρει ακριβώς ποια οχήματα θα φτάσουν σε όλο τον ορίζοντα. Στον δρόμο αυτό είναι αδύνατο· δείχνει το ανώτατο που μπορεί να δώσει οποιαδήποτε πρόβλεψη.\n\n| Κόμβος | Ανιχνευτές | Παραλλαγή | Σπόροι | Δ (εύρος) | Παραβάσεις ορίων |\n|---|---|---|---|---|---|\n';
  for (const f of files.filter(x => /^oracle-/.test(x)).sort()) { const m = f.match(/^oracle-(\w+)-b(\d)/); for (const r of load(f)) md += '| ' + short(m[1]) + ' | ' + (m[2] === '1' ? 'σημερινοί' : 'παντού') + ' | ' + r.name + ' | ' + r.n + ' | ' + f1(r.med) + ' (' + f1(r.min) + ' έως ' + f1(r.max) + ') | ' + r.safety + ' |\n'; }
  md += '\n## 1β. Αναζήτηση με γνώση όλης της αιχμής (07–09)\n\nΞεκινά από το πρόγραμμα του καλύτερου ελεγκτή και μετακινεί ή αφαιρεί αλλαγές φάσης μία μία, κρατώντας ό,τι μικραίνει τη συνολική αναμονή όλου του δικτύου. Ξέρει όλες τις αφίξεις της αιχμής εκ των προτέρων, άρα δεν είναι ελεγκτής που μπορεί να μπει στον δρόμο: είναι εκτίμηση του πόσο περιθώριο μένει. Είναι τοπική αναζήτηση, όχι απόδειξη βέλτιστου.\n\n| Κόμβος | Ανιχνευτές | Σπόρος | Κανόνες | Ανά κόμβο | Με γνώση όλης της αιχμής | Παραβάσεις ορίων |\n|---|---|---|---|---|---|---|\n';
  for (const f of files.filter(x => /^offline-/.test(x)).sort()) { const r = load(f), d = x => f1(100 * (x - r.fixed) / r.fixed); md += '| ' + short(r.site) + ' | ' + (r.blind ? 'σημερινοί' : 'παντού') + ' | ' + r.seed + ' | ' + d(r.adaptive) + ' | ' + d(r.optimal) + ' | ' + d(r.offline) + ' | ' + r.safety + ' |\n'; }
  md += '\n## 2. Ρύθμιση παραμέτρων από άλλες μέρες\n\nΟι παράμετροι διαλέγονται σε τυπική εργάσιμη και στην Παρασκευή 6/11 (άλλοι σπόροι) και ελέγχονται στην Τρίτη 3/11, 30 σπόροι.\n\n| Κόμβος | Ανιχνευτές | Ελεγκτής | Προεπιλογή | Ρυθμισμένος | Παράμετροι | Παραβάσεις ορίων |\n|---|---|---|---|---|---|---|\n';
  for (const f of files.filter(x => /^tune-/.test(x)).sort()) { const m = f.match(/^tune-(\w+)-b(\d)/), r = load(f); for (const c of ['adaptive', 'optimal']) md += '| ' + short(m[1]) + ' | ' + (m[2] === '1' ? 'σημερινοί' : 'παντού') + ' | ' + (c === 'adaptive' ? 'Κανόνες' : 'Ανά κόμβο') + ' | ' + f1(r[c].testDefault.med) + ' | ' + f1(r[c].testTuned.med) + ' | ' + JSON.stringify(r[c].best.p).replace(/"/g, '') + ' | ' + r[c].testTuned.safety + ' |\n'; }
  md += '\n## 3. Εκτιμώμενη ουρά όπου δεν υπάρχει ανιχνευτής\n\nΑντί ο κόμβος να μένει στο σταθερό πρόγραμμα, ο ελεγκτής κρατά εκτίμηση της ουράς από το προφίλ τυπικής ημέρας. «×0,5» σημαίνει ότι η εκτίμηση της ροής είναι η μισή από την πραγματική. Στις προσβάσεις χωρίς ανιχνευτή δεν υπάρχει πραγματικό ιστορικό· στην πράξη η εκτίμηση θα ερχόταν από μια προσωρινή καταμέτρηση.\n\n| Κόμβος | Ελεγκτής | Τι βλέπει | Σπόροι | Δ (εύρος) | Παραβάσεις ορίων |\n|---|---|---|---|---|---|\n';
  for (const f of files.filter(x => /^est-/.test(x)).sort()) { const m = f.match(/^est-(\w+)-/); for (const r of load(f)) md += '| ' + short(m[1]) + ' | ' + (r.ctrl === 'adaptive' ? 'Κανόνες' : 'Ανά κόμβο') + ' | ' + r.name.replace('.', ',') + ' | ' + r.n + ' | ' + f1(r.med) + ' (' + f1(r.min) + ' έως ' + f1(r.max) + ') | ' + r.safety + ' |\n'; }
  md += '\n## 4. Πού αξίζει ανιχνευτής\n\nΞεκινάμε χωρίς κανέναν ανιχνευτή (ο ελεγκτής δουλεύει μόνο με εκτίμηση από το ιστορικό) και προσθέτουμε κάθε φορά εκείνον που μικραίνει περισσότερο την αναμονή. Με αστερίσκο οι θέσεις που σήμερα δεν έχουν ανιχνευτή.\n\n';
  for (const f of files.filter(x => /^sensors-/.test(x)).sort()) {
    const r = load(f);
    md += '**' + short(r.site) + ', ' + (r.ctrl === 'adaptive' ? 'κανόνες' : 'βελτιστοποίηση ανά κόμβο') + '** (' + r.seeds + ' σπόροι)\n\n| Βήμα | Προστίθεται | Δ | Κέρδος βήματος | Παραβάσεις ορίων |\n|---|---|---|---|---|\n';
    r.steps.forEach((s, i) => { md += '| ' + i + ' | ' + (s.add ? s.add + (r.measured[s.add] ? '' : ' *') : 'κανένας (μόνο ιστορικό)') + ' | ' + f1(s.med) + ' | ' + (i ? f1(s.med - r.steps[i - 1].med).replace('%', ' μον.') : '—') + ' | ' + s.safety + ' |\n'; });
    md += '\n';
  }
  fs.writeFileSync(path.join(__dirname, '..', 'knowledge-base', 'results', 'experiment-frontier.md'), md);
  console.log(md);
}

const [cmd, A, B, C, Dd] = process.argv.slice(2);
if (cmd === 'oracle') oracle(A, +B, +C, +Dd);
else if (cmd === 'offline') offline(A, +B, +C);
else if (cmd === 'est') est(A, +B, +C);
else if (cmd === 'sensors') sensors(A, B, +C, +Dd);
else if (cmd === 'tune') tune(A, +B);
else if (cmd === 'report') report();
else console.log('βλ. σχόλια στην αρχή του αρχείου');
