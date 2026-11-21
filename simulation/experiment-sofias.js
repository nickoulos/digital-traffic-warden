// experiment-sofias.js — ΠΕΙΡΑΜΑ: η Λ. Βασιλίσσης Σοφίας από την Ακαδημίας ως τους Αμπελόκηπους, με όλα τα φανάρια της.
// Η διασταύρωση του Συντάγματος (Αμαλίας, Πανεπιστημίου) ΔΕΝ μοντελοποιείται: με 3.400 οχ/ώρα στην Αμαλίας και 2.900 στη Βασ. Σοφίας δεν χωρά
// σε μοντέλο δύο φάσεων (στον δρόμο οι κινήσεις της έχουν δικές τους λωρίδες και φάσεις). Ο άξονας αρχίζει αμέσως μετά.
//   node experiment-sofias.js export            → sofias-data.js (ο άξονας και τα προφίλ ροής, για το control.html)
//   node experiment-sofias.js run <seed>        → ../knowledge-base/results/raw/sofias/run-<seed>.json
//   node experiment-sofias.js report            → ../knowledge-base/results/experiment-sofias.md
// ΠΡΑΓΜΑΤΙΚΑ: οι θέσεις των 14 σηματοδοτούμενων διασταυρώσεων και οι αποστάσεις τους (OpenStreetMap)· οι ροές της λεωφόρου και στις δύο
//   κατευθύνσεις από ανιχνευτές της Περιφέρειας· οι ροές τριών κάθετων (Βασ. Κωνσταντίνου, Ζαχάρωφ, Αλεξάνδρας).
// ΠΑΡΑΔΟΧΕΣ: κάθε διασταύρωση έχει δύο φάσεις (λεωφόρος / κάθετη) και οι στροφές δεν μοντελοποιούνται· η κίνηση στις κάθετες χωρίς
//   ανιχνευτή είναι ποσοστό της λεωφόρου (30% μεγάλες οδοί, 15–20% μικρότερες, 3% σκέτες διαβάσεις πεζών)· οι λωρίδες· και το σταθερό
//   πρόγραμμα είναι δικός μας συντονισμένος σχεδιασμός (Webster, κοινός κύκλος, πράσινο κύμα), όχι το ισχύον.
// Η διάβαση στο ύψος της Γενναδίου (67 m από τη Βασ. Κωνσταντίνου) ενώνεται με αυτήν. Κάθε αριθμός είναι ΠΡΟΣΟΜΟΙΩΣΗ.
const fs = require('fs'), path = require('path'), vm = require('vm'), zlib = require('zlib');
const ctx = { window: {}, module: { exports: {} }, Math, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app', 'data.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app', 'sim-core.js'), 'utf8'), ctx);
const DATA = ctx.window.DATA, Sim = ctx.module.exports, DAY = '2026-11-03', NB = 288;
const OUT = path.join(__dirname, '..', 'knowledge-base', 'results', 'raw', 'sofias');

// Διασταυρώσεις από δυτικά (Ακαδημίας) προς ανατολικά (Αμπελόκηποι). d = απόσταση από την προηγούμενη (m). E = προς Αμπελόκηπους, W = προς Σύνταγμα.
// e / w: ανιχνευτής της λεωφόρου πριν από τη διασταύρωση· με «~» ο πιο κοντινός της ίδιας κατεύθυνσης όταν δεν υπάρχει δικός της (παραδοχή).
// side: ανιχνευτής της κάθετης ή ποσοστό της ροής της λεωφόρου (παραδοχή).
const J = [
  { id: 'ak', name: 'Ακαδημίας', lat: 37.97603, lon: 23.73768, d: 0, e: 'MS365', w: 'MS390', side: 0.15, sl: 1, sn: 'Ακαδημίας' },
  { id: 'ko', name: 'Κουμπάρη', lat: 37.97568, lon: 23.74054, d: 253, e: 'MS391', w: '~MS390', side: 0.15, sl: 1, sn: 'Κουμπάρη' },
  { id: 'rg', name: 'Ρηγίλλης', lat: 37.97532, lon: 23.74310, d: 228, e: '~MS393', w: '~MS394', side: 0.15, sl: 1, sn: 'Ρηγίλλης' },
  { id: 'rz', name: 'Ριζάρη', lat: 37.97597, lon: 23.74581, d: 248, e: 'MS393', w: 'MS394', side: 0.25, sl: 2, sn: 'Ριζάρη / Πλουτάρχου' },
  { id: 'ma', name: 'Μαρασλή', lat: 37.97631, lon: 23.74703, d: 113, e: '~MS246', w: '~MS245', side: 0.15, sl: 1, sn: 'Μαρασλή' },
  { id: 'vk', name: 'Βασ. Κωνσταντίνου (Χίλτον)', lat: 37.97630, lon: 23.74956, d: 230, e: 'MS246', w: 'MS245', side: 'MS243', sl: 3, sn: 'Βασ. Κωνσταντίνου' },
  { id: 'pp', name: 'Παπαδιαμαντοπούλου', lat: 37.97816, lon: 23.75217, d: 308, e: 'MS248', w: 'MS249', side: 0.2, sl: 2, sn: 'Παπαδιαμαντοπούλου' },
  { id: 'db', name: 'Διάβαση (Ιπποκράτειο)', lat: 37.97986, lon: 23.75398, d: 246, e: '~MS248', w: '~MS249', side: 0.03, sl: 1, sn: 'διάβαση πεζών' },
  { id: 'se', name: 'Σεμιτέλου', lat: 37.98122, lon: 23.75519, d: 185, e: '~MS251', w: '~MS252', side: 0.15, sl: 1, sn: 'Σεμιτέλου / Κόκκαλη' },
  { id: 'so', name: 'Δημ. Σούτσου', lat: 37.98210, lon: 23.75620, d: 131, e: 'MS251', w: 'MS252', side: 0.2, sl: 2, sn: 'Δημ. Σούτσου' },
  { id: 'do', name: 'Δορυλαίου', lat: 37.98278, lon: 23.75730, d: 123, e: '~MS207', w: '~MS252', side: 0.1, sl: 1, sn: 'Δορυλαίου' },
  { id: 'ts', name: 'Τσόχα', lat: 37.98427, lon: 23.75935, d: 244, e: 'MS207', w: '~MS254', side: 0.15, sl: 1, sn: 'Αν. Τσόχα' },
  { id: 'me', name: 'Μεσογείων (Ζαχάρωφ)', lat: 37.98520, lon: 23.76039, d: 138, e: 'MS253', w: 'MS254', side: 'MS432', sl: 2, sn: 'Ζαχάρωφ' },
  { id: 'al', name: 'Αλεξάνδρας (Αμπελόκηποι)', lat: 37.98635, lon: 23.76149, d: 160, e: 'MS255', w: 'MS256', side: 'MS257', sl: 3, sn: 'Λ. Αλεξάνδρας' }
];
const DETS = new Set(); J.forEach(j => [j.e, j.w, j.side].forEach(x => { if (typeof x === 'string') DETS.add(x.replace('~', '')); }));

function addDetectors(ids) {                 // ίδια μέθοδος με το build_data.py: μέση τιμή 5λέπτου, διάμεσος εργάσιμων, γραμμική παρεμβολή στα κενά
  const raw = {}; ids.forEach(id => { raw[id] = {}; });
  const files = new Set(); DATA.wkDates.concat(DAY).forEach(d => { files.add(d); files.add(new Date(Date.parse(d + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10)); });
  files.forEach(f => {
    const p = path.join(__dirname, '..', 'data', 'traffic', f + '.csv.gz'); if (!fs.existsSync(p)) return;
    zlib.gunzipSync(fs.readFileSync(p)).toString('utf8').split('\n').forEach(l => {
      const r = l.split(','); if (r.length < 6 || r[1] !== 'all' || !raw[r[0]] || r[3] === '') return;
      const t = new Date(Date.parse(r[2]) + 2 * 3600e3), date = t.toISOString().slice(0, 10), b = Math.floor((t.getUTCHours() * 60 + t.getUTCMinutes()) / 5);
      const day = raw[r[0]][date] || (raw[r[0]][date] = { s: new Array(NB).fill(0), n: new Array(NB).fill(0) });
      day.s[b] += +r[3]; day.n[b]++;
    });
  });
  const fill = a => { const idx = a.map((v, i) => v == null ? -1 : i).filter(i => i >= 0); if (!idx.length) throw new Error('ανιχνευτής χωρίς δεδομένα'); return a.map((v, i) => { if (v != null) return Math.round(v); let lo = -1, hi = -1; for (const k of idx) { if (k < i) lo = k; else if (hi < 0) hi = k; } return Math.round(lo < 0 ? a[hi] : hi < 0 ? a[lo] : a[lo] + (a[hi] - a[lo]) * (i - lo) / (hi - lo)); }); };
  const out = {};
  ids.forEach(id => {
    const ser = d => { const x = raw[id][d]; return x ? x.s.map((v, i) => x.n[i] ? v / x.n[i] : null) : new Array(NB).fill(null); };
    const per = DATA.wkDates.map(ser), medv = []; for (let b = 0; b < NB; b++) { const v = per.map(p => p[b]).filter(x => x != null).sort((x, y) => x - y); medv.push(v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null); }
    out[id] = { prof: { wk: { f: fill(medv) }, [DAY]: { f: fill(ser(DAY)) } } };
  });
  return out;
}
function buildSite() {
  const ap = (o) => Object.assign({ assume: null, up: null }, o);
  const main = (spec) => spec[0] === '~' ? { det: null, assume: [spec.slice(1), 1] } : { det: spec, assume: null };
  return { id: 'sofias', short: 'Λ. Βασ. Σοφίας (Ακαδημίας – Αμπελόκηποι)', mainName: 'Λ. Βασ. Σοφίας', junctions: J.map((j, k) => {
    const A = [], ref = (j.w || j.e).replace('~', '');
    if (j.e) A.push(ap(Object.assign({ id: j.id + '_E', dir: 'E', phase: 0, lanes: 3, label: 'Βασ. Σοφίας → Αμπελόκηποι' }, main(j.e), k > 0 && J[k - 1].e ? { up: J[k - 1].id + '_E', upDist: j.d } : {})));
    if (j.w) A.push(ap(Object.assign({ id: j.id + '_W', dir: 'W', phase: 0, lanes: 3, label: 'Βασ. Σοφίας → Σύνταγμα' }, main(j.w), k < J.length - 1 ? { up: J[k + 1].id + '_W', upDist: J[k + 1].d } : {})));
    A.push(ap(Object.assign({ id: j.id + '_S', dir: 'S', phase: 1, lanes: j.sl, label: j.sn + (typeof j.side === 'string' ? '' : ' (παραδοχή)') }, typeof j.side === 'string' ? { det: j.side } : { det: null, assume: [ref, j.side] })));
    return { id: j.id, name: j.name, lat: j.lat, lon: j.lon, approaches: A };
  }) };
}
const DET = addDetectors([...DETS]);
for (const d in DET) DATA.detectors[d] = DET[d];
DATA.sites.push(buildSite());

function mkSafety(sim) {
  const P = sim.P, minG = [P.minGreenMain, P.minGreenSide], bad = [];
  const S = sim.net.juncs.map(() => ({ g: -2, len: 0, inter: 0, last: -1, greens: 0, redSince: [sim.t0, sim.t0] }));
  return { bad, tick() {
    const t = sim.t - 1;
    sim.sig.forEach((X, j) => {
      const s = S[j], g = X.g;
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
// Σενάρια. blind 1 = οι σημερινοί ανιχνευτές· est = εκτιμώμενη ουρά στις προσβάσεις χωρίς ανιχνευτή (1 = σωστή κατά μέσο όρο).
const SCEN = [
  { key: 'fixed', name: 'Ρολόι σε όλα (συντονισμένο)', ctrl: 'fixed', p: {} },
  { key: 'opt-now', name: 'Σημερινοί ανιχνευτές: Τροχονόμος μόνο όπου υπάρχει ανιχνευτής στην κάθετη', ctrl: 'optimal', p: { blind: 1 } },
  { key: 'rules-now', name: 'Σημερινοί ανιχνευτές: απλοί κανόνες μόνο όπου υπάρχει ανιχνευτής στην κάθετη', ctrl: 'adaptive', p: { blind: 1 } },
  { key: 'rules-est', name: 'Σημερινοί ανιχνευτές + εκτίμηση ουράς στις κάθετες: απλοί κανόνες σε όλα', ctrl: 'adaptive', p: { blind: 1, est: 1 } },
  { key: 'opt-est', name: 'Σημερινοί ανιχνευτές + εκτίμηση ουράς στις κάθετες: Τροχονόμος σε όλα', ctrl: 'optimal', p: { blind: 1, est: 1 } },
  { key: 'opt-est-lo', name: '… με εκτίμηση τη μισή από την πραγματική', ctrl: 'optimal', p: { blind: 1, est: 0.5 } },
  { key: 'opt-est-hi', name: '… με εκτίμηση διπλάσια από την πραγματική', ctrl: 'optimal', p: { blind: 1, est: 2 } },
  { key: 'coord-est', name: 'Σημερινοί ανιχνευτές + εκτίμηση: συντονισμένος Τροχονόμος (κρατά το πράσινο κύμα)', ctrl: 'coord', p: { blind: 1, est: 1 } },
  { key: 'opt-all', name: 'Ανιχνευτής σε κάθε πρόσβαση: Τροχονόμος σε όλα', ctrl: 'optimal', p: { blind: 0 } },
  { key: 'rules-all', name: 'Ανιχνευτής σε κάθε πρόσβαση: απλοί κανόνες σε όλα', ctrl: 'adaptive', p: { blind: 0 } }
];
function one(seed, sc) {
  const sim = Sim.createSim(DATA, 'sofias', DAY, 0, 86400, Object.assign({ seed }, sc.p), sc.ctrl, null), safe = mkSafety(sim);
  while (!sim.done) { sim.step(); safe.tick(); }
  const s = sim.summary(), g = { main: [0, 0], side: [0, 0] }, perJ = sim.net.juncs.map(() => 0);
  s.per.forEach((p, i) => { const A = sim.net.apps[i], w = p.delay * p.arrived, m = A.phase === 0 ? 'main' : 'side'; g[m][0] += w; g[m][1] += p.arrived; perJ[A.j] += w / 3600; });
  // χρόνος διαδρομής στη λεωφόρο: άθροισμα της μέσης αναμονής ανά διασταύρωση, ανά κατεύθυνση
  const trip = { E: 0, W: 0 }; s.per.forEach((p, i) => { const A = sim.net.apps[i]; if (A.phase === 0) trip[A.dir] += p.delay; });
  return { h: s.delayH, delay: s.meanDelay, main: g.main[0] / g.main[1], side: g.side[0] / g.side[1], tripE: trip.E, tripW: trip.W, stops: s.stopsPct, perJ, arrived: s.arrived,
    ctl: sim.net.juncs.filter((x, j) => sim.mode(j) === 'adaptive').length, safety: safe.bad.length + (s.conserved ? 0 : 1), maxRed: s.maxRed };
}
function run(seed) { const r = { seed }; SCEN.forEach(sc => { r[sc.key] = one(seed, sc); }); fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'run-' + seed + '.json'), JSON.stringify(r) + '\n'); }
function report() {
  const rows = fs.readdirSync(OUT).filter(f => /^run-\d+\.json$/.test(f)).map(f => JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')));
  const med = xs => { const s = xs.slice().sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
  const pc = x => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(1).replace('.', ',') + '%', f0 = x => Math.round(x).toLocaleString('el-GR'), f1 = x => x.toFixed(1).replace('.', ',');
  const d = (k, f) => med(rows.map(r => 100 * (f(r[k]) - f(r.fixed)) / f(r.fixed)));
  const total = J.reduce((s, j) => s + j.d, 0), sideDet = J.filter(j => typeof j.side === 'string').length;
  let md = '# Πείραμα: ολόκληρη η Λ. Βασιλίσσης Σοφίας — ΠΡΟΣΟΜΟΙΩΣΗ\n\nΠαράγεται από `simulation/experiment-sofias.js`. Τρίτη 3/11/2026, όλη η μέρα, ' + rows.length + ' σπόροι. ' +
    'Από την Ακαδημίας ως τους Αμπελόκηπους (η διασταύρωση του Συντάγματος δεν μοντελοποιείται): ' + J.length + ' διασταυρώσεις με φανάρι σε ' + f1(total / 1000) + ' km, ' + f0(med(rows.map(r => r.fixed.arrived))) + ' διελεύσεις οχημάτων από φανάρι τη μέρα. Δ = μεταβολή έναντι συντονισμένου σταθερού προγράμματος σε όλα τα φανάρια (διάμεσος).\n\n' +
    '**Πραγματικά:** οι θέσεις και οι αποστάσεις των διασταυρώσεων (OpenStreetMap), οι ροές της λεωφόρου και στις δύο κατευθύνσεις (' + [...DETS].length + ' ανιχνευτές μαζί με των κάθετων) και οι ροές ' + sideDet + ' κάθετων. ' +
    '**Παραδοχές:** δύο φάσεις ανά διασταύρωση χωρίς στροφές, η κίνηση στις ' + (J.length - sideDet) + ' κάθετες χωρίς ανιχνευτή (ποσοστό της λεωφόρου), οι λωρίδες, και το σταθερό πρόγραμμα (δικός μας συντονισμένος σχεδιασμός, όχι το ισχύον).\n\n' +
    '| Σενάριο | Φανάρια που ελέγχονται | Δ συνολικής αναμονής | Ώρες/ημέρα που γλιτώνουν | Αναμονή στη λεωφόρο ανά φανάρι (s) | Αναμονή στις κάθετες (s) | Στάσεις | Καλύτερο από ρολόι | Παραβάσεις ορίων |\n|---|---|---|---|---|---|---|---|---|\n';
  SCEN.forEach(sc => { const k = sc.key;
    md += '| ' + sc.name + ' | ' + (k === 'fixed' ? '0' : med(rows.map(r => r[k].ctl))) + ' / ' + J.length + ' | ' + (k === 'fixed' ? f1(med(rows.map(r => r.fixed.h))) + ' ώρες' : pc(d(k, x => x.h))) + ' | ' + (k === 'fixed' ? '—' : f1(med(rows.map(r => r.fixed.h - r[k].h)))) + ' | ' +
      f1(med(rows.map(r => r[k].main))) + ' | ' + f1(med(rows.map(r => r[k].side))) + ' | ' + f1(med(rows.map(r => r[k].stops))) + '% | ' + (k === 'fixed' ? '—' : rows.filter(r => r[k].h < r.fixed.h).length + '/' + rows.length) + ' | ' + rows.reduce((s, r) => s + r[k].safety, 0) + ' |\n'; });
  md += '\n## Ανά διασταύρωση: ώρες αναμονής τη μέρα\n\n| Διασταύρωση | Κάθετη | Ρολόι | Τροχονόμος με εκτίμηση ουράς | Τροχονόμος με ανιχνευτή παντού |\n|---|---|---|---|---|\n';
  J.forEach((j, i) => { md += '| ' + j.name + ' | ' + j.sn + (typeof j.side === 'string' ? ' (ανιχνευτής ' + j.side + ')' : ' (παραδοχή ' + Math.round(j.side * 100) + '%)') + ' | ' + f1(med(rows.map(r => r.fixed.perJ[i]))) + ' | ' + f1(med(rows.map(r => r['opt-est'].perJ[i]))) + ' | ' + f1(med(rows.map(r => r['opt-all'].perJ[i]))) + ' |\n'; });
  fs.writeFileSync(path.join(__dirname, '..', 'knowledge-base', 'results', 'experiment-sofias.md'), md); console.log(md);
}
const cmd = process.argv[2];
if (cmd === 'export') { fs.writeFileSync(path.join(__dirname, '..', 'app', 'sofias-data.js'), '// Παράγεται από το experiment-sofias.js export. Ο άξονας Λ. Βασ. Σοφίας: βλ. παραδοχές στο experiment-sofias.js.\nwindow.SOFIAS = ' + JSON.stringify({ site: DATA.sites[DATA.sites.length - 1], detectors: DET }) + ';\n'); console.log('sofias-data.js'); }
else if (cmd === 'run') run(+process.argv[3]); else if (cmd === 'report') report(); else console.log('βλ. σχόλια στην αρχή του αρχείου');
