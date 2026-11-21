/* ===================================================================================
   ΠΥΡΗΝΑΣ ΠΡΟΣΟΜΟΙΩΣΗΣ — χωρίς DOM (τρέχει και σε node, βλ. verify.js)
   Μοντέλο: βήμα 1 s · αφίξεις Poisson με ρυθμό τη μετρημένη 5λεπτη ροή · ουρά FIFO ανά πρόσβαση ·
   εκφόρτιση με ροή κορεσμού όσο υπάρχει πράσινο · χαμένος χρόνος σε κάθε αλλαγή φάσης ·
   στον διάδρομο τα οχήματα του ανάντη κόμβου φτάνουν ως φάλαγγα μετά από χρόνο διαδρομής ·
   αν ο σύνδεσμος γεμίσει, ο ανάντη κόμβος μπλοκάρει (υπερχείλιση).
   =================================================================================== */
var SimCore = (function () {
  'use strict';
  var DEFAULTS = {
    satFlow: 1800,      // οχ/ώρα πρασίνου ανά λωρίδα
    lost: 6,            // s χαμένου χρόνου ανά αλλαγή φάσης (κίτρινο + ολικό κόκκινο + εκκίνηση)
    cMax: 120,          // s μέγιστος κύκλος σταθερού προγράμματος
    minGreenMain: 10,   // s ελάχιστο πράσινο κύριας φάσης (πεζοί διασχίζουν την κάθετη)
    minGreenSide: 15,   // s ελάχιστο πράσινο κάθετης φάσης (πεζοί διασχίζουν τον κύριο άξονα)
    maxRed: 90,         // s ανώτατη αναμονή στο κόκκινο (προσαρμοστικό)
    ratio: 1.5,         // προσαρμοστικό: αλλάζει όταν η απέναντι ουρά ≥ ratio × τρέχουσα (+3 οχ.)
    lookahead: 6,       // s πριν τη γραμμή στάσης που «βλέπει» ο ανιχνευτής
    maxThru: 85,        // % μέγιστο ποσοστό ευθείας κίνησης προς τον επόμενο κόμβο
    cruise: 40,         // km/h ταχύτητα μεταξύ κόμβων
    spacing: 6.5,       // m ανά όχημα σε ουρά
    storage: 250,       // m χώρος αναμονής σε πρόσβαση εισόδου
    demandScale: 100,   // % πολλαπλασιαστής ζήτησης πάνω στη μετρημένη ροή
    blind: 1,           // 1 = ο προσαρμοστικός βλέπει μόνο προσβάσεις με ανιχνευτή· κόμβος με «τυφλή» φάση μένει στο σταθερό πρόγραμμα
    seed: 7
  };
  var PERIODS = [
    { id: 'night', label: '00–06', from: 0, to: 6 },
    { id: 'am', label: '06–10', from: 6, to: 10 },
    { id: 'mid', label: '10–16', from: 10, to: 16 },
    { id: 'pm', label: '16–21', from: 16, to: 21 },
    { id: 'eve', label: '21–24', from: 21, to: 24 }
  ];
  function periodAt(t) {
    var h = (((t / 3600) % 24) + 24) % 24;
    for (var i = 0; i < PERIODS.length; i++) if (h >= PERIODS[i].from && h < PERIODS[i].to) return i;
    return 0;
  }
  function mulberry(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; }
  function poisson(r, lam) {
    if (lam <= 0) return 0;
    var L = Math.exp(-lam), k = 0, p = 1;
    do { k++; p *= r(); } while (p > L);
    return k - 1;
  }
  function mod(a, n) { return ((a % n) + n) % n; }

  function buildNet(DATA, siteId, P, over) {
    var site = DATA.sites.filter(function (s) { return s.id === siteId; })[0];
    var apps = [], juncs = [];
    site.junctions.forEach(function (j, ji) {
      var J = { id: j.id, name: j.name, idx: ji, apps: [] };
      juncs.push(J);
      j.approaches.forEach(function (a) {
        var o = (over && over[a.id]) || {};
        var lanes = o.lanes || a.lanes;
        var A = {
          id: a.id, j: ji, phase: a.phase, dir: a.dir, label: a.label, det: a.det,
          ref: a.det || a.assume[0], measured: !!a.det,
          factor: a.det ? 1 : (o.factor != null ? o.factor : a.assume[1]),
          lanes: lanes, sat: P.satFlow * lanes / 3600, upId: a.up || null, up: -1, down: -1,
          dist: a.upDist || 0, idx: apps.length
        };
        apps.push(A); J.apps.push(A.idx);
      });
    });
    apps.forEach(function (A) {
      if (A.upId) {
        var U = apps.filter(function (x) { return x.id === A.upId; })[0];
        A.up = U.idx; U.down = A.idx;
        A.travel = Math.max(1, Math.round(A.dist / (P.cruise / 3.6)));
        A.armM = A.dist;
        A.cap = Math.max(4, Math.floor(A.dist * A.lanes / P.spacing));
      } else {
        A.travel = P.lookahead; A.armM = P.storage; A.cap = Infinity;
      }
      A.storeVeh = Math.max(4, Math.floor(A.armM * A.lanes / P.spacing));
    });
    return { site: site, apps: apps, juncs: juncs };
  }

  function flowAt(DATA, A, dayKey, t, P) {
    var bin = Math.floor(mod(t, 86400) / (DATA.binMin * 60));
    return DATA.detectors[A.ref].prof[dayKey].f[bin] * A.factor * P.demandScale / 100;
  }
  // ροή σχεδιασμού: η πιο φορτωμένη 60λεπτη μέση τιμή μέσα στη χρονική ζώνη, στην ΤΥΠΙΚΗ ημέρα
  function designFlow(DATA, A, typKey, pi, P) {
    var f = DATA.detectors[A.ref].prof[typKey].f, per = PERIODS[pi], nb = 60 / DATA.binMin;
    var b0 = per.from * nb, b1 = per.to * nb, best = 0;
    for (var b = b0; b + nb <= b1; b++) {
      var s = 0; for (var k = 0; k < nb; k++) s += f[b + k];
      if (s / nb > best) best = s / nb;
    }
    return best * A.factor * P.demandScale / 100;
  }

  // Σταθερά προγράμματα Webster ανά χρονική ζώνη· στον διάδρομο κοινός κύκλος + μετατοπίσεις (πράσινο κύμα)
  function computePlans(DATA, net, typKey, P) {
    var L = 2 * P.lost, minG = [P.minGreenMain, P.minGreenSide];
    var cMin = minG[0] + minG[1] + L;
    return PERIODS.map(function (per, pi) {
      var js = net.juncs.map(function (J) {
        var y = [0, 0], q = {};
        J.apps.forEach(function (ai) {
          var A = net.apps[ai], d = designFlow(DATA, A, typKey, pi, P);
          q[A.id] = d;
          y[A.phase] = Math.max(y[A.phase], d / (P.satFlow * A.lanes));
        });
        var Y = y[0] + y[1];
        var C0 = Y < 0.9 ? (1.5 * L + 5) / (1 - Y) : P.cMax;
        return { y: y, Y: Y, q: q, C0: Math.min(P.cMax, Math.max(cMin, Math.ceil(C0))) };
      });
      var C = Math.max.apply(null, js.map(function (j) { return j.C0; }));
      js.forEach(function (j) {
        var G = C - L, g0 = j.Y > 0 ? G * j.y[0] / j.Y : G / 2;
        if (g0 < minG[0]) g0 = minG[0];
        if (G - g0 < minG[1]) g0 = G - minG[1];
        j.C = C; j.g0 = Math.round(g0); j.g1 = G - j.g0; j.off = 0;
        j.x = Math.max(j.y[0] * C / j.g0, j.y[1] * C / j.g1);      // βαθμός κορεσμού σχεδιασμού
      });
      // μετατοπίσεις: πρόοδος προς την κατεύθυνση με τη μεγαλύτερη ροή σχεδιασμού
      var dirFlow = { E: 0, W: 0 }, linked = false;
      net.apps.forEach(function (A) { if (A.phase === 0 && A.up >= 0) { linked = true; dirFlow[A.dir] += js[A.j].q[A.id]; } });
      var dir = null;
      if (linked) {
        dir = dirFlow.E >= dirFlow.W ? 'E' : 'W';
        var order = net.juncs.map(function (J) { return J.idx; });
        if (dir === 'W') order.reverse();
        for (var k = 1; k < order.length; k++) {
          var ji = order[k], link = null;
          net.juncs[ji].apps.forEach(function (ai) { var A = net.apps[ai]; if (A.dir === dir && A.up >= 0) link = A; });
          js[ji].off = mod(js[order[k - 1]].off + (link ? link.travel : 0), C);
        }
      }
      return { period: per, C: C, dir: dir, j: js };
    });
  }

  function createSim(DATA, siteId, dayKey, t0, t1, params, ctrl, over) {
    var P = {}; for (var k in DEFAULTS) P[k] = (params && params[k] != null) ? +params[k] : DEFAULTS[k];
    var net = buildNet(DATA, siteId, P, over);
    var day = DATA.days.filter(function (d) { return d.key === dayKey; })[0];
    var typKey = day.type;                       // 'wk' ή 'we' — το σταθερό πρόγραμμα σχεδιάζεται από την τυπική ημέρα
    var plans = computePlans(DATA, net, typKey, P);
    var nA = net.apps.length, nJ = net.juncs.length, minG = [P.minGreenMain, P.minGreenSide];
    var q = [], qh = [], transit = [], rnd = [], credit = [], thruAcc = [];
    var st = { gen: [], recv: [], served: [], delay: [], stops: [], maxQ: [], spill: [], qInt: [] };
    for (var a = 0; a < nA; a++) {
      q.push([]); qh.push(0); transit.push([]); credit.push(0); thruAcc.push(0.5);
      rnd.push(mulberry(hash(net.apps[a].id) ^ (P.seed * 2654435761)));
      for (var s in st) st[s].push(0);
    }
    var nb = Math.ceil((t1 - t0) / 300);
    var series = { t: [], qInt: [], arr: [], served: [], dep: [], depDelay: [] };
    for (var b = 0; b < nb; b++) { series.t.push(t0 + b * 300); series.qInt.push(0); series.arr.push(0); series.served.push(0); series.dep.push(0); series.depDelay.push(0); }
    var sig = [], fx = [], ad = [], lastEnd = [], maxRedSeen = [], starts = [], fsig = [], failed = {}, blindJ = [];
    // ΠΕΙΡΑΜΑΤΙΚΟΙ ΔΙΑΚΟΠΤΕΣ (όλοι κλειστοί εξ ορισμού). detAdd / detDrop: προσβάσεις όπου προστίθεται ή αφαιρείται ανιχνευτής.
    // est > 0: στις προσβάσεις χωρίς ανιχνευτή ο ελεγκτής κρατά ΕΚΤΙΜΩΜΕΝΗ ουρά από το προφίλ τυπικής ημέρας × est (est = σφάλμα της εκτίμησης)
    // και ο κόμβος ελέγχεται κανονικά αντί να μένει στο σταθερό πρόγραμμα.
    var detAdd = (params && params.detAdd) || [], detDrop = (params && params.detDrop) || [], EST = (params && +params.est) || 0, vis = [], qe = [];
    var MARGIN = (params && params.margin != null) ? +params.margin : 3;
    for (a = 0; a < nA; a++) { var Av = net.apps[a]; vis.push(!P.blind || ((Av.measured || detAdd.indexOf(Av.id) >= 0) && detDrop.indexOf(Av.id) < 0)); qe.push(0); }
    for (var j = 0; j < nJ; j++) {
      var pl = plans[periodAt(t0)].j[j];
      fx.push({ pl: pl, start: t0 - mod(t0 - pl.off, pl.C), ext: 0 });
      ad.push({ phase: 0, inter: -1, el: 0, next: 0 });
      sig.push({ g: -1, amber: -1, el: 0, prev: -2 });
      lastEnd.push([t0, t0]); maxRedSeen.push([0, 0]); starts.push(0);
      fsig.push({ g: -1, amber: -1, el: 0 });
      var seen = [0, 0]; net.juncs[j].apps.forEach(function (ai) { if (vis[ai] || EST) seen[net.apps[ai].phase] = 1; });
      blindJ.push(!(seen[0] && seen[1]));
    }
    var sim = { t: t0, t0: t0, t1: t1, net: net, plans: plans, P: P, q: q, qh: qh, transit: transit, sig: sig, ctrl: ctrl, done: false, series: series, st: st, day: day };

    var gbuf = []; for (a = 0; a < nA; a++) gbuf.push([]);
    function genAt(a, tt) {          // αφίξεις της πρόσβασης a το δευτερόλεπτο tt (κληρώνονται με τη σειρά, άρα ίδιες με ή χωρίς πρόβλεψη)
      var g = gbuf[a], A = net.apps[a];
      while (g.length <= tt - t0) {
        var u = t0 + g.length, rate = flowAt(DATA, A, dayKey, u, P);
        if (A.up >= 0) rate = Math.max(0, rate - thruShare(A, u) * flowAt(DATA, net.apps[A.up], dayKey, u, P));
        g.push(poisson(rnd[a], rate / 3600));
      }
      return g[tt - t0];
    }
    function qlen(a) { return q[a].length - qh[a]; }
    function occ(a) { return qlen(a) + transit[a].length; }
    function blocked(a) { var d = net.apps[a].down; return d >= 0 && occ(d) >= net.apps[d].cap; }
    sim.qlen = qlen; sim.blocked = blocked; sim.swLog = []; for (j = 0; j < nJ; j++) sim.swLog.push([]);
    // Κατάσταση ελέγχου κόμβου. 'fixed-blind': κάποια φάση δεν έχει κανέναν ανιχνευτή → σταθερό πρόγραμμα.
    // 'fixed-fail': ανιχνευτής του κόμβου σε βλάβη → σταθερό πρόγραμμα μέχρι να επανέλθει.
    function mode(j) {
      if (ctrl === 'fixed') return 'fixed';
      if (held[j]) return 'fixed-hold';                  // ο χειριστής κρατά τον κόμβο στο σταθερό πρόγραμμα (κέντρο ελέγχου)
      var list = net.juncs[j].apps;
      for (var i = 0; i < list.length; i++) { var d = net.apps[list[i]].det; if (d && failed[d]) return 'fixed-fail'; }
      return (P.blind && blindJ[j]) ? 'fixed-blind' : 'adaptive';
    }
    var held = {};
    sim.mode = mode;
    sim.hold = function (j, on) { if (on) held[j] = true; else delete held[j]; };
    sim.failDetector = function (id) { failed[id] = true; };
    sim.restoreDetector = function (id) { delete failed[id]; };

    function thruShare(D, t) {      // ποσοστό του ανάντη ρεύματος που συνεχίζει στην πρόσβαση D
      var qd = flowAt(DATA, D, dayKey, t, P), qu = flowAt(DATA, net.apps[D.up], dayKey, t, P);
      return qu > 0 ? Math.min(P.maxThru / 100, qd / qu) : 0;
    }
    function fixedSignal(j, t, S) {
      var F = fx[j], tau = t - F.start;
      if (tau >= F.pl.C + F.ext) {
        F.start = t; tau = 0;
        var np = plans[periodAt(t)].j[j];
        // αλλαγή ζώνης: στον διάδρομο το πράσινο της κύριας παρατείνεται μία φορά ώστε να συγχρονιστεί η νέα μετατόπιση
        if (np !== F.pl) { F.pl = np; F.ext = plans[periodAt(t)].dir ? mod(np.off - t, np.C) : 0; } else F.ext = 0;
      }
      var p = F.pl, a = p.g0 + F.ext;
      if (tau < a) { S.g = 0; S.el = tau; }
      else if (tau < a + P.lost) { S.g = -1; S.amber = 0; S.el = tau - a; }
      else if (tau < a + P.lost + p.g1) { S.g = 1; S.el = tau - a - P.lost; }
      else { S.g = -1; S.amber = 1; S.el = tau - a - P.lost - p.g1; }
    }
    function pressure(j, ph, t) {   // οχήματα σε ουρά + όσα φτάνουν μέσα στα επόμενα lookahead s (0 αν ο κατάντη σύνδεσμος είναι γεμάτος)
      var w = 0, list = net.juncs[j].apps;
      for (var i = 0; i < list.length; i++) {
        var a = list[i]; if (net.apps[a].phase !== ph || blocked(a) || (!vis[a] && !EST)) continue;
        if (!vis[a]) { w += Math.round(qe[a]); continue; }
        w += qlen(a);
        var tr = transit[a]; for (var k = 0; k < tr.length; k++) if (tr[k] <= t + P.lookahead) w++;
      }
      return w;
    }
    function adaptiveSignal(j, t, S) {
      var A = ad[j];
      if (A.inter >= 0) {
        if (A.inter >= P.lost) { A.inter = -1; A.phase = A.next; A.el = 0; }
        else { S.g = -1; S.amber = 1 - A.next; S.el = A.inter; A.inter++; return; }
      }
      var o = 1 - A.phase;
      if (A.el >= minG[A.phase]) {
        var cur = pressure(j, A.phase, t), oth = pressure(j, o, t);
        var redO = t - lastEnd[j][o];
        var sw = (redO + P.lost >= P.maxRed)                  // ανώτατη αναμονή (πεζοί / κάθετη)
          || (cur === 0 && (oth > 0 || A.phase === 1))        // η ουρά άδειασε
          || (oth >= P.ratio * cur + MARGIN);                      // η απέναντι ουρά είναι αισθητά μεγαλύτερη
        if (sw) { A.next = o; A.inter = 1; S.g = -1; S.amber = A.phase; S.el = 0; return; }
      }
      S.g = A.phase; S.el = A.el; A.el++;
    }

    // ΒΕΛΤΙΣΤΟΠΟΙΗΣΗ ΚΥΛΙΟΜΕΝΟΥ ΟΡΙΖΟΝΤΑ (ctrl 'optimal'). Κάθε δευτερόλεπτο συγκρίνει τα σχέδια «αλλάζω σε τ s»
    // για τ = 0, 2, …, 60 και αλλάζει τώρα μόνο αν το τ = 0 δίνει τη μικρότερη προβλεπόμενη συνολική αναμονή στον ορίζοντα.
    // Βλέπει ό,τι θα έβλεπε στον δρόμο: ουρές και αφίξεις των επόμενων lookahead s σε προσβάσεις με ανιχνευτή·
    // πέρα από αυτά υποθέτει τη ροή του προηγούμενου 5λέπτου. Τα όρια ασφαλείας είναι ίδια με των κανόνων.
    var OH = (params && params.optH) ? +params.optH : 120, OW = (params && params.optW != null) ? +params.optW : 0, OT = (params && params.optT) ? +params.optT : 60;
    // Πειραματικές επεκτάσεις (κλειστές εξ ορισμού). optF = 1: η ροή του επόμενου δίλεπτου προβλέπεται από το ιστορικό (προφίλ τυπικής ημέρας)
    // διορθωμένο με το πόσο απέχει το τελευταίο 5λεπτο από το τυπικό. optNet = 1: ο κόμβος γνωρίζει τα οχήματα που του έστειλε ήδη ο ανάντη κόμβος.
    var OF = !!(params && +params.optF), ON = !!(params && +params.optNet);
    // oracle = 1: ΤΕΛΕΙΑ ΓΝΩΣΗ των αφίξεων όλου του ορίζοντα στις προσβάσεις εισόδου (αδύνατο στον δρόμο· μετρά πόσο αξίζει η τέλεια πρόβλεψη).
    // deep = 1: η αναζήτηση διαλέγει και τη διάρκεια του επόμενου πρασίνου, όχι μόνο το πότε αλλάζει το τρέχον.
    var ORA = !!(params && +params.oracle), DEEP = !!(params && +params.deep), DEEPG = [0, 10, 15, 20, 25, 30, 40, 50, 60, 80];
    function typFlow(Ap, t) { return DATA.detectors[Ap.ref].prof[typKey].f[Math.floor(mod(t, 86400) / (DATA.binMin * 60))] * Ap.factor * P.demandScale / 100; }
    function optState(j, t) {
      var list = net.juncs[j].apps, st = { q0: [], sat: [], ph: [], rate: [], known: [], look: [], n: 0 }, i, s, k;
      for (i = 0; i < list.length; i++) {
        var a = list[i], Ap = net.apps[a];
        if (!vis[a]) {
          if (!EST) continue;
          st.q0.push(qe[a]); st.sat.push(Ap.sat); st.ph.push(Ap.phase); st.rate.push(typFlow(Ap, t) * EST / 3600); st.known.push([0]); st.look.push(0); st.n++;
          continue;
        }
        st.q0.push(qlen(a)); st.sat.push(blocked(a) ? 0 : Ap.sat); st.ph.push(Ap.phase);
        var last = flowAt(DATA, Ap, dayKey, t - 300, P), r = last;
        if (OF) { var ty = typFlow(Ap, t - 300); r = ty > 0 ? typFlow(Ap, t + 60) * Math.max(0.5, Math.min(2, last / ty)) : last; }
        st.rate.push(r / 3600);
        var look = (ON && Ap.up >= 0) ? Math.min(OH, Ap.travel) : P.lookahead;
        var kn = []; for (s = 0; s <= look; s++) kn.push(0);
        var tr = transit[a]; for (k = 0; k < tr.length; k++) { var d = tr[k] - t; if (d >= 1 && d <= look) kn[d]++; else if (d < 1) kn[1]++; }
        if (ORA && Ap.up < 0) { for (s = look + 1; s <= OH; s++) kn.push(genAt(a, t + s - P.lookahead)); look = OH; }
        st.known.push(kn); st.look.push(look); st.n++;
      }
      return st;
    }
    // Κόστος ενός σχεδίου σε οχήματα × δευτερόλεπτα αναμονής: η τρέχουσα φάση κρατά το πράσινο άλλα tau s και μετά οι φάσεις
    // εναλλάσσονται ως το τέλος του ορίζοντα, καθεμία ώσπου να αδειάσει η ουρά της (τουλάχιστον το ελάχιστο πράσινο, το πολύ
    // την ανώτατη αναμονή). Αν το κόστος ξεπεράσει το limit σταματά νωρίς και επιστρέφει Infinity.
    var oq = [];
    function planCost(st, cur, tau, limit, tau2) {
      var n = st.n, q0 = st.q0, sat = st.sat, ph = st.ph, rate = st.rate, known = st.known, look = st.look, cost = 0, g = cur, inter = -1, e = 0, stage = 0, i, s;
      for (i = 0; i < n; i++) oq[i] = q0[i];
      for (s = 1; s <= OH; s++) {
        if (inter >= 0) { if (inter >= P.lost) { inter = -1; e = 0; } else inter++; }
        var left = 0;
        for (i = 0; i < n; i++) {
          var v = oq[i] + (s <= look[i] ? known[i][s] : rate[i]);
          if (inter < 0 && ph[i] === g) { v -= sat[i]; if (v < 0) v = 0; }
          oq[i] = v; cost += v; if (ph[i] === g) left += v;
        }
        if (cost > limit) return Infinity;
        if (inter < 0) {
          e++;
          if (stage === 0 ? s >= tau : ((stage === 1 && tau2) ? e >= tau2 : (e >= minG[g] && (left < 0.5 || e >= P.maxRed)))) { stage++; g = 1 - g; inter = 0; }
        }
      }
      for (i = 0; i < n; i++) cost += OW * oq[i];
      return cost;
    }
    function optSwitch(j, cur, t) {
      var st = optState(j, t), c0, k, c;
      if (DEEP) {
        c0 = Infinity;
        for (k = 0; k < DEEPG.length; k++) { if (DEEPG[k] && DEEPG[k] < minG[1 - cur]) continue; c = planCost(st, cur, 0, c0, DEEPG[k]); if (c < c0) c0 = c; }
        for (var tu = 2; tu <= OT; tu += 2) for (k = 0; k < DEEPG.length; k++) {
          if (DEEPG[k] && DEEPG[k] < minG[1 - cur]) continue;
          if (planCost(st, cur, tu, c0 + 1e-9, DEEPG[k]) <= c0 + 1e-9) return false;
        }
        return true;
      }
      c0 = planCost(st, cur, 0, Infinity);
      for (var tau = 2; tau <= OT; tau += 2) if (planCost(st, cur, tau, c0 + 1e-9) <= c0 + 1e-9) return false;   // κάποια αναμονή είναι τουλάχιστον εξίσου καλή
      return true;
    }
    // για επίδειξη: το κόστος κάθε σχεδίου αυτή τη στιγμή στον κόμβο j
    sim.optCosts = function (j) {
      var st = optState(j, sim.t), out = [];
      for (var tau = 0; tau <= OT; tau += 2) out.push({ tau: tau, cost: planCost(st, ad[j].phase, tau, Infinity) });
      return out;
    };
    function optSignal(j, t, S) {
      var A = ad[j];
      if (A.inter >= 0) {
        if (A.inter >= P.lost) { A.inter = -1; A.phase = A.next; A.el = 0; }
        else { S.g = -1; S.amber = 1 - A.next; S.el = A.inter; A.inter++; return; }
      }
      var o = 1 - A.phase;
      if (A.el >= minG[A.phase]) {
        if ((t - lastEnd[j][o] + P.lost >= P.maxRed) || optSwitch(j, A.phase, t)) { A.next = o; A.inter = 1; S.g = -1; S.amber = A.phase; S.el = 0; return; }
      }
      S.g = A.phase; S.el = A.el; A.el++;
    }

    // ΚΟΙΝΗ ΒΕΛΤΙΣΤΟΠΟΙΗΣΗ ΔΙΚΤΥΟΥ (ctrl 'network', ΠΕΙΡΑΜΑ). Μεταβλητές: για κάθε κόμβο που ελέγχεται, σε πόσα s αλλάζει το πράσινο (τ_j).
    // Κόστος: η συνολική αναμονή σε ΟΛΕΣ τις προσβάσεις του δικτύου τα επόμενα OH s. Τα οχήματα που φεύγουν από έναν κόμβο φτάνουν
    // στον επόμενο μετά τον χρόνο διαδρομής, άρα η απόφαση ενός φαναριού μετρά και στις ουρές των επόμενων. Κόμβοι που δεν ελέγχονται
    // (χωρίς ανιχνευτή ή σε βλάβη) ακολουθούν το σταθερό τους πρόγραμμα, που είναι γνωστό εκ των προτέρων.
    // Αναζήτηση: ένας κόμβος τη φορά με τους άλλους σταθερούς (coordinate descent), έως 3 περάσματα ή ώσπου να μην αλλάζει τίποτα.
    // Ίδια όρια ασφαλείας με τους άλλους ελεγκτές· η ανώτατη αναμονή επιβάλλεται χωριστά, όπως στο 'optimal'.
    var NG = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 45, 50, 55, 60], NSW = (params && params.netSweeps) ? +params.netSweeps : 3;
    var netTau = [], netSw = [], nq = [], ndis = [], jg = [], jin = [], je = [], jfi = [], jfromI = [], cg = [], jleft = [];
    for (var jj = 0; jj < nJ; jj++) { netTau.push(OT); netSw.push(false); }
    function netState(t, H) {
      var idx = {}, inc = [], a, i, k, s;
      for (a = 0; a < nA; a++) { if (!vis[a]) continue; idx[a] = inc.length; inc.push(a); }
      var st = { n: inc.length, j: [], ph: [], q0: [], sat: [], cap: [], down: [], up: [], internal: [], share: [], rate: [], upRate: [], kn: [], K: [], travel: [], fixedG: [], ctl: [] };
      for (i = 0; i < inc.length; i++) {
        a = inc[i]; var A = net.apps[a], own = flowAt(DATA, A, dayKey, t - 300, P);
        st.j.push(A.j); st.ph.push(A.phase); st.q0.push(qlen(a)); st.sat.push(A.sat);
        st.cap.push(A.up >= 0 ? A.cap : Infinity);
        st.down.push(A.down >= 0 && idx[A.down] != null ? idx[A.down] : -1);
        st.up.push(A.up >= 0 && idx[A.up] != null ? idx[A.up] : -1);
        st.internal.push(A.up >= 0);
        if (A.up >= 0) {
          var sh = thruShare(A, t), upf = flowAt(DATA, net.apps[A.up], dayKey, t - 300, P);
          st.share.push(sh); st.upRate.push(upf / 3600); st.rate.push(Math.max(0, own - sh * upf) / 3600);
        } else { st.share.push(0); st.upRate.push(0); st.rate.push(own / 3600); }
        var K = A.up >= 0 ? Math.min(H, A.travel) : P.lookahead, kn = new Float64Array(K + 1), tr = transit[a];
        for (k = 0; k < tr.length; k++) { var d = tr[k] - t; if (d < 1) kn[1]++; else if (d <= K) kn[d]++; }
        st.kn.push(kn); st.K.push(K); st.travel.push(A.up >= 0 ? A.travel : 0);
      }
      for (var j = 0; j < nJ; j++) {
        var c = mode(j) === 'adaptive'; st.ctl.push(c);
        if (c) { st.fixedG.push(null); continue; }
        var F = fx[j], pl = F.pl, start = F.start, ext = F.ext, arr = new Int8Array(H + 1);
        for (s = 0; s <= H; s++) {
          var u = t + s, tau = u - start;
          if (tau >= pl.C + ext) {
            start = u; tau = 0; var pp = plans[periodAt(u)], np = pp.j[j];
            if (np !== pl) { pl = np; ext = pp.dir ? mod(np.off - u, np.C) : 0; } else ext = 0;
          }
          var ga = pl.g0 + ext;
          arr[s] = tau < ga ? 0 : tau < ga + P.lost ? -1 : tau < ga + P.lost + pl.g1 ? 1 : -1;
        }
        st.fixedG.push(arr);
      }
      return st;
    }
    function netCost(st, taus, limit) {
      var n = st.n, i, s, j, cost = 0;
      for (i = 0; i < n; i++) { nq[i] = st.q0[i]; if (!ndis[i] || ndis[i].length < OH + 1) ndis[i] = new Float64Array(OH + 1); }
      for (j = 0; j < nJ; j++) {
        if (!st.ctl[j]) continue;
        var A = ad[j];
        if (A.inter >= 0) { jg[j] = A.next; jin[j] = A.inter; je[j] = 0; jfromI[j] = true; }
        else { jg[j] = A.phase; jin[j] = -1; je[j] = A.el; jfromI[j] = false; }
        jfi[j] = true;
      }
      for (s = 1; s <= OH; s++) {
        for (j = 0; j < nJ; j++) {
          if (!st.ctl[j]) { cg[j] = st.fixedG[j][s]; continue; }
          if (jin[j] >= 0) { if (jin[j] >= P.lost) { jin[j] = -1; je[j] = 0; } else jin[j]++; }
          cg[j] = jin[j] < 0 ? jg[j] : -1; jleft[j] = 0;
        }
        for (i = 0; i < n; i++) {
          var v = nq[i] + (s <= st.K[i] ? st.kn[i][s] : 0), d = 0;
          if (st.internal[i]) {
            if (s > P.lookahead) v += st.rate[i];
            if (s > st.travel[i]) v += st.share[i] * (st.up[i] >= 0 ? ndis[st.up[i]][s - st.travel[i]] : st.upRate[i]);
          } else if (s > P.lookahead) v += st.rate[i];
          if (cg[st.j[i]] === st.ph[i]) {
            d = v < st.sat[i] ? v : st.sat[i];
            var dn = st.down[i]; if (dn >= 0 && nq[dn] >= st.cap[dn]) d = 0;
            v -= d;
          }
          ndis[i][s] = d; nq[i] = v; cost += v;
          j = st.j[i]; if (st.ctl[j] && st.ph[i] === jg[j]) jleft[j] += v;
        }
        if (cost > limit) return Infinity;
        for (j = 0; j < nJ; j++) {
          if (!st.ctl[j] || jin[j] >= 0) continue;
          je[j]++;
          var sw = jfi[j] ? (jfromI[j] ? je[j] >= Math.max(taus[j], minG[jg[j]]) : s >= taus[j])
                          : (je[j] >= minG[jg[j]] && (jleft[j] < 0.5 || je[j] >= P.maxRed));
          if (sw) { jfi[j] = false; jg[j] = 1 - jg[j]; jin[j] = 0; }
        }
      }
      for (i = 0; i < n; i++) cost += OW * nq[i];
      return cost;
    }
    function netPlan(t) {
      var j, any = false, elig = [];
      for (j = 0; j < nJ; j++) {
        var A = ad[j], e = mode(j) === 'adaptive' && A.inter < 0 && A.el >= minG[A.phase];
        elig.push(e); netSw[j] = false; if (e) any = true;
      }
      if (!any) return;
      var st = netState(t, OH), taus = [], lo = [];
      for (j = 0; j < nJ; j++) {
        var B = ad[j];
        lo.push(st.ctl[j] && B.inter < 0 ? Math.max(0, minG[B.phase] - B.el) : 0);
        taus.push(Math.max(lo[j], Math.min(OT, netTau[j] - 1)));
      }
      for (var sweep = 0; sweep < NSW; sweep++) {
        var changed = false;
        for (j = 0; j < nJ; j++) {
          if (!st.ctl[j]) continue;
          var best = Infinity, bt = taus[j], old = taus[j];
          for (var g = NG.length - 1; g >= 0; g--) {
            if (NG[g] < lo[j]) continue;
            taus[j] = NG[g];
            var c = netCost(st, taus, best);
            if (c < best - 1e-9) { best = c; bt = NG[g]; }
          }
          taus[j] = bt; if (bt !== old) changed = true;
        }
        if (!changed) break;
      }
      for (j = 0; j < nJ; j++) { netTau[j] = taus[j]; netSw[j] = elig[j] && taus[j] === 0; }
    }
    function netSignal(j, t, S) {
      var A = ad[j];
      if (A.inter >= 0) {
        if (A.inter >= P.lost) { A.inter = -1; A.phase = A.next; A.el = 0; }
        else { S.g = -1; S.amber = 1 - A.next; S.el = A.inter; A.inter++; return; }
      }
      var o = 1 - A.phase;
      if (A.el >= minG[A.phase]) {
        if ((t - lastEnd[j][o] + P.lost >= P.maxRed) || netSw[j]) { A.next = o; A.inter = 1; S.g = -1; S.amber = A.phase; S.el = 0; return; }
      }
      S.g = A.phase; S.el = A.el; A.el++;
    }

    // ΣΥΝΤΟΝΙΣΜΕΝΟ ΠΡΟΓΡΑΜΜΑ ΔΙΚΤΥΟΥ (ctrl 'netplan', ΠΕΙΡΑΜΑ). Μεταβλητές: οι χρόνοι κάθε φαναριού που ελέγχεται — κοινός κύκλος C,
    // πράσινο κύριας οδού g0_j και μετατόπιση off_j (πότε ξεκινά το πράσινο ως προς τους άλλους κόμβους). Κάθε NPER s ο αλγόριθμος
    // αλλάζει τις μεταβλητές μία μία (coordinate descent) και κρατά ό,τι μικραίνει τη συνολική προβλεπόμενη αναμονή ΟΛΟΥ του δικτύου
    // τα επόμενα NPH s. Οι κόμβοι που δεν ελέγχονται ακολουθούν το σταθερό τους πρόγραμμα, και το νέο πρόγραμμα συντονίζεται μαζί τους.
    // Η μετάβαση στο νέο πρόγραμμα σέβεται ελάχιστο πράσινο, ενδιάμεσο χρόνο και ανώτατη αναμονή.
    var NPH = (params && params.npH) ? +params.npH : 300, NPER = (params && params.npPer) ? +params.npPer : 60, NPSW = (params && params.npSweeps) ? +params.npSweeps : 2;
    // npAct = 1: το φανάρι προσαρμόζεται και τοπικά μέσα στο πρόγραμμα — κόβει νωρίτερα πράσινο που δεν χρειάζεται κανείς και κρατά πράσινο που ακόμη αδειάζει ουρά.
    var NPA = !!(params && +params.npAct);
    var NPC = (params && params.npC) ? params.npC : [40, 50, 60, 70, 80, 90, 100, 110, 120], npPlan = null, npNext = t0, npq = [], npdis = [], npSigs = [];
    function npArr(arr, C, g0, off, t) {
      var g1 = C - g0 - 2 * P.lost;
      for (var s = 0; s <= NPH; s++) { var tau = mod(t + s - off, C); arr[s] = tau < g0 ? 0 : tau < g0 + P.lost ? -1 : tau < g0 + P.lost + g1 ? 1 : -1; }
    }
    function npOk(C, g0) { var g1 = C - g0 - 2 * P.lost; return g0 >= minG[0] && g1 >= minG[1] && g0 + 2 * P.lost <= P.maxRed && g1 + 2 * P.lost <= P.maxRed; }
    function npCost(st, limit) {
      var n = st.n, i, s, cost = 0;
      for (i = 0; i < n; i++) { npq[i] = st.q0[i]; if (!npdis[i] || npdis[i].length < NPH + 1) npdis[i] = new Float64Array(NPH + 1); }
      for (s = 1; s <= NPH; s++) {
        for (i = 0; i < n; i++) {
          var v = npq[i] + (s <= st.K[i] ? st.kn[i][s] : 0), d = 0;
          if (st.internal[i]) {
            if (s > P.lookahead) v += st.rate[i];
            if (s > st.travel[i]) v += st.share[i] * (st.up[i] >= 0 ? npdis[st.up[i]][s - st.travel[i]] : st.upRate[i]);
          } else if (s > P.lookahead) v += st.rate[i];
          if (npSigs[st.j[i]][s] === st.ph[i]) {
            d = v < st.sat[i] ? v : st.sat[i];
            var dn = st.down[i]; if (dn >= 0 && npq[dn] >= st.cap[dn]) d = 0;
            v -= d;
          }
          npdis[i][s] = d; npq[i] = v; cost += v;
        }
        if (cost > limit) return Infinity;
      }
      return cost;
    }
    function npOptimise(t) {
      var st = netState(t, NPH), j, ctl = [];
      for (j = 0; j < nJ; j++) { if (st.ctl[j]) ctl.push(j); if (!npSigs[j] || npSigs[j].length < NPH + 1) npSigs[j] = new Int8Array(NPH + 1); }
      if (!ctl.length) { npPlan = null; return; }
      var p = npPlan;
      if (!p) {                                     // πρώτη φορά: ξεκινά από το σταθερό πρόγραμμα που τρέχει τώρα
        var C0 = fx[ctl[0]].pl.C; p = { C: C0, g0: [], off: [] };
        for (j = 0; j < nJ; j++) { var pl = fx[j].pl; p.g0.push(pl.C === C0 ? pl.g0 : Math.round(pl.g0 * C0 / pl.C)); p.off.push(mod(fx[j].start, C0)); }
      }
      p = { C: p.C, g0: p.g0.slice(), off: p.off.slice() };
      for (j = 0; j < nJ; j++) { if (st.ctl[j]) { if (!npOk(p.C, p.g0[j])) p.g0[j] = Math.max(minG[0], Math.min(p.C - 2 * P.lost - minG[1], p.g0[j])); npArr(npSigs[j], p.C, p.g0[j], p.off[j], t); } else npSigs[j].set(st.fixedG[j]); }
      var best = npCost(st, Infinity);
      function tryAll(apply) { var c = npCost(st, best); if (c < best - 1e-9) { best = c; return true; } return false; }
      for (var sw = 0; sw < NPSW; sw++) {
        var changed = false;
        // κοινός κύκλος: κρατά το ποσοστό πράσινου κάθε κόμβου
        var bc = p.C, bg = p.g0.slice(), bo = p.off.slice();
        for (var ci = 0; ci < NPC.length; ci++) {
          var C = NPC[ci]; if (C === bc) continue;
          var g0n = p.g0.map(function (g, jx) { return Math.round(g * (C - 2 * P.lost) / (p.C - 2 * P.lost)); }), ok = true;
          for (var k = 0; k < ctl.length; k++) { j = ctl[k]; if (!npOk(C, g0n[j])) { ok = false; break; } npArr(npSigs[j], C, g0n[j], mod(p.off[j], C), t); }
          if (!ok) continue;
          if (tryAll()) { bc = C; bg = g0n; bo = p.off.map(function (o) { return mod(o, C); }); changed = true; }
        }
        p.C = bc; p.g0 = bg; p.off = bo;
        for (k = 0; k < ctl.length; k++) { j = ctl[k]; npArr(npSigs[j], p.C, p.g0[j], p.off[j], t); }
        for (k = 0; k < ctl.length; k++) {
          j = ctl[k];
          for (var g = minG[0]; g <= p.C - 2 * P.lost - minG[1]; g += 2) {
            if (g === p.g0[j] || !npOk(p.C, g)) continue;
            npArr(npSigs[j], p.C, g, p.off[j], t);
            if (tryAll()) { p.g0[j] = g; changed = true; }
          }
          npArr(npSigs[j], p.C, p.g0[j], p.off[j], t);
          for (var o = 0; o < p.C; o += 2) {
            if (o === p.off[j]) continue;
            npArr(npSigs[j], p.C, p.g0[j], o, t);
            if (tryAll()) { p.off[j] = o; changed = true; }
          }
          npArr(npSigs[j], p.C, p.g0[j], p.off[j], t);
        }
        if (!changed) break;
      }
      npPlan = p; sim.npPlan = p; sim.npCostNow = best;
    }
    function npSignal(j, t, S) {
      var A = ad[j];
      if (A.inter >= 0) {
        if (A.inter >= P.lost) { A.inter = -1; A.phase = A.next; A.el = 0; }
        else { S.g = -1; S.amber = 1 - A.next; S.el = A.inter; A.inter++; return; }
      }
      var o = 1 - A.phase, p = npPlan, target = A.phase;
      if (p) { var tau = mod(t - p.off[j], p.C); target = tau < p.g0[j] ? 0 : (tau < p.C - P.lost ? 1 : 0); }
      var want = target !== A.phase;
      if (NPA && A.el >= minG[A.phase]) { var cur = pressure(j, A.phase, t), oth = pressure(j, o, t); if (!want && cur === 0 && oth > 0) want = true; else if (want && oth === 0 && cur > 0) want = false; }
      if (A.el >= minG[A.phase] && (want || t - lastEnd[j][o] + P.lost >= P.maxRed)) { A.next = o; A.inter = 1; S.g = -1; S.amber = A.phase; S.el = 0; return; }
      S.g = A.phase; S.el = A.el; A.el++;
    }

    // Ο κόμβος ακολουθεί το σταθερό πρόγραμμα (του οποίου το ρολόι τρέχει πάντα), με την ίδια μηχανή καταστάσεων
    // του προσαρμοστικού: κάθε παράδοση ελέγχου σέβεται ελάχιστο πράσινο και ενδιάμεσο χρόνο.
    // ΕΚΤΕΛΕΣΗ ΔΟΣΜΕΝΟΥ ΠΡΟΓΡΑΜΜΑΤΟΣ (ctrl 'replay', ΠΕΙΡΑΜΑ): params.schedule[j] = οι στιγμές που ο κόμβος j αρχίζει να αλλάζει φάση.
    // Χρησιμεύει στην αναζήτηση «με γνώση όλης της ημέρας». Τα όρια ασφαλείας επιβάλλονται και εδώ.
    var RS = (params && params.schedule) || [], rp = [];
    function replaySignal(j, t, S) {
      var A = ad[j], sc = RS[j] || [];
      if (rp[j] == null) rp[j] = 0;
      if (A.inter >= 0) {
        if (A.inter >= P.lost) { A.inter = -1; A.phase = A.next; A.el = 0; }
        else { S.g = -1; S.amber = 1 - A.next; S.el = A.inter; A.inter++; return; }
      }
      var o = 1 - A.phase;
      if (A.el >= minG[A.phase]) {
        var due = rp[j] < sc.length && t >= sc[rp[j]];
        if (due || t - lastEnd[j][o] + P.lost >= P.maxRed) { if (due) rp[j]++; A.next = o; A.inter = 1; S.g = -1; S.amber = A.phase; S.el = 0; return; }
      }
      S.g = A.phase; S.el = A.el; A.el++;
    }
    // ΣΥΝΤΟΝΙΣΜΕΝΟΣ ΕΛΕΓΚΤΗΣ (ctrl 'coord', ΠΕΙΡΑΜΑ). Κρατά τον κύκλο και τη μετατόπιση του σταθερού προγράμματος, άρα και το πράσινο κύμα
    // του άξονα: το πράσινο του κύριου άξονα είναι πάντα αναμμένο στην αρχή του κύκλου. Σε κάθε κύκλο διαλέγει μόνο ΠΟΣΟ θα κρατήσει
    // (το μοίρασμα κύριας/κάθετης) ώστε να είναι ελάχιστη η προβλεπόμενη αναμονή του κόμβου στους δύο επόμενους κύκλους, και γυρίζει
    // νωρίτερα στον κύριο άξονα όταν η κάθετη αδειάσει. Ίδια όρια ασφαλείας.
    var cs = [], cq = [], CW = (params && params.coordW != null) ? +params.coordW : 2;
    function coordSplit(j, t, C, ext) {
      var st = optState(j, t), L = P.lost, lo = minG[0], hi = Math.min(C - 2 * L - minG[1], P.maxRed - 2 * L), best = Infinity, bg = fx[j].pl.g0, g, s, i;
      if (C - 2 * L - lo + 2 * L > P.maxRed) lo = C - P.maxRed;          // το κόκκινο του κύριου άξονα δεν ξεπερνά την ανώτατη αναμονή
      // κάθε φάση παίρνει τουλάχιστον όσο πράσινο χρειάζεται για τις αφίξεις ενός κύκλου (+10%) και για να αδειάσει την ουρά της σε 3 κύκλους
      var need = [0, 0];
      for (i = 0; i < st.n; i++) if (st.sat[i] > 0) need[st.ph[i]] = Math.max(need[st.ph[i]], (st.rate[i] * C * 1.1 + st.q0[i] / 3) / st.sat[i]);
      var lo2 = Math.max(lo, Math.ceil(need[0])), hi2 = Math.min(hi, Math.floor(C - 2 * L - need[1]));
      if (lo2 > hi2) return Math.max(lo, Math.min(hi, Math.round((C - 2 * L) * need[0] / (need[0] + need[1])))) + ext;   // δεν χωράνε και τα δύο: αναλογικό μοίρασμα
      lo = lo2; hi = hi2;
      for (g = lo; g <= hi; g += 2) {
        var cost = 0; for (i = 0; i < st.n; i++) cq[i] = st.q0[i];
        for (s = 1; s <= 2 * C; s++) {
          var u = (s - 1) % C, ph = u < g ? 0 : (u < g + L ? -1 : (u < C - L ? 1 : -1));
          for (i = 0; i < st.n; i++) {
            var v = cq[i] + (s <= st.look[i] ? st.known[i][s] : st.rate[i]);
            if (st.ph[i] === ph) { v -= st.sat[i]; if (v < 0) v = 0; }
            cq[i] = v; cost += v;
          }
          if (cost >= best) break;
        }
        if (cost < best) for (i = 0; i < st.n; i++) cost += CW * C * cq[i];      // όσα μένουν στην ουρά στο τέλος θα περιμένουν κι άλλους κύκλους
        if (cost < best) { best = cost; bg = g; }
      }
      return bg + ext;
    }
    function coordSignal(j, t, S) {
      var A = ad[j], F = fx[j], tau = t - F.start, c = cs[j] || (cs[j] = { start: -1, g0: F.pl.g0 + F.ext, sideDone: false });
      if (c.start !== F.start) { c.start = F.start; c.g0 = coordSplit(j, t, F.pl.C, F.ext); c.sideDone = false; }
      if (t === t0) { A.phase = 0; A.el = 0; A.inter = -1; }
      if (A.inter >= 0) {
        if (A.inter >= P.lost) { A.inter = -1; A.phase = A.next; A.el = 0; }
        else { S.g = -1; S.amber = 1 - A.next; S.el = A.inter; A.inter++; return; }
      }
      var o = 1 - A.phase, want = (tau < c.g0 || c.sideDone) ? 0 : 1, endSide = F.pl.C + F.ext - P.lost;
      if (A.el >= minG[A.phase]) {
        var sw = false;
        if (t - lastEnd[j][o] + P.lost >= P.maxRed) sw = true;
        else if (A.phase === 0) sw = want === 1 && tau + P.lost + minG[1] <= endSide;       // δίνει κάθετη μόνο αν χωρά ολόκληρο το ελάχιστο πράσινό της
        else sw = want === 0 || tau >= endSide || pressure(j, 1, t) === 0;                    // τέλος παραθύρου ή άδεια κάθετη
        if (sw) { if (A.phase === 1) c.sideDone = true; A.next = o; A.inter = 1; S.g = -1; S.amber = A.phase; S.el = 0; return; }
      }
      S.g = A.phase; S.el = A.el; A.el++;
    }
    // ΟΧΗΜΑ ΕΚΤΑΚΤΗΣ ΑΝΑΓΚΗΣ (ΠΕΙΡΑΜΑ). sim.addEV(['ar_E', 'kp_E'], t, { preempt: true }) βάζει ένα όχημα που διασχίζει τις προσβάσεις με τη σειρά.
    // Δεν προσπερνά τα οχήματα που στέκονται μπροστά του, αλλά όταν φτάσει πρώτο στη γραμμή περνά και με κόκκινο (ΚΟΚ).
    // Άρα ο μόνος τρόπος να περάσει γρήγορα είναι να έχει αδειάσει η ουρά μπροστά του.
    // Με preempt, κάθε φανάρι της διαδρομής γυρίζει στο πράσινο της κατεύθυνσής του λίγο πριν φτάσει (όσο χρειάζεται για να αδειάσει η ουρά)
    // και το κρατά ώσπου να περάσει. ΤΑ ΟΡΙΑ ΑΣΦΑΛΕΙΑΣ ΔΕΝ ΧΑΛΑΡΩΝΟΥΝ: ελάχιστο πράσινο, ενδιάμεσος χρόνος και ανώτατη αναμονή ισχύουν κανονικά.
    var evs = [], pre = {}, EVC = (params && params.evCaution != null) ? +params.evCaution : 3;
    sim.evs = evs;
    sim.addEV = function (route, t, opt) {
      var ev = { route: route.map(function (id) { return net.apps.filter(function (x) { return x.id === id; })[0].idx; }), k: 0, state: 'wait', tStart: t, pre: !!(opt && opt.preempt), notice: (opt && +opt.notice) || 0, log: [], done: false, arr: 0, target: 0, t0: 0, tEnd: 0, head: -1 };
      evs.push(ev); return ev;
    };
    sim.preempted = function (j) { return pre[j] != null; };
    function evEnter(t) {
      for (var e = 0; e < evs.length; e++) { var ev = evs[e]; if (ev.state === 'wait' && t >= ev.tStart) { var a = ev.route[0]; transit[a].push(t + P.lookahead); st.gen[a]++; ev.arr = t + P.lookahead; ev.t0 = t; ev.state = 'transit'; } }
    }
    function evArrive(t) {
      pre = {};
      for (var e = 0; e < evs.length; e++) {
        var ev = evs[e]; if (ev.done || (ev.state === 'wait' && !(ev.pre && t >= ev.tStart - ev.notice))) continue;   // notice: ο χειριστής δίνει την εντολή τόσα s πριν μπει το όχημα
        var a = ev.route[ev.k];
        if (ev.state === 'transit' && ev.arr <= t) { ev.state = 'queue'; ev.target = st.served[a] + qlen(a); ev.log.push({ j: net.apps[a].j, a: a, arrive: t, depart: -1, ahead: qlen(a) - 1 }); }
        if (!ev.pre) continue;
        var eta = ev.state === 'queue' ? t : ev.state === 'wait' ? ev.tStart + P.lookahead : ev.arr;
        for (var m = ev.k; m < ev.route.length; m++) {
          var b = ev.route[m], B = net.apps[b]; if (m > ev.k) eta += B.travel;
          if (eta - t <= P.lost + minG[1 - B.phase] + qlen(b) / B.sat + 12) pre[B.j] = B.phase;
        }
      }
    }
    function evDepart(t) {
      for (var e = 0; e < evs.length; e++) {
        var ev = evs[e]; if (ev.done || ev.state !== 'queue') continue;
        var a = ev.route[ev.k], L = ev.log[ev.log.length - 1];
        if (st.served[a] < ev.target) {
          // ΚΟΚ: με φάρους και σειρήνα το όχημα περνά και με κόκκινο. Το σταματούν μόνο τα οχήματα που στέκονται μπροστά του.
          // Όταν φτάσει πρώτο στη γραμμή και το φανάρι δεν είναι πράσινο, διασχίζει μετά από EVC s προσοχής (αν δεν είναι γεμάτος ο επόμενος σύνδεσμος).
          if (st.served[a] !== ev.target - 1 || sig[net.apps[a].j].g === net.apps[a].phase || blocked(a)) { ev.head = -1; continue; }
          if (ev.head < 0) ev.head = t;
          if (t - ev.head < EVC) continue;
          var arr0 = q[a][qh[a]++]; st.served[a]++; st.delay[a] += t - arr0; if (t > arr0) st.stops[a]++; L.red = true;
        }
        ev.head = -1; L.depart = t; if (L.red == null) L.red = false;
        if (ev.k + 1 < ev.route.length) { var d = ev.route[++ev.k], D = net.apps[d]; transit[d].push(t + D.travel); st.recv[d]++; ev.arr = t + D.travel; ev.state = 'transit'; }
        else { ev.done = true; ev.tEnd = t; }
      }
    }
    function preemptSignal(j, t, S) {
      var A = ad[j];
      if (A.inter >= 0) {
        if (A.inter >= P.lost) { A.inter = -1; A.phase = A.next; A.el = 0; }
        else { S.g = -1; S.amber = 1 - A.next; S.el = A.inter; A.inter++; return; }
      }
      var o = 1 - A.phase;
      if (A.el >= minG[A.phase] && (A.phase !== pre[j] || t - lastEnd[j][o] + P.lost >= P.maxRed)) { A.next = o; A.inter = 1; S.g = -1; S.amber = A.phase; S.el = 0; return; }
      S.g = A.phase; S.el = A.el; A.el++;
    }
    function trackSignal(j, t, S) {
      var A = ad[j], F = fsig[j], target = F.g >= 0 ? F.g : 1 - F.amber;
      if (t === t0) {                                     // εκκίνηση: ξεκινά ήδη συγχρονισμένος με το πρόγραμμα
        if (F.g >= 0) { A.phase = F.g; A.el = F.el; A.inter = -1; }
        else { A.phase = F.amber; A.next = target; A.inter = F.el + 1; S.g = -1; S.amber = F.amber; S.el = F.el; return; }
      }
      if (A.inter >= 0) {
        if (A.inter >= P.lost) { A.inter = -1; A.phase = A.next; A.el = 0; }
        else { S.g = -1; S.amber = 1 - A.next; S.el = A.inter; A.inter++; return; }
      }
      if (A.el >= minG[A.phase]) {
        // Η ανώτατη αναμονή ισχύει και εδώ: όταν ο έλεγχος αλλάζει χέρια, το κόκκινο που έδωσε ο προσαρμοστικός
        // δεν προστίθεται στο κόκκινο του προγράμματος. Όριο = ανώτατη αναμονή, ή το κόκκινο του ίδιου του προγράμματος αν είναι μεγαλύτερο.
        var o = 1 - A.phase, pl = fx[j].pl;
        var cap = Math.max(P.maxRed, o === 1 ? pl.g0 + fx[j].ext + 2 * P.lost : pl.g1 + 2 * P.lost);
        if (A.phase !== target || t - lastEnd[j][o] + P.lost >= cap) { A.next = o; A.inter = 1; S.g = -1; S.amber = A.phase; S.el = 0; return; }
      }
      S.g = A.phase; S.el = A.el; A.el++;
    }

    sim.step = function () {
      if (sim.done) return;
      var t = sim.t, bi = Math.min(nb - 1, Math.floor((t - t0) / 300)), a, A, n, i;
      // 1. νέες αφίξεις (είσοδοι και ενδιάμεσες πηγές)
      for (a = 0; a < nA; a++) {
        A = net.apps[a];
        n = genAt(a, t);
        for (i = 0; i < n; i++) transit[a].push(t + P.lookahead);
        st.gen[a] += n;
      }
      if (evs.length) evEnter(t);
      // 2. όσα έφτασαν στη γραμμή στάσης μπαίνουν στην ουρά
      for (a = 0; a < nA; a++) {
        var tr = transit[a];
        if (!tr.length) continue;
        var keep = [];
        for (i = 0; i < tr.length; i++) { if (tr[i] <= t) { q[a].push(tr[i]); series.arr[bi]++; } else keep.push(tr[i]); }
        transit[a] = keep;
      }
      if (evs.length) evArrive(t);
      // 3. σηματοδότες (στην κοινή βελτιστοποίηση η απόφαση για όλους τους κόμβους παίρνεται μαζί, πριν από τον βρόχο)
      if (ctrl === 'network') netPlan(t);
      if (ctrl === 'netplan' && t >= npNext) { npOptimise(t); npNext = t + NPER; }
      for (var j = 0; j < nJ; j++) {
        var S = sig[j];
        if (ctrl === 'fixed') fixedSignal(j, t, S);
        else { fixedSignal(j, t, fsig[j]); if (pre[j] != null) preemptSignal(j, t, S); else if (mode(j) !== 'adaptive') trackSignal(j, t, S); else if (ctrl === 'optimal') optSignal(j, t, S); else if (ctrl === 'network') netSignal(j, t, S); else if (ctrl === 'netplan') npSignal(j, t, S); else if (ctrl === 'replay') replaySignal(j, t, S); else if (ctrl === 'coord') coordSignal(j, t, S); else adaptiveSignal(j, t, S); }
        if (S.g !== S.prev) {
          if (S.prev >= 0) { lastEnd[j][S.prev] = t; sim.swLog[j].push(t); }
          if (S.g >= 0) { maxRedSeen[j][S.g] = Math.max(maxRedSeen[j][S.g], t - lastEnd[j][S.g]); if (S.g === 0) starts[j]++; }
          S.prev = S.g;
        }
      }
      if (EST) for (a = 0; a < nA; a++) if (!vis[a]) {
        A = net.apps[a]; qe[a] += typFlow(A, t) * EST / 3600;
        if (sig[A.j].g === A.phase) qe[a] = Math.max(0, qe[a] - A.sat);
      }
      // 4. εκφόρτιση
      for (a = 0; a < nA; a++) {
        A = net.apps[a];
        if (sig[A.j].g !== A.phase) { credit[a] = 0; continue; }
        credit[a] += A.sat;
        while (credit[a] >= 1 && qlen(a) > 0 && !blocked(a)) {
          var arr = q[a][qh[a]++], d = t - arr;
          credit[a] -= 1; st.served[a]++; st.delay[a] += d; if (d > 0) st.stops[a]++;
          series.served[bi]++; series.dep[bi]++; series.depDelay[bi] += d;
          if (A.down >= 0) {
            var D = net.apps[A.down];
            thruAcc[a] += thruShare(D, t);
            if (thruAcc[a] >= 1) { thruAcc[a] -= 1; transit[A.down].push(t + D.travel); st.recv[A.down]++; }
          }
        }
        if (qlen(a) === 0 && credit[a] > 1) credit[a] = 1;
        if (qh[a] > 512) { q[a] = q[a].slice(qh[a]); qh[a] = 0; }
      }
      if (evs.length) evDepart(t);
      // 5. στατιστικά
      for (a = 0; a < nA; a++) {
        A = net.apps[a]; n = qlen(a);
        st.qInt[a] += n; series.qInt[bi] += n;
        if (n > st.maxQ[a]) st.maxQ[a] = n;
        if (A.up >= 0 ? occ(a) >= A.cap : n > A.storeVeh) st.spill[a]++;
      }
      sim.t = t + 1;
      if (sim.t >= t1) sim.done = true;
    };

    sim.summary = function () {
      var el = Math.max(1, sim.t - t0), r = { arrived: 0, served: 0, queued: 0, transit: 0, gen: 0, recv: 0, qInt: 0, stops: 0, spill: 0, maxQ: 0, maxQm: 0, maxQid: '', per: [] };
      for (var a = 0; a < nA; a++) {
        var A = net.apps[a], inq = qlen(a), arrived = st.served[a] + inq;
        r.gen += st.gen[a]; r.recv += st.recv[a]; r.served += st.served[a]; r.queued += inq; r.transit += transit[a].length;
        r.arrived += arrived; r.qInt += st.qInt[a]; r.stops += st.stops[a]; r.spill += st.spill[a];
        var m = st.maxQ[a] * P.spacing / A.lanes;
        if (st.maxQ[a] > r.maxQ) { r.maxQ = st.maxQ[a]; r.maxQm = m; r.maxQid = A.id; }
        r.per.push({ id: A.id, arrived: arrived, served: st.served[a], delay: arrived ? st.qInt[a] / arrived : 0, maxQ: st.maxQ[a], maxQm: m, spill: st.spill[a], queued: inq });
      }
      r.meanDelay = r.arrived ? r.qInt / r.arrived : 0;      // ∫ουράς dt / αφίξεις — μετρά και όσους περιμένουν ακόμη
      r.delayH = r.qInt / 3600;
      r.stopsPct = r.served ? 100 * r.stops / r.served : 0;
      r.nowQ = r.queued;
      r.maxRed = [0, 0];
      for (var j = 0; j < nJ; j++) for (var p = 0; p < 2; p++) r.maxRed[p] = Math.max(r.maxRed[p], maxRedSeen[j][p], sig[j].g === p ? 0 : sim.t - lastEnd[j][p]);
      r.cycle = 0; for (j = 0; j < nJ; j++) r.cycle += starts[j] > 1 ? el / starts[j] : el; r.cycle /= nJ;
      r.conserved = (r.gen + r.recv) === (r.served + r.queued + r.transit);
      return r;
    };
    sim.run = function () { while (!sim.done) sim.step(); return sim; };
    return sim;
  }

  return { DEFAULTS: DEFAULTS, PERIODS: PERIODS, periodAt: periodAt, createSim: createSim, flowAt: flowAt, buildNet: buildNet };
})();
if (typeof module !== 'undefined') module.exports = SimCore;
