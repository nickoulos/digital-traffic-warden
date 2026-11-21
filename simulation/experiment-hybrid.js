// experiment-hybrid.js — ΠΕΙΡΑΜΑ: τι προσθέτουν (α) πρόβλεψη από ιστορικό, (β) εικόνα δικτύου, (γ) ανιχνευτές σε κάθε πρόσβαση.
//   node experiment-hybrid.js        Τρίτη 3/11, όλη η μέρα, 30 σπόροι, και οι τρεις κόμβοι → ../knowledge-base/results/experiment-hybrid.md
// Δεν αλλάζει κανέναν αριθμό της παρουσίασης. Κάθε αριθμός είναι ΠΡΟΣΟΜΟΙΩΣΗ.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { window: {}, module: { exports: {} }, Math, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app', 'data.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app', 'sim-core.js'), 'utf8'), ctx);
const DATA = ctx.window.DATA, Sim = ctx.module.exports, SEEDS = 30, DAY = '2026-11-03';
const med = xs => { const s = xs.slice().sort((a, b) => a - b), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const f1 = x => (x > 0 ? '+' : '') + x.toFixed(1);
function run(site, params, ctrl) {
  const s = Sim.createSim(DATA, site, DAY, 0, 86400, params, ctrl, null).run().summary();
  if (!s.conserved) throw new Error('διατήρηση οχημάτων');
  return s;
}
const VARIANTS = [
  { id: 'base', label: 'Βελτιστοποίηση (βάση)', p: {} },
  { id: 'hist', label: '+ πρόβλεψη από ιστορικό', p: { optF: 1 } },
  { id: 'net', label: '+ εικόνα δικτύου', p: { optNet: 1 } },
  { id: 'both', label: '+ και τα δύο (υβριδικό)', p: { optF: 1, optNet: 1 } },
];
const rows = [];
for (const site of DATA.sites) for (const blind of [1, 0]) {
  const F = []; for (let seed = 1; seed <= SEEDS; seed++) F.push(run(site.id, { seed }, 'fixed'));
  let base = null;
  for (const v of VARIANTS) {
    if (site.kind !== 'corridor' && (v.id === 'net' || v.id === 'both')) continue;      // μονός κόμβος: δεν υπάρχει δίκτυο να δει
    const D = [], H = []; let wins = 0, red = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const o = run(site.id, Object.assign({ seed, blind }, v.p), 'optimal'), f = F[seed - 1];
      D.push(100 * (o.meanDelay - f.meanDelay) / f.meanDelay); H.push(f.delayH - o.delayH); if (o.meanDelay < f.meanDelay) wins++;
      red = Math.max(red, o.maxRed[0], o.maxRed[1]);
    }
    if (v.id === 'base') base = D;
    const better = D.filter((d, i) => d < base[i]).length;
    const line = '| ' + site.short + ' | ' + (blind ? 'σημερινοί' : 'σε κάθε πρόσβαση') + ' | ' + v.label + ' | ' + f1(med(D)) + '% (' + f1(Math.min(...D)) + ' έως ' + f1(Math.max(...D)) + ') | ' + med(H).toFixed(1) + ' | ' + wins + '/' + SEEDS + ' | ' + (v.id === 'base' ? '—' : better + '/' + SEEDS) + ' | ' + red + ' |';
    rows.push(line); console.log(line);
  }
}
const md = '# Πείραμα: ιστορικό, εικόνα δικτύου, περισσότεροι ανιχνευτές — ΠΡΟΣΟΜΟΙΩΣΗ\n\nΠαράγεται από `simulation/experiment-hybrid.js`. Τρίτη 3/11/2026, όλη η μέρα, ' + SEEDS + ' σπόροι.\n' +
  'Δ = μεταβολή μέσης αναμονής έναντι του σταθερού προγράμματος (διάμεσος, εύρος). «Καλύτερο από τη βάση» = σε πόσους σπόρους η παραλλαγή δίνει λιγότερη αναμονή από τη σκέτη βελτιστοποίηση.\n\n' +
  '- **Πρόβλεψη από ιστορικό:** η ροή του επόμενου δίλεπτου = προφίλ τυπικής ημέρας, διορθωμένο με το πόσο απέχει το τελευταίο 5λεπτο από το τυπικό. Η βάση χρησιμοποιεί μόνο το τελευταίο 5λεπτο. Το τυπικό προφίλ περιέχει και την ίδια την Τρίτη 3/11 (μία από 11 εργάσιμες).\n' +
  '- **Εικόνα δικτύου:** κάθε κόμβος γνωρίζει τα οχήματα που του έχει ήδη στείλει ο προηγούμενος κόμβος, αντί να τα βλέπει 6 s πριν φτάσουν. Δεν είναι κοινή βελτιστοποίηση όλων των κόμβων μαζί.\n' +
  '- **Ανιχνευτές σε κάθε πρόσβαση:** ο ελεγκτής βλέπει και ελέγχει όλους τους κόμβους· η ζήτηση στις προσβάσεις χωρίς ανιχνευτή σήμερα είναι παραδοχή.\n\n' +
  '| Κόμβος | Ανιχνευτές | Ελεγκτής | Δ (εύρος) | Οχηματοώρες/ημέρα | Καλύτερο από σταθερό | Καλύτερο από τη βάση | Μέγ. κόκκινο (s) |\n|---|---|---|---|---|---|---|---|\n' + rows.join('\n') + '\n';
fs.writeFileSync(path.join(__dirname, '..', 'knowledge-base', 'results', 'experiment-hybrid.md'), md);
console.log('έγραψε knowledge-base/results/experiment-hybrid.md');
