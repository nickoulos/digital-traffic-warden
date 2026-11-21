// experiment-optimal.js — ΠΕΙΡΑΜΑ: κανόνες ('adaptive') εναντίον βελτιστοποίησης κυλιόμενου ορίζοντα ('optimal').
//   node experiment-optimal.js tune     δοκιμή παραμέτρων (ορίζοντας H, βάρος υπολοίπου W) στην Κηφισίας, σπόροι 1–10
//   node experiment-optimal.js [H] [W]  πλήρης σύγκριση, 30 σπόροι, και οι τρεις κόμβοι
// Δεν αλλάζει κανέναν αριθμό της παρουσίασης. Κάθε αριθμός είναι ΠΡΟΣΟΜΟΙΩΣΗ.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { window: {}, module: { exports: {} }, Math, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app', 'data.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app', 'sim-core.js'), 'utf8'), ctx);
const DATA = ctx.window.DATA, Sim = ctx.module.exports;
const med = xs => { const s = xs.slice().sort((a, b) => a - b), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const f1 = x => (x > 0 ? '+' : '') + x.toFixed(1);

// τρέχει με έλεγχο ορίων σε κάθε βήμα: ελάχιστο πράσινο, ενδιάμεσος χρόνος, ανώτατη αναμονή
function run(site, day, from, to, params, ctrl) {
  const sim = Sim.createSim(DATA, site, day, from * 3600, to * 3600, params, ctrl, null), P = sim.P, minG = [P.minGreenMain, P.minGreenSide];
  const st = sim.net.juncs.map(() => ({ g: -2, len: 0, inter: 0, last: -1, n: 0 })); let bad = 0;
  while (!sim.done) {
    sim.step();
    sim.sig.forEach((S, j) => {
      const s = st[j];
      if (S.g !== s.g) {
        if (s.g >= 0) { if (s.n > 1 && s.len < minG[s.g]) bad++; s.last = s.g; s.inter = 0; }
        if (S.g >= 0) { if (s.last >= 0 && s.last !== S.g && s.inter < P.lost) bad++; s.n++; s.len = 0; }
        s.g = S.g;
      }
      if (S.g >= 0) s.len++; else s.inter++;
    });
  }
  const r = sim.summary(); if (!r.conserved) throw new Error('διατήρηση οχημάτων');
  let sq = 0, sn = 0; r.per.forEach((p, i) => { if (sim.net.apps[i].phase === 1) { sq += p.delay * p.arrived; sn += p.arrived; } });
  return { delay: r.meanDelay, h: r.delayH, red: Math.max(r.maxRed[0], r.maxRed[1]), bad, side: sn ? sq / sn : 0 };
}
function compare(site, day, from, to, seeds, opt) {
  const dR = [], dO = [], hR = [], hO = [], sF = [], sR = [], sO = []; let winsR = 0, winsO = 0, oBeatsR = 0, red = 0, bad = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const F = run(site, day, from, to, { seed }, 'fixed'), R = run(site, day, from, to, { seed }, 'adaptive'), O = run(site, day, from, to, Object.assign({ seed }, opt), 'optimal');
    dR.push(100 * (R.delay - F.delay) / F.delay); dO.push(100 * (O.delay - F.delay) / F.delay); hR.push(F.h - R.h); hO.push(F.h - O.h);
    if (R.delay < F.delay) winsR++; if (O.delay < F.delay) winsO++; if (O.delay < R.delay) oBeatsR++;
    red = Math.max(red, O.red); bad += O.bad; sF.push(F.side); sR.push(R.side); sO.push(O.side);
  }
  return { dR: med(dR), dO: med(dO), hR: med(hR), hO: med(hO), winsR, winsO, oBeatsR, red, bad, sF: med(sF), sR: med(sR), sO: med(sO), minO: Math.min(...dO), maxO: Math.max(...dO) };
}

if (process.argv[2] === 'tune') {
  console.log('Κηφισίας × Πανόρμου, Τρίτη 3/11, σπόροι 1–4. Δ = μεταβολή αναμονής έναντι σταθερού (διάμεσος).');
  for (const H of [60, 120]) for (const W of [0, 20]) {
    const d = compare('kif', '2026-11-03', 0, 24, 4, { optH: H, optW: W }), am = compare('kif', '2026-11-03', 7, 10, 4, { optH: H, optW: W });
    console.log('H=' + H + ' W=' + W + '  όλη η μέρα: βελτιστοπ. ' + f1(d.dO) + '% (κανόνες ' + f1(d.dR) + '%)  07–10: ' + f1(am.dO) + '% (κανόνες ' + f1(am.dR) + '%)  μέγ. κόκκινο ' + d.red + ' s, παραβάσεις ' + (d.bad + am.bad));
  }
} else {
  const opt = { optH: +(process.argv[2] || 120), optW: +(process.argv[3] || 0) }, rows = [];
  for (const site of ['kif', 'iera', 'alex']) for (const w of [['όλη η μέρα', 0, 24], ['07–10', 7, 10], ['16–19', 16, 19]]) {
    const c = compare(site, '2026-11-03', w[1], w[2], 30, opt);
    rows.push('| ' + DATA.sites.find(s => s.id === site).short + ' | ' + w[0] + ' | ' + f1(c.dR) + '% | ' + f1(c.dO) + '% (' + f1(c.minO) + ' έως ' + f1(c.maxO) + ') | ' + c.hR.toFixed(1) + ' | ' + c.hO.toFixed(1) + ' | ' + c.winsR + '/30 | ' + c.winsO + '/30 | ' + c.oBeatsR + '/30 | ' + c.red + ' | ' + c.bad + ' | ' + c.sF.toFixed(0) + ' / ' + c.sR.toFixed(0) + ' / ' + c.sO.toFixed(0) + ' |');
    console.log(rows[rows.length - 1]);
  }
  const md = '# Πείραμα: κανόνες εναντίον βελτιστοποίησης — ΠΡΟΣΟΜΟΙΩΣΗ\n\nΠαράγεται από `simulation/experiment-optimal.js ' + opt.optH + ' ' + opt.optW + '`. Τρίτη 3/11/2026, 30 σπόροι, σημερινοί ανιχνευτές.\n' +
    'Βελτιστοποίηση κυλιόμενου ορίζοντα ' + opt.optH + ' s, βάρος υπολοίπου ουράς ' + opt.optW + ' s. Δ = μεταβολή μέσης αναμονής έναντι του σταθερού προγράμματος (διάμεσος).\n\n' +
    '| Κόμβος | Διάστημα | Δ κανόνες | Δ βελτιστοποίηση (εύρος) | Οχηματοώρες κανόνες | Οχηματοώρες βελτιστ. | Κανόνες καλύτεροι από σταθερό | Βελτιστ. καλύτερη από σταθερό | Βελτιστ. καλύτερη από κανόνες | Μέγ. κόκκινο βελτιστ. (s) | Παραβάσεις ορίων | Αναμονή κάθετης: σταθερό / κανόνες / βελτιστ. (s) |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n' + rows.join('\n') + '\n';
  fs.writeFileSync(path.join(__dirname, '..', 'knowledge-base', 'results', 'experiment-optimal.md'), md);
  console.log('έγραψε knowledge-base/results/experiment-optimal.md');
}
