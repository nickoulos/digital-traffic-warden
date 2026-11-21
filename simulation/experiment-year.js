// experiment-year.js — ΠΕΙΡΑΜΑ: ένα συνθετικό έτος (365 μέρες) φτιαγμένο από τις πραγματικές μετρήσεις 21/10–11/11/2026.
//   node experiment-year.js <site> [blind=1] [days=365]   → ../knowledge-base/results/raw/year/<site>-b<blind>.json
//   node experiment-year.js report                       → ../knowledge-base/results/experiment-year.md
// Κάθε μέρα: πραγματικό προφίλ ανάλογα με τον τύπο της ημέρας, τυχαία διακύμανση, εποχικότητα (ΠΑΡΑΔΟΧΗ),
// μερικές μέρες με γεγονός (+30–60% σε έναν δρόμο για 2–4 ώρες) και μερικές με βλάβη ανιχνευτή (1–6 ώρες).
// Σταθερό πρόγραμμα εναντίον Τροχονόμου (ctrl 'optimal'), ίδιες αφίξεις, έλεγχος ορίων ασφαλείας σε κάθε δευτερόλεπτο.
// Δεν αλλάζει κανέναν αριθμό της παρουσίασης. Κάθε αριθμός είναι ΠΡΟΣΟΜΟΙΩΣΗ πάνω σε ΣΥΝΘΕΤΙΚΕΣ μέρες.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { window: {}, module: { exports: {} }, Math, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app', 'data.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app', 'sim-core.js'), 'utf8'), ctx);
const DATA = ctx.window.DATA, Sim = ctx.module.exports;
const OUT = path.join(__dirname, '..', 'knowledge-base', 'results', 'raw', 'year');
const YEAR = 2027;

// Αργίες 2027 (Ελλάδα) — αντιμετωπίζονται ως Κυριακή. Ορθόδοξο Πάσχα 2/5/2027.
const HOLI = { '01-01': 'Πρωτοχρονιά', '01-06': 'Θεοφάνεια', '03-15': 'Καθαρά Δευτέρα', '03-25': '25η Μαρτίου', '04-30': 'Μεγάλη Παρασκευή',
  '05-01': 'Πρωτομαγιά', '05-03': 'Δευτέρα του Πάσχα', '06-21': 'Αγίου Πνεύματος', '08-15': 'Δεκαπενταύγουστος', '10-28': '28η Οκτωβρίου',
  '12-25': 'Χριστούγεννα', '12-26': 'Σύναξη Θεοτόκου' };

function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const pad = n => String(n).padStart(2, '0');

// Ίδιο σχέδιο ημερών για όλους τους κόμβους (ίδιο RNG), ώστε ένα «γεγονός» ή μια «βλάβη» να πέφτει στην ίδια μέρα παντού.
function yearPlan(nDays) {
  const r = mulberry(20270101), days = [];
  for (let i = 0; i < nDays; i++) {
    const d = new Date(Date.UTC(YEAR, 0, 1 + i)), md = pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()), dow = d.getUTCDay();
    const holiday = HOLI[md] || null, weekend = dow === 0 || dow === 6 || !!holiday;
    let base;
    if (holiday || dow === 0) base = r() < 0.5 ? 'we' : '2026-11-01';
    else if (dow === 6) base = 'we';
    else if (dow === 5) base = '2026-11-06';
    else base = r() < 0.5 ? 'wk' : '2026-11-03';
    let season = 1, seasonNote = '';
    if (d.getUTCMonth() === 7) { season = 0.75; seasonNote = 'Αύγουστος ×0,75'; }
    else if ((d.getUTCMonth() === 11 && d.getUTCDate() >= 20) || (d.getUTCMonth() === 0 && d.getUTCDate() <= 6)) { season = 0.85; seasonNote = 'γιορτές ×0,85'; }
    const factor = season * (0.85 + 0.30 * r());
    const per = r(), ev = r() < 24 / 365, evPick = r(), evStart = 7 + Math.floor(r() * 13), evDur = 2 + Math.floor(r() * 3), evMul = 1.3 + 0.3 * r();
    const fl = r() < 0.10, flPick = r(), flStart = 6 + 14 * r(), flDur = 1 + 5 * r();
    days.push({ i, date: YEAR + '-' + md, dow, type: weekend ? 'we' : 'wk', holiday, base, factor, seasonNote, perSeed: Math.floor(per * 1e9),
      event: ev ? { pick: evPick, from: evStart, to: Math.min(24, evStart + evDur), mul: evMul } : null,
      failure: fl ? { pick: flPick, from: flStart, to: Math.min(24, flStart + flDur) } : null });
  }
  return days;
}

function mkSafety(sim) {
  const P = sim.P, minG = [P.minGreenMain, P.minGreenSide], bad = [];
  const J = sim.net.juncs.map(() => ({ g: -2, len: 0, inter: 0, last: -1, greens: 0, redSince: [sim.t0, sim.t0] }));
  return { bad, tick() {
    const t = sim.t - 1;
    sim.sig.forEach((S, j) => {
      const s = J[j], g = S.g;
      if (g !== s.g) {
        if (s.g >= 0) { if (s.greens > 1 && s.len < minG[s.g]) bad.push('j' + j + ' t=' + t + ' πράσινο ' + s.len + ' s'); s.last = s.g; s.redSince[s.g] = t; s.inter = 0; }
        if (g >= 0) { if (s.last >= 0 && s.last !== g && s.inter < P.lost) bad.push('j' + j + ' t=' + t + ' ενδιάμεσος ' + s.inter + ' s'); s.len = 0; s.greens++; }
        s.g = g;
      }
      if (g >= 0) s.len++; else s.inter++;
      if (sim.mode(j) === 'adaptive') for (let p = 0; p < 2; p++) if (g !== p && t - s.redSince[p] > P.maxRed) { bad.push('j' + j + ' t=' + t + ' κόκκινο > ' + P.maxRed); s.redSince[p] = t; }
    });
  } };
}
const redLimit = sim => { let m = sim.P.maxRed; sim.plans.forEach(p => p.j.forEach(j => { m = Math.max(m, j.g0 + 2 * sim.P.lost + (p.dir ? p.C : 0), j.g1 + 2 * sim.P.lost); })); return m; };

function runSite(siteId, blind, nDays) {
  const site = DATA.sites.find(s => s.id === siteId);
  const refs = [], measured = [];
  site.junctions.forEach(j => j.approaches.forEach(a => { const ref = a.det || a.assume[0]; if (refs.indexOf(ref) < 0) refs.push(ref); if (a.det && measured.indexOf(a.det) < 0) measured.push(a.det); }));
  const plan = yearPlan(nDays), rows = [];
  const t0 = Date.now();
  for (const D of plan) {
    // συνθετικό προφίλ της ημέρας, κλειδί 'syn'
    const r = mulberry(D.perSeed);
    const evRef = D.event ? refs[Math.floor(D.event.pick * refs.length)] : null;
    refs.forEach(ref => {
      const src = DATA.detectors[ref].prof[D.base].f, k = D.factor * (0.95 + 0.10 * r()), f = new Array(src.length);
      for (let b = 0; b < src.length; b++) {
        let v = src[b] * k;
        if (ref === evRef) { const h = b * DATA.binMin / 60; if (h >= D.event.from && h < D.event.to) v *= D.event.mul; }
        f[b] = v;
      }
      DATA.detectors[ref].prof.syn = { f };
    });
    const SD = Object.assign({}, DATA, { days: DATA.days.concat([{ key: 'syn', type: D.type, label: D.date }]) });
    const params = { seed: D.i + 1, blind };
    const F = Sim.createSim(SD, siteId, 'syn', 0, 86400, params, 'fixed', null).run().summary();
    const sim = Sim.createSim(SD, siteId, 'syn', 0, 86400, params, 'optimal', null), safe = mkSafety(sim);
    const flDet = D.failure ? measured[Math.floor(D.failure.pick * measured.length)] : null;
    const fa = D.failure ? Math.round(D.failure.from * 3600) : -1, fb = D.failure ? Math.round(D.failure.to * 3600) : -1;
    while (!sim.done) { if (sim.t === fa) sim.failDetector(flDet); if (sim.t === fb) sim.restoreDetector(flDet); sim.step(); safe.tick(); }
    const A = sim.summary(), lim = redLimit(sim), red = Math.max(A.maxRed[0], A.maxRed[1]);
    rows.push({ date: D.date, dow: D.dow, type: D.type, holiday: D.holiday, base: D.base, factor: +D.factor.toFixed(3), season: D.seasonNote,
      event: D.event ? { det: evRef, from: D.event.from, to: D.event.to, mul: +D.event.mul.toFixed(2) } : null,
      failure: D.failure ? { det: flDet, from: +D.failure.from.toFixed(2), to: +D.failure.to.toFixed(2) } : null,
      arrived: F.arrived, fixed: +F.meanDelay.toFixed(2), adaptive: +A.meanDelay.toFixed(2),
      deltaPct: +(100 * (A.meanDelay - F.meanDelay) / F.meanDelay).toFixed(2), savedVehH: +(F.delayH - A.delayH).toFixed(2),
      maxRed: red, redLimit: lim, safety: safe.bad.length + (red > lim ? 1 : 0), conserved: F.conserved && A.conserved, firstBad: safe.bad[0] || null });
    if ((D.i + 1) % 30 === 0) console.log(siteId, 'b' + blind, D.date, ((Date.now() - t0) / 1000).toFixed(0) + ' s');
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, siteId + '-b' + blind + '.json'), JSON.stringify({ site: siteId, blind, year: YEAR, days: rows }, null, 0) + '\n');
  console.log('έγραψε', siteId + '-b' + blind + '.json', ((Date.now() - t0) / 1000).toFixed(0) + ' s');
}

function report() {
  const q = (xs, p) => { const s = xs.slice().sort((a, b) => a - b), i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
  const f1 = x => (x > 0 ? '+' : '') + x.toFixed(1).replace('.', ','), files = fs.readdirSync(OUT).filter(f => f.endsWith('.json')).sort();
  const order = ['kif-b1', 'iera-b1', 'iera-b0', 'alex-b1', 'alex-b0'];
  files.sort((a, b) => order.indexOf(a.replace('.json', '')) - order.indexOf(b.replace('.json', '')));
  let main = '', sub = '', worst = '';
  for (const file of files) {
    const J = JSON.parse(fs.readFileSync(path.join(OUT, file), 'utf8')), d = J.days, name = DATA.sites.find(s => s.id === J.site).short + (J.blind ? '' : ', ανιχνευτές παντού');
    const D = d.map(x => x.deltaPct), H = d.map(x => x.savedVehH), lose = d.filter(x => x.deltaPct > 0).length, viol = d.reduce((s, x) => s + x.safety, 0);
    const cons = d.every(x => x.conserved);
    main += '| ' + name + ' | ' + d.length + ' | ' + f1(q(D, 0.5)) + '% | ' + f1(q(D, 0.1)) + '% έως ' + f1(q(D, 0.9)) + '% | ' + f1(Math.max(...D)) + '% | ' + lose + ' | ' + Math.round(H.reduce((s, x) => s + x, 0)).toLocaleString('el-GR') + ' | ' + viol + (cons ? '' : ' ⚠ διατήρηση') + ' |\n';
    const grp = (label, pred) => { const g = d.filter(pred); if (!g.length) return; const gd = g.map(x => x.deltaPct); sub += '| ' + name + ' | ' + label + ' | ' + g.length + ' | ' + f1(q(gd, 0.5)) + '% | ' + f1(Math.max(...gd)) + '% | ' + g.filter(x => x.deltaPct > 0).length + ' |\n'; };
    grp('καθημερινές', x => x.type === 'wk' && !x.event && !x.failure);
    grp('Σαββατοκύριακα και αργίες', x => x.type === 'we' && !x.event && !x.failure);
    grp('Αύγουστος', x => x.date.slice(5, 7) === '08');
    grp('μέρες με γεγονός', x => !!x.event);
    grp('μέρες με βλάβη ανιχνευτή', x => !!x.failure);
    const w = d.slice().sort((a, b) => b.deltaPct - a.deltaPct)[0];
    worst += '| ' + name + ' | ' + w.date + ' | ' + f1(w.deltaPct) + '% | ' + (w.holiday || (w.type === 'we' ? 'Σαββατοκύριακο' : 'καθημερινή')) + ', βάση ' + w.base + ', ζήτηση ×' + String(w.factor).replace('.', ',') + (w.event ? ', γεγονός ' + w.event.det : '') + (w.failure ? ', βλάβη ' + w.failure.det : '') + ' |\n';
  }
  const md = '# Πείραμα: ένα συνθετικό έτος — ΠΡΟΣΟΜΟΙΩΣΗ σε ΣΥΝΘΕΤΙΚΕΣ μέρες\n\n' +
    'Παράγεται από `simulation/experiment-year.js`. 365 μέρες του ' + YEAR + ', φτιαγμένες από τις πραγματικές μετρήσεις 21/10–11/11/2026. Σταθερό πρόγραμμα εναντίον Τροχονόμου (βελτιστοποίηση), ίδιες αφίξεις, έλεγχος ορίων ασφαλείας σε κάθε δευτερόλεπτο.\n\n' +
    '**Πώς φτιάχνεται κάθε μέρα.** Καθημερινή: πραγματικό προφίλ της τυπικής καθημερινής ή της Τρίτης 3/11 (τυχαία)· Παρασκευή: της Παρασκευής 6/11· Σάββατο: του τυπικού Σαββατοκύριακου· Κυριακή και αργίες: του τυπικού Σαββατοκύριακου ή της Κυριακής 1/11. ' +
    'Πάνω σε αυτό: ζήτηση ×0,85 έως ×1,15 ανά μέρα, ±5% ανά ανιχνευτή, τυχαίες αφίξεις. **Παραδοχές εποχικότητας** (δεν έχουμε μετρήσεις): Αύγουστος ×0,75, 20/12–6/1 ×0,85. ' +
    'Περίπου 24 μέρες με γεγονός (+30 έως +60% σε έναν δρόμο για 2–4 ώρες) και περίπου 36 με βλάβη ενός ανιχνευτή για 1–6 ώρες. Το σταθερό πρόγραμμα είναι το ίδιο όλο τον χρόνο (σχεδιασμένο από την τυπική ημέρα).\n\n' +
    '**Τι δεν δείχνει.** Δεν είναι δεδομένα ενός έτους: όλες οι μέρες βγαίνουν από 3 εβδομάδες του φθινοπώρου. Δείχνει αν ο ελεγκτής αντέχει σε ασυνήθιστες μέρες, όχι πώς θα είναι η κίνηση τον Αύγουστο.\n\n' +
    '## Όλο το έτος\n\n| Κόμβος | Μέρες | Δ αναμονής (διάμεσος) | 80% των ημερών | Χειρότερη μέρα | Μέρες που χάνει | Οχηματοώρες στο έτος | Παραβάσεις ορίων ασφαλείας |\n|---|---|---|---|---|---|---|---|\n' + main +
    '\n## Ανά τύπο ημέρας\n\n| Κόμβος | Μέρες | Πλήθος | Δ (διάμεσος) | Χειρότερη | Χάνει |\n|---|---|---|---|---|---|\n' + sub +
    '\n## Η χειρότερη μέρα κάθε κόμβου\n\n| Κόμβος | Ημερομηνία | Δ | Τι είχε |\n|---|---|---|---|\n' + worst;
  fs.writeFileSync(path.join(__dirname, '..', 'knowledge-base', 'results', 'experiment-year.md'), md);
  console.log(md);
}

if (process.argv[2] === 'report') report();
else runSite(process.argv[2] || 'kif', process.argv[3] != null ? +process.argv[3] : 1, process.argv[4] != null ? +process.argv[4] : 365);
