// experiment-network.js — ΠΕΙΡΑΜΑ: βελτιστοποίηση ανά κόμβο εναντίον κοινής βελτιστοποίησης όλου του δικτύου.
//   node experiment-network.js run <site> <blind> <ctrl> <seedFrom> <seedTo>   → ../knowledge-base/results/raw/network/<site>-b<blind>-<ctrl>-<from>.json
//   node experiment-network.js report                                         → ../knowledge-base/results/experiment-network.md
// Ελεγκτές: 'fixed' σταθερό · 'adaptive' τρεις απλοί κανόνες · 'optimal' βελτιστοποίηση ανά κόμβο (ο ελεγκτής του pitch)
//           'netplan' κοινό πρόγραμμα δικτύου: κύκλος, πράσινα και μετατοπίσεις όλων των φαναριών, κάθε 60 s, ελάχιστη συνολική αναμονή 5 λεπτών
//           'network' κοινή απόφαση ανά δευτερόλεπτο: πότε αλλάζει κάθε φανάρι, με κόστος όλο το δίκτυο
// Τρίτη 3/11, όλη η μέρα. Έλεγχος ορίων ασφαλείας σε κάθε δευτερόλεπτο. Κάθε αριθμός είναι ΠΡΟΣΟΜΟΙΩΣΗ.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { window: {}, module: { exports: {} }, Math, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app', 'data.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app', 'sim-core.js'), 'utf8'), ctx);
const DATA = ctx.window.DATA, Sim = ctx.module.exports, DAY = '2026-11-03';
const OUT = path.join(__dirname, '..', 'knowledge-base', 'results', 'raw', 'network');

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

function run(site, blind, ctrl, a, b) {
  const rows = [];
  for (let seed = a; seed <= b; seed++) {
    const sim = Sim.createSim(DATA, site, DAY, 0, 86400, { seed, blind }, ctrl, null), safe = mkSafety(sim);
    while (!sim.done) { sim.step(); safe.tick(); }
    const s = sim.summary();
    let side = 0, sideN = 0; s.per.forEach((p, i) => { if (sim.net.apps[i].phase === 1) { side += p.delay * p.arrived; sideN += p.arrived; } });
    rows.push({ seed, delay: s.meanDelay, h: s.delayH, side: sideN ? side / sideN : 0, maxRed: s.maxRed, safety: safe.bad.length, conserved: s.conserved });
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, site + '-b' + blind + '-' + ctrl + '-' + a + '.json'), JSON.stringify(rows) + '\n');
}

function report() {
  const all = {};
  for (const f of fs.readdirSync(OUT)) {
    const m = f.match(/^(\w+)-b(\d)-(\w+)-\d+\.json$/); if (!m) continue;
    const k = m[1] + '|' + m[2] + '|' + m[3]; all[k] = (all[k] || []).concat(JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')));
  }
  const med = xs => { const s = xs.slice().sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
  const f1 = x => (x > 0 ? '+' : '') + x.toFixed(1).replace('.', ',');
  const NAMES = { adaptive: 'Τρεις απλοί κανόνες', optimal: 'Βελτιστοποίηση ανά κόμβο (pitch)', netplan: 'Κοινό πρόγραμμα δικτύου', network: 'Κοινή απόφαση ανά δευτερόλεπτο' };
  let md = '# Πείραμα: βελτιστοποίηση ανά κόμβο εναντίον κοινής βελτιστοποίησης δικτύου — ΠΡΟΣΟΜΟΙΩΣΗ\n\n' +
    'Παράγεται από `simulation/experiment-network.js`. Τρίτη 3/11/2026, όλη η μέρα. Δ = μεταβολή μέσης αναμονής έναντι του σταθερού προγράμματος (διάμεσος, εύρος). Ίδιες αφίξεις για όλους τους ελεγκτές σε κάθε σπόρο.\n\n' +
    '- **Βελτιστοποίηση ανά κόμβο:** κάθε φανάρι αποφασίζει κάθε δευτερόλεπτο πότε θα αλλάξει, ώστε να είναι ελάχιστη η αναμονή στον δικό του κόμβο τα επόμενα 2 λεπτά.\n' +
    '- **Κοινό πρόγραμμα δικτύου:** μεταβλητές είναι οι χρόνοι όλων των φαναριών (κοινός κύκλος, πράσινο κάθε κόμβου, μετατόπιση ως προς τους άλλους). Κάθε λεπτό αλλάζουν μία μία και κρατιέται ό,τι μικραίνει τη συνολική αναμονή όλου του δικτύου τα επόμενα 5 λεπτά, με τα οχήματα να φτάνουν από κόμβο σε κόμβο μετά τον χρόνο διαδρομής. Κόμβοι χωρίς ανιχνευτή μένουν στο σταθερό τους πρόγραμμα και το νέο πρόγραμμα συντονίζεται μαζί τους.\n' +
    '- **Κοινή απόφαση ανά δευτερόλεπτο:** όπως η βελτιστοποίηση ανά κόμβο, αλλά οι χρόνοι αλλαγής όλων των φαναριών επιλέγονται μαζί, με κόστος όλο το δίκτυο.\n\n' +
    '| Κόμβος | Ανιχνευτές | Ελεγκτής | Σπόροι | Δ (εύρος) | Οχηματοώρες/ημέρα | Καλύτερο από σταθερό | Αναμονή κάθετης (s) | Παραβάσεις ορίων |\n|---|---|---|---|---|---|---|---|---|\n';
  for (const site of ['kif', 'iera', 'alex']) for (const blind of ['1', '0']) {
    const F = all[site + '|' + blind + '|fixed']; if (!F) continue;
    const fBy = {}; F.forEach(r => { fBy[r.seed] = r; });
    for (const ctrl of ['adaptive', 'optimal', 'netplan', 'network']) {
      const R = all[site + '|' + blind + '|' + ctrl]; if (!R) continue;
      const D = R.map(r => 100 * (r.delay - fBy[r.seed].delay) / fBy[r.seed].delay), H = R.map(r => fBy[r.seed].h - r.h);
      md += '| ' + DATA.sites.find(s => s.id === site).short + ' | ' + (blind === '1' ? 'σημερινοί' : 'σε κάθε πρόσβαση') + ' | ' + NAMES[ctrl] + ' | ' + R.length + ' | ' + f1(med(D)) + '% (' + f1(Math.min(...D)) + ' έως ' + f1(Math.max(...D)) + ') | ' +
        med(H).toFixed(1).replace('.', ',') + ' | ' + D.filter(d => d < 0).length + '/' + R.length + ' | ' + med(F.map(r => r.side)).toFixed(0) + ' → ' + med(R.map(r => r.side)).toFixed(0) + ' | ' + R.reduce((s, r) => s + r.safety, 0) + (R.every(r => r.conserved) ? '' : ' ⚠') + ' |\n';
    }
  }
  fs.writeFileSync(path.join(__dirname, '..', 'knowledge-base', 'results', 'experiment-network.md'), md);
  console.log(md);
}

if (process.argv[2] === 'report') report();
else run(process.argv[3], +process.argv[4], process.argv[5], +process.argv[6], +process.argv[7]);
