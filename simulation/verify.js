// verify.js — έλεγχος χωρίς browser:  node verify.js
// 1) συντακτικός έλεγχος data.js, sim-core.js και των inline scripts του index.html
// 2) τρέχει τον πυρήνα προσομοίωσης για κάθε κόμβο × σενάριο και ελέγχει: διατήρηση οχημάτων,
//    μη αρνητικές ουρές, λογικό baseline, μη υπερβολικό κέρδος του προσαρμοστικού.
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = path.join(__dirname, '..', 'app');
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const dataSrc = fs.readFileSync(path.join(dir, 'data.js'), 'utf8');
const coreSrc = fs.readFileSync(path.join(dir, 'sim-core.js'), 'utf8');

const scripts = [...html.matchAll(/<script(?:\s+id="([^"]*)")?>([\s\S]*?)<\/script>/g)].map(m => ({ id: m[1], src: m[2] }));
for (const s of scripts) { new vm.Script(s.src, { filename: 'inline:' + s.id }); console.log('syntax OK  inline script #' + s.id, s.src.length, 'chars'); }
new vm.Script(coreSrc, { filename: 'sim-core.js' }); console.log('syntax OK  sim-core.js', coreSrc.length, 'chars');
new vm.Script(dataSrc, { filename: 'data.js' }); console.log('syntax OK  data.js', dataSrc.length, 'chars');

const ctx = { window: {}, module: { exports: {} }, Math, console };
vm.createContext(ctx);
vm.runInContext(dataSrc, ctx);
vm.runInContext(coreSrc, ctx);
const DATA = ctx.window.DATA, Sim = ctx.module.exports;


// Έλεγχοι ασφαλείας σε κάθε βήμα: ενδιάμεσος χρόνος, ελάχιστο πράσινο, ανώτατη αναμονή στο κόκκινο.
// Το πρώτο πράσινο κάθε εκτέλεσης εξαιρείται από το ελάχιστο (το σταθερό πρόγραμμα ξεκινά στη μέση του κύκλου).
function mkSafety(sim) {
  const P = sim.P, minG = [P.minGreenMain, P.minGreenSide], bad = [];
  const J = sim.net.juncs.map(() => ({ g: -2, len: 0, inter: 0, last: -1, greens: 0, redSince: [sim.t0, sim.t0] }));
  const adaptiveAt = j => sim.mode ? sim.mode(j) === 'adaptive' : sim.ctrl === 'adaptive';
  return {
    bad,
    tick() {
      const t = sim.t - 1;
      sim.sig.forEach((S, j) => {
        const s = J[j], g = S.g, name = sim.net.juncs[j].id;
        if (g !== s.g) {
          if (s.g >= 0) {                                   // τελείωσε πράσινο
            if (s.greens > 1 && s.len < minG[s.g]) bad.push(name + ' t=' + t + ' πράσινο φάσης ' + s.g + ' μόνο ' + s.len + ' s');
            s.last = s.g; s.redSince[s.g] = t; s.inter = 0;
          }
          if (g >= 0) {                                     // ξεκινά πράσινο
            if (s.last >= 0 && s.last !== g && s.inter < P.lost) bad.push(name + ' t=' + t + ' ενδιάμεσος χρόνος ' + s.inter + ' s');
            s.len = 0; s.greens++;
          }
          s.g = g;
        }
        if (g >= 0) s.len++; else s.inter++;
        if (adaptiveAt(j)) for (let p = 0; p < 2; p++) if (g !== p && t - s.redSince[p] > P.maxRed) { bad.push(name + ' t=' + t + ' κόκκινο φάσης ' + p + ' > ' + P.maxRed + ' s'); s.redSince[p] = t; }
      });
    }
  };
}

const SCEN = [
  ['Πρωινή αιχμή  Τρ 3/11 07–10', '2026-11-03', 7, 10],
  ['Απογ. αιχμή   Τρ 3/11 16–19', '2026-11-03', 16, 19],
  ['Νύχτα         Τρ 3/11 01–04', '2026-11-03', 1, 4],
  ['Μαραθώνιος    Κυ 8/11 09–13', '2026-11-08', 9, 13],
  ['Όλη η μέρα    Τρ 3/11 00–24', '2026-11-03', 0, 24],
  ['Κανον. Κυρ.   Κυ 1/11 09–13', '2026-11-01', 9, 13],
];
const jsonArg = process.argv.slice(2).find(a => a.startsWith('{'));   // π.χ. node verify.js "{\"seed\":3}"
const extra = jsonArg ? JSON.parse(jsonArg) : {};
let bad = 0;
const f = (x, d = 1) => x.toFixed(d).padStart(7);
for (const site of DATA.sites) {
  console.log('\n=== ' + site.name + ' ===');
  console.log('σενάριο'.padEnd(30), ' οχήμ.', ' καθ.Σ', ' καθ.Π', '   Δ%', ' ουρά Σ/Π', ' στάσεις% Σ/Π', ' υπερχ.min Σ/Π', ' maxRed Σ', ' maxRed Π', ' κύκλος Σ/Π');
  for (const [name, day, a, b] of SCEN) {
    const R = {};
    for (const ctrl of ['fixed', 'adaptive']) {
      const sim = Sim.createSim(DATA, site.id, day, a * 3600, b * 3600, extra, ctrl, null);
      let neg = false; const safe = mkSafety(sim);
      while (!sim.done) { sim.step(); safe.tick(); for (let i = 0; i < sim.net.apps.length; i++) if (sim.qlen(i) < 0) neg = true; }
      const s = sim.summary();
      if (!s.conserved) { bad++; console.log('  !! διατήρηση οχημάτων ΑΠΕΤΥΧΕ', ctrl, s.gen, s.recv, s.served, s.queued, s.transit); }
      if (neg) { bad++; console.log('  !! αρνητική ουρά', ctrl); }
      if (safe.bad.length) { bad += safe.bad.length; console.log('  !! ασφάλεια', ctrl, safe.bad.length, 'παραβάσεις, π.χ.', safe.bad.slice(0, 3).join(' | ')); }
      R[ctrl] = s; R[ctrl + 'Sim'] = sim;
    }
    const F = R.fixed, A = R.adaptive, d = 100 * (A.meanDelay - F.meanDelay) / F.meanDelay;
    console.log(name.padEnd(30), String(F.arrived).padStart(6), f(F.meanDelay), f(A.meanDelay), f(d, 0), (F.maxQ + '/' + A.maxQ).padStart(9),
      (F.stopsPct.toFixed(0) + '/' + A.stopsPct.toFixed(0)).padStart(13), ((F.spill / 60).toFixed(1) + '/' + (A.spill / 60).toFixed(1)).padStart(14),
      (F.maxRed.join('/')).padStart(9), (A.maxRed.join('/')).padStart(9), (F.cycle.toFixed(0) + '/' + A.cycle.toFixed(0)).padStart(10));
    if (process.argv.includes('--per')) F.per.forEach((p, i) => console.log('     ', p.id.padEnd(6), 'αφίξεις', String(p.arrived).padStart(5), ' καθ Σ/Π', f(p.delay), f(A.per[i].delay), ' maxQ', p.maxQ, A.per[i].maxQ));
  }
  const sim = Sim.createSim(DATA, site.id, '2026-11-03', 0, 3600, extra, 'fixed', null);
  console.log('  σταθερά προγράμματα (καθημερινή):', sim.plans.map(p => p.period.label + ' C=' + p.C + ' ' + p.j.map(j => j.g0 + '/' + j.g1 + ' off' + j.off + ' x=' + j.x.toFixed(2)).join(' | ')).join('   '));
}
// ---------- κανόνες ελλιπών δεδομένων (blind) και βλάβης ανιχνευτή ----------
function check(name, ok, info) { if (!ok) bad++; console.log((ok ? '  ok   ' : '  !!   ') + name + (ok || info == null ? '' : '  → ' + info)); }
function runWith(siteId, day, a, b, params, ctrl, hook) {
  const sim = Sim.createSim(DATA, siteId, day, a * 3600, b * 3600, params, ctrl, null), safe = mkSafety(sim);
  while (!sim.done) { if (hook) hook(sim); sim.step(); safe.tick(); }
  return { sim, safe, s: sim.summary() };
}
console.log('\n=== Κανόνες ελλιπών δεδομένων ===');
{
  const modes = sid => { const sim = Sim.createSim(DATA, sid, '2026-11-03', 0, 3600, { blind: 1 }, 'adaptive', null); return sim.net.juncs.map((J, j) => J.id + ':' + sim.mode(j)).join(' '); };
  check('blind=1 Αλεξάνδρας: μόνο ο κόμβος Πανόρμου προσαρμόζεται', modes('alex') === 'xt:fixed-blind ip:fixed-blind pn:adaptive', modes('alex'));
  check('blind=1 Κηφισίας: προσαρμόζεται', modes('kif') === 'kp:adaptive', modes('kif'));
  check('blind=1 Ιερά Οδός: προσαρμόζεται (κάθε φάση έχει έναν ανιχνευτή)', modes('iera') === 'io:adaptive', modes('iera'));
  const fx = Sim.createSim(DATA, 'kif', '2026-11-03', 0, 3600, {}, 'fixed', null);
  check('σταθερός ελεγκτής: mode = fixed', fx.mode(0) === 'fixed', fx.mode(0));

  // κόμβος fixed-blind δείχνει ακριβώς το σήμα του σταθερού προγράμματος
  const F = Sim.createSim(DATA, 'alex', '2026-11-03', 6 * 3600, 11 * 3600, { blind: 1 }, 'fixed', null);
  const A = Sim.createSim(DATA, 'alex', '2026-11-03', 6 * 3600, 11 * 3600, { blind: 1 }, 'adaptive', null);
  let diff = 0; while (!F.done) { F.step(); A.step(); for (const j of [0, 1]) if (F.sig[j].g !== A.sig[j].g) diff++; }
  check('κόμβοι fixed-blind = ίδιο σήμα με το σταθερό πρόγραμμα σε κάθε βήμα', diff === 0, diff + ' βήματα διαφέρουν');

  // blind=0 = η παλιά συμπεριφορά (τιμές αναφοράς από την αρχική έκδοση, σπόρος 7)
  const old = { alex: '8.0', kif: '18.8', iera: '10.9' };
  for (const sid in old) { const r = runWith(sid, '2026-11-03', 0, 24, { blind: 0 }, 'adaptive'); check('blind=0 ' + sid + ' όλη η μέρα = ' + old[sid] + ' s/όχημα', r.s.meanDelay.toFixed(1) === old[sid] && r.s.conserved, r.s.meanDelay.toFixed(1)); }

  // blind=1: διατήρηση και ασφάλεια σε όλη τη μέρα
  for (const site of DATA.sites) { const r = runWith(site.id, '2026-11-03', 0, 24, { blind: 1 }, 'adaptive'); check('blind=1 ' + site.id + ' όλη η μέρα: διατήρηση + ασφάλεια', r.s.conserved && !r.safe.bad.length, r.safe.bad.slice(0, 3).join(' | ')); }

  // βλάβη ανιχνευτή 16:30–17:00
  const seen = {};
  const r1 = runWith('kif', '2026-11-03', 16, 19, {}, 'adaptive', sim => {
    if (sim.t === 16.5 * 3600) sim.failDetector('MS262');
    if (sim.t === 17 * 3600) sim.restoreDetector('MS262');
    if (sim.t === 16.75 * 3600) seen.mid = sim.mode(0);
    if (sim.t === 17.5 * 3600) seen.after = sim.mode(0);
  });
  check('βλάβη MS262: fixed-fail όσο διαρκεί', seen.mid === 'fixed-fail', seen.mid);
  check('βλάβη MS262: adaptive μετά την αποκατάσταση', seen.after === 'adaptive', seen.after);
  check('βλάβη MS262: διατήρηση + ασφάλεια', r1.s.conserved && !r1.safe.bad.length, r1.safe.bad.slice(0, 3).join(' | '));

  // εναλλαγή βλάβης/αποκατάστασης κάθε δευτερόλεπτο επί 120 s
  const r2 = runWith('kif', '2026-11-03', 16, 19, {}, 'adaptive', sim => {
    const k = sim.t - 16.5 * 3600;
    if (k >= 0 && k < 120) { if (k % 2 === 0) sim.failDetector('MS262'); else sim.restoreDetector('MS262'); }
  });
  check('γρήγορη εναλλαγή βλάβης επί 120 s: διατήρηση + ασφάλεια', r2.s.conserved && !r2.safe.bad.length, r2.safe.bad.slice(0, 3).join(' | '));
}

// ---------- βλάβες παντού: η ανώτατη αναμονή ισχύει και στις παραδόσεις ελέγχου ----------
console.log('\n=== Βλάβες ανιχνευτή: ασφάλεια και ανώτατη αναμονή ===');
{
  const DET = { alex: 'MS421', kif: 'MS262', iera: 'MS658' };
  // όριο κόκκινου: η ανώτατη αναμονή, ή το κόκκινο του ίδιου του σταθερού προγράμματος αν είναι μεγαλύτερο
  const redLimit = sim => { let m = sim.P.maxRed; sim.plans.forEach(p => p.j.forEach(j => { m = Math.max(m, j.g0 + 2 * sim.P.lost + (p.dir ? p.C : 0), j.g1 + 2 * sim.P.lost); })); return m; };
  for (const sid of ['kif', 'iera', 'alex']) {
    // μία βλάβη 5 λεπτών, σε πολλές διαφορετικές ώρες της ημέρας (και στο t0 και γύρω από αλλαγές ζώνης)
    let worst = 0, viol = 0, cons = true, lim = 0;
    const starts = [0, 30, 6 * 3600 - 100, 6 * 3600 + 20, 10 * 3600 - 40, 16 * 3600 + 7, 21 * 3600 - 15];
    for (let h = 7; h < 20; h += 0.37) starts.push(Math.round(h * 3600));
    for (const st of starts) {
      const a = Math.floor(st / 3600), r = runWith(sid, '2026-11-03', a, Math.min(24, a + 2), { blind: 1 }, 'adaptive', sim => {
        if (sim.t === st) sim.failDetector(DET[sid]);
        if (sim.t === st + 300) sim.restoreDetector(DET[sid]);
      });
      lim = redLimit(r.sim); worst = Math.max(worst, r.s.maxRed[0], r.s.maxRed[1]); viol += r.safe.bad.length; cons = cons && r.s.conserved;
    }
    check(sid + ': βλάβη 5′ σε ' + starts.length + ' ώρες — κόκκινο ≤ ' + lim + ' s, ασφάλεια, διατήρηση', worst <= lim && !viol && cons, 'μέγιστο κόκκινο ' + worst + ' s, παραβάσεις ' + viol);
    // πολλές σύντομες βλάβες μέσα στην ίδια εκτέλεση
    let k = 0; const rnd = () => { k = (k * 1103515245 + 12345) & 0x7fffffff; return k / 0x7fffffff; };
    let down = false;
    const r = runWith(sid, '2026-11-03', 6, 12, { blind: 1 }, 'adaptive', sim => { if (rnd() < 0.02) { down = !down; if (down) sim.failDetector(DET[sid]); else sim.restoreDetector(DET[sid]); } });
    const w = Math.max(r.s.maxRed[0], r.s.maxRed[1]);
    check(sid + ': τυχαίες εναλλαγές βλάβης 06–12 — κόκκινο ≤ ' + redLimit(r.sim) + ' s, ασφάλεια, διατήρηση', w <= redLimit(r.sim) && !r.safe.bad.length && r.s.conserved, 'μέγιστο κόκκινο ' + w + ' s, παραβάσεις ' + r.safe.bad.length);
  }
}

// ---------- σκηνή (stage.html) ----------
console.log('\n=== Σκηνή (stage.html) ===');
{
  const sp = path.join(dir, 'stage.html'), cp = path.join(dir, 'stage-config.js');
  check('stage.html υπάρχει', fs.existsSync(sp));
  check('stage-config.js υπάρχει (node numbers.js)', fs.existsSync(cp));
  if (fs.existsSync(sp) && fs.existsSync(cp)) {
    const sh = fs.readFileSync(sp, 'utf8');
    const ss = [...sh.matchAll(/<script(?:\s+id="([^"]*)")?>([\s\S]*?)<\/script>/g)].map(m => ({ id: m[1], src: m[2] }));
    let syntaxOk = true; for (const s of ss) { try { new vm.Script(s.src, { filename: 'stage:' + s.id }); } catch (e) { syntaxOk = false; console.log('     ' + e.message); } }
    check('stage.html: τα inline scripts είναι συντακτικά σωστά', syntaxOk && ss.some(s => s.id === 'stage-core'));
    check('stage.html: καμία αναφορά σε δίκτυο (http/https)', !/https?:\/\//.test(sh));
    const sctx = { window: {}, module: { exports: {} }, Math, console };
    vm.createContext(sctx);
    vm.runInContext(fs.readFileSync(cp, 'utf8'), sctx);
    vm.runInContext((ss.find(s => s.id === 'stage-core') || { src: '' }).src, sctx);
    const Stage = sctx.module.exports, STAGE = sctx.window.STAGE;
    // οδηγεί τον βρόχο με ψεύτικο ρολόι: frames = συνάρτηση που δίνει τις χρονικές στιγμές (ms)
    const play = (site, times) => { const c = Stage.create(DATA, Sim, STAGE, { site }); c.key(' ', 0); for (const t of times) c.tick(t); return c; };
    const every = (ms, total) => { const a = []; for (let t = ms; t <= total + ms; t += ms) a.push(t); return a; };
    const want = STAGE.sites.kif.savedVehH;
    const c60 = play('kif', every(1000 / 60, 26000));
    check('σύντομη εκτέλεση kif: τελικός μετρητής = ' + want, c60.done() && Math.abs(c60.saved() - want) < 0.05, c60.saved().toFixed(2) + ' done=' + c60.done());
    const c5 = play('kif', every(200, 26000));
    check('ίδιο αποτέλεσμα στα 5 fps', c5.done() && Math.abs(c5.saved() - want) < 0.05, c5.saved().toFixed(2));
    const gap = every(1000 / 60, 8000).concat(every(1000 / 60, 16000).map(t => t + 18000));
    const cg = play('kif', gap);
    check('ίδιο αποτέλεσμα με κενό 10 s στα frames', cg.done() && Math.abs(cg.saved() - want) < 0.05, cg.saved().toFixed(2));
    const mid = Stage.create(DATA, Sim, STAGE, { site: 'kif' }); mid.key(' ', 0); mid.tick(12500);
    check('στη μέση του χρόνου (12,5 s από 25) η ώρα είναι 12:00', Math.abs(mid.clock() - 43200) <= 60, mid.clock());
    const p = Stage.create(DATA, Sim, STAGE, { site: 'kif' }); p.tick(5000);
    check('ξεκινά σε παύση: χωρίς Space δεν προχωρά', p.clock() === 0 && !p.playing(), p.clock());
    const sk = Stage.create(DATA, Sim, STAGE, { site: 'kif' }); sk.seek(0.5);
    check('seek(0.5): πηγαίνει στις 12:00 και μένει σε παύση', sk.clock() === 43200 && !sk.playing(), sk.clock());
    sk.key('b', 0); sk.seek(0.52);
    check('seek μετά από B: συνεχίζει χωρίς επανεκκίνηση, με βλάβη', sk.clock() > 43200 && sk.broken() && sk.modes()[0] === 'fixed-fail', sk.clock() + ' ' + sk.modes().join(','));
    const vq = sk.view('F').q, vm15 = sk.sim('F').st.maxQ;
    check('view: μέγιστη ουρά 15λέπτου ανά πρόσβαση, όχι πάνω από το μέγιστο της ημέρας', vq.length === 3 && vq.every((q, a) => q >= 0 && q <= vm15[a]) && vq.some(q => q >= 5), vq.join(','));
    // ακολουθία πλήκτρων
    const k = Stage.create(DATA, Sim, STAGE, { site: 'kif' }); let t = 0;
    for (const key of ['2', 'b', 'r', '1', ' ', ' ', 'f', 'b', 'b', '3']) { k.key(key, t); t += 400; k.tick(t); t += 400; k.tick(t); }
    const modes = k.modes().join(',');
    check('ακολουθία πλήκτρων: καταλήγει στο iera, χωρίς βλάβη, μία εκτέλεση', k.site() === 'iera' && !k.broken() && !/fixed-fail/.test(modes) && k.clock() >= 0, k.site() + ' ' + modes + ' broken=' + k.broken());
    const b = Stage.create(DATA, Sim, STAGE, { site: 'kif' }); b.key(' ', 0); b.tick(5000); b.key('b', 5000); b.tick(6000);
    check('πλήκτρο B: ο κόμβος περνά σε fixed-fail', b.broken() && b.modes()[0] === 'fixed-fail', b.modes().join(','));
    b.key('b', 6000); b.tick(9000);
    check('δεύτερο B: επιστρέφει σε adaptive', !b.broken() && b.modes()[0] === 'adaptive', b.modes().join(','));
    check('μετά από βλάβη η εκτέλεση το θυμάται (hadBreak) ώστε να το γράψει στο τέλος', b.hadBreak() === true && c60.hadBreak() === false, b.hadBreak() + ' ' + c60.hadBreak());
    const z = Stage.create(DATA, Sim, STAGE, { site: 'kif' }); z.key('b', 0);
    check('B πριν την εκκίνηση αγνοείται', !z.broken() && z.modes()[0] === 'adaptive', z.modes().join(','));
    c60.key('b', 99999);
    check('B μετά το τέλος αγνοείται: ο τελικός αριθμός μένει καθαρός', !c60.broken() && !c60.hadBreak() && Math.abs(c60.saved() - want) < 0.05, c60.broken() + ' ' + c60.saved().toFixed(2));
    check('η σκηνή δεν ονομάζει το μέτρο σύγκρισης «σήμερα»', !/ΣΗΜΕΡΑ —|σημερινό/.test(sh));
  }
}

// ---------- πειραματικός ελεγκτής βελτιστοποίησης ----------
console.log('\n=== Βελτιστοποίηση κυλιόμενου ορίζοντα (πείραμα) ===');
for (const sid of ['kif', 'iera', 'alex']) {
  const r = runWith(sid, '2026-11-03', 6, 11, {}, 'optimal');
  const w = Math.max(r.s.maxRed[0], r.s.maxRed[1]);
  const redLimit = sim => { let m = sim.P.maxRed; sim.plans.forEach(p => p.j.forEach(j => { m = Math.max(m, j.g0 + 2 * sim.P.lost + (p.dir ? p.C : 0), j.g1 + 2 * sim.P.lost); })); return m; };
  check(sid + ': βελτιστοποίηση 06–11 — όρια ασφαλείας, κόκκινο ≤ ' + redLimit(r.sim) + ' s, διατήρηση', !r.safe.bad.length && w <= redLimit(r.sim) && r.s.conserved, 'μέγιστο κόκκινο ' + w + ' s, παραβάσεις ' + r.safe.bad.length);
}

// ---------- πειραματική κοινή βελτιστοποίηση δικτύου ----------
console.log('\n=== Κοινή βελτιστοποίηση δικτύου (πείραμα) ===');
for (const [sid, ctrl, a, b, blind] of [['alex', 'netplan', 6, 11, 0], ['alex', 'netplan', 6, 11, 1], ['alex', 'network', 7, 8, 0]]) {
  const r = runWith(sid, '2026-11-03', a, b, { blind }, ctrl);
  const w = Math.max(r.s.maxRed[0], r.s.maxRed[1]);
  const redLimit = sim => { let m = sim.P.maxRed; sim.plans.forEach(p => p.j.forEach(j => { m = Math.max(m, j.g0 + 2 * sim.P.lost + (p.dir ? p.C : 0), j.g1 + 2 * sim.P.lost); })); return m; };
  check(sid + ' ' + ctrl + ' blind=' + blind + ' ' + a + '–' + b + ': όρια ασφαλείας, κόκκινο ≤ ' + redLimit(r.sim) + ' s, διατήρηση', !r.safe.bad.length && w <= redLimit(r.sim) && r.s.conserved, 'μέγιστο κόκκινο ' + w + ' s, παραβάσεις ' + r.safe.bad.length);
}

// ---------- κέντρο ελέγχου: ο χειριστής κρατά τον κόμβο στο ρολόι και μετά τον αναθέτει ----------
console.log('\n=== Κέντρο ελέγχου (control.html): ανάθεση ρολόι → Τροχονόμος ===');
for (const [sid, at, p] of [['kif', 9.75, { optH: 180 }], ['kif', 10, { optH: 180 }], ['iera', 8, {}], ['alex', 8, {}]]) {
  const fx = runWith(sid, '2026-11-03', 6, at, {}, 'fixed');
  let before = null;
  const r = runWith(sid, '2026-11-03', 6, 11, p, 'optimal', sim => {
    if (sim.t === 6 * 3600) sim.net.juncs.forEach((J, j) => sim.hold(j, true));
    if (sim.t === at * 3600) { before = sim.st.qInt.reduce((a, b) => a + b, 0); sim.net.juncs.forEach((J, j) => sim.hold(j, false)); }
  });
  const w = Math.max(r.s.maxRed[0], r.s.maxRed[1]);
  const redLimit = sim => { let m = sim.P.maxRed; sim.plans.forEach(q => q.j.forEach(j => { m = Math.max(m, j.g0 + 2 * sim.P.lost + (q.dir ? q.C : 0), j.g1 + 2 * sim.P.lost); })); return m; };
  check(sid + ': πριν από την ανάθεση (' + at + 'h) ίδιος με το σταθερό πρόγραμμα', before === fx.sim.st.qInt.reduce((a, b) => a + b, 0), before + ' / ' + fx.sim.st.qInt.reduce((a, b) => a + b, 0));
  check(sid + ': ανάθεση στις ' + at + 'h — όρια ασφαλείας, κόκκινο ≤ ' + redLimit(r.sim) + ' s, διατήρηση', !r.safe.bad.length && w <= redLimit(r.sim) && r.s.conserved, 'μέγιστο κόκκινο ' + w + ' s, παραβάσεις ' + r.safe.bad.length);
}
{
  const cp = path.join(dir, 'control.html');
  check('control.html υπάρχει', fs.existsSync(cp));
  if (fs.existsSync(cp)) {
    const ch = fs.readFileSync(cp, 'utf8');
    for (const m of [...ch.matchAll(/<script>([\s\S]*?)<\/script>/g)]) { let okJs = true, err = ''; try { new vm.Script(m[1]); } catch (e) { okJs = false; err = e.message; } check('control.html: το σενάριο της σελίδας είναι έγκυρη JavaScript', okJs, err); }
    check('control.html: γράφει ότι η αναμονή είναι προσομοίωση και οι μετρήσεις αναπαραγωγή', /προσομοίωση/.test(ch) && /αναπαραγωγή/.test(ch));
    check('control.html: δεν ονομάζει το σταθερό πρόγραμμα «ισχύον»', /όχι το ισχύον/.test(ch));
    check('control.html: γράφει ότι οι κάθετες της Βασ. Σοφίας χωρίς ανιχνευτή είναι παραδοχή', /Βασ\. Σοφίας: η κίνηση στις κάθετες χωρίς ανιχνευτή είναι παραδοχή/.test(ch));
  }
}
{
  const dp = path.join(dir, 'demo.html');
  check('demo.html υπάρχει', fs.existsSync(dp));
  if (fs.existsSync(dp)) {
    const dh = fs.readFileSync(dp, 'utf8');
    for (const m of [...dh.matchAll(/<script>([\s\S]*?)<\/script>/g)]) { let okJs = true, err = ''; try { new vm.Script(m[1]); } catch (e) { okJs = false; err = e.message; } check('demo.html: το σενάριο της σελίδας είναι έγκυρη JavaScript', okJs, err); }
    check('demo.html: γράφει ότι οι ουρές είναι προσομοίωση, το ρολόι δικός μας σχεδιασμός, και το σενάριο ανιχνευτών', /προσομοίωση/.test(dh) && /όχι το ισχύον/.test(dh) && /ανιχνευτής σε κάθε κάθετη οδό/.test(dh));
  }
}
// Λ. Βασ. Σοφίας στο κέντρο ελέγχου: 14 φανάρια, απλοί κανόνες, με τους σημερινούς ανιχνευτές (blind 1) ή με ανιχνευτή σε κάθε κάθετη (blind 0)
{
  const sp = path.join(dir, 'sofias-data.js');
  check('sofias-data.js υπάρχει', fs.existsSync(sp));
  if (fs.existsSync(sp)) {
    vm.runInContext(fs.readFileSync(sp, 'utf8'), ctx);
    const SO = ctx.window.SOFIAS; DATA.sites.push(SO.site); for (const d in SO.detectors) DATA.detectors[d] = SO.detectors[d];
    const tot = sim => sim.st.qInt.reduce((a, b) => a + b, 0);
    const fx = runWith('sofias', '2026-11-03', 6, 9.5, {}, 'fixed'), fxEnd = runWith('sofias', '2026-11-03', 6, 12, {}, 'fixed');
    for (const blind of [1, 0]) {
      let before = null, ctl = 0;
      const r = runWith('sofias', '2026-11-03', 6, 12, { blind }, 'adaptive', sim => {
        if (sim.t === 6 * 3600) sim.net.juncs.forEach((J, j) => sim.hold(j, true));
        if (sim.t === 9.5 * 3600) { before = tot(sim); sim.net.juncs.forEach((J, j) => sim.hold(j, false)); ctl = sim.net.juncs.filter((J, j) => sim.mode(j) === 'adaptive').length; }
      });
      check('sofias blind=' + blind + ': πριν από την ανάθεση ίδιος με το σταθερό πρόγραμμα', before === tot(fx.sim), before + ' / ' + tot(fx.sim));
      check('sofias blind=' + blind + ': ελέγχονται ' + (blind ? 3 : 14) + ' από 14 φανάρια', ctl === (blind ? 3 : 14), ctl);
      check('sofias blind=' + blind + ': όρια ασφαλείας και διατήρηση μετά την ανάθεση', !r.safe.bad.length && r.s.conserved, 'παραβάσεις ' + r.safe.bad.length);
      check('sofias blind=' + blind + ': λιγότερη αναμονή από το ρολόι ως τις 12:00', tot(r.sim) < tot(fxEnd.sim), ((tot(fxEnd.sim) - tot(r.sim)) / 3600).toFixed(1) + ' ώρες');
    }
    DATA.sites.pop();
  }
}

// ---------- ζωντανή κάτοψη (live.html) ----------
console.log('\n=== Ζωντανή κάτοψη (live.html) ===');
{
  const lp = path.join(dir, 'live.html');
  check('live.html υπάρχει', fs.existsSync(lp));
  if (fs.existsSync(lp)) {
    const lh = fs.readFileSync(lp, 'utf8');
    const ls = [...lh.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    let ok = ls.length > 0; for (const s of ls) { try { new vm.Script(s, { filename: 'live' }); } catch (e) { ok = false; console.log('     ' + e.message); } }
    check('live.html: το inline script είναι συντακτικά σωστό', ok);
    check('live.html: καμία αναφορά σε δίκτυο (http/https)', !/https?:\/\//.test(lh));
    check('live.html: δεν ονομάζει το μέτρο σύγκρισης «σήμερα» και λέει ότι είναι προσομοίωση', !/ΣΗΜΕΡΑ —|σημερινό/.test(lh) && /Προσομοίωση\./.test(lh) && /όχι το ισχύον/.test(lh));
  }
}

console.log(bad ? '\nΑΠΟΤΥΧΙΑ: ' + bad + ' έλεγχοι' : '\nΌλοι οι έλεγχοι διατήρησης/ουρών πέρασαν.');
process.exit(bad ? 1 : 0);
