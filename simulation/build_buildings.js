// Κτίρια για το ride.html: περιγράμματα από το OpenStreetMap γύρω από τους τρεις άξονες.
//   node build_buildings.js                κατεβάζει από το Overpass και γράφει buildings-data.js
//   node build_buildings.js <osm.json>     διαβάζει αποθηκευμένη απάντηση Overpass
// Συντεταγμένες: μέτρα από το ίδιο σημείο αναφοράς με το demo.html (ανατολικά, βόρεια), σε δεκατόμετρα.
// Ύψος: από την ετικέτα height ή building:levels· αλλιώς 4 έως 7 όροφοι, σταθερά ανά κτίριο (παραδοχή για την εικόνα).
const fs = require('fs'), path = require('path');
const BOX = [37.962, 23.718, 38.004, 23.786];   // νότια, δυτικά, βόρεια, ανατολικά: ό,τι βλέπει η κάμερα από ψηλά
const LAT0 = 37.9842, LON0 = 23.7522, COS = Math.cos(LAT0 * Math.PI / 180), MPD = 110540;
const OUT = path.join(__dirname, '..', 'app', 'buildings-data.js');

async function load() {
  if (process.argv[2]) return JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const q = `[out:json][timeout:120];(way["building"](${BOX.join(',')}););out tags geom;`;
  const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'User-Agent': 'osm-buildings-fetch/1.0', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
  if (!r.ok) throw new Error('Overpass ' + r.status);
  return r.json();
}
function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); return (n ^ (n >>> 15)) >>> 0; }

load().then(j => {
  const out = [];
  let tagged = 0;
  for (const e of j.elements) {
    if (e.type !== 'way' || !e.geometry || e.geometry.length < 4) continue;
    const t = e.tags || {};
    let pts = e.geometry.map(g => [Math.round((g.lon - LON0) * COS * MPD * 10), Math.round((g.lat - LAT0) * MPD * 10)]);
    if (pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
    if (pts.length < 3) continue;
    let A = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; A += p[0] * q[1] - q[0] * p[1]; }
    A = Math.abs(A) / 200;   // m²
    if (A < 6) continue;
    let h = parseFloat(t.height), lv = parseFloat(t['building:levels']);
    if (h > 0) tagged++;
    else if (lv > 0) { h = lv * 3.2 + 1; tagged++; }
    else if (A < 60 || t.building === 'roof' || t.building === 'garage' || t.building === 'shed' || t.building === 'kiosk') h = 4;
    else h = (4 + hash(e.id) % 4) * 3.2 + 1;
    h = Math.min(120, Math.round(h * 10) / 10);
    const flat = [h]; for (const p of pts) flat.push(p[0], p[1]);
    out.push(flat);
  }
  const head = '// Παράγεται από το build_buildings.js. Κτίρια © OpenStreetMap contributors (ODbL). Ύψη χωρίς ετικέτα: παραδοχή 4 έως 7 ορόφων.\n';
  fs.writeFileSync(OUT, head + 'window.BLD = ' + JSON.stringify({ lat0: LAT0, lon0: LON0, scale: 0.1, b: out }) + ';\n');
  console.log(out.length + ' κτίρια (' + tagged + ' με ύψος ή ορόφους στο OSM) → ' + path.basename(OUT) + ', ' + Math.round(fs.statSync(OUT).size / 1024) + ' KB');
}).catch(e => { console.error(e.message); process.exit(1); });
