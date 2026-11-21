// Ποιότητα αέρα για το ride.html: οι σταθμοί Smart Sense του Δήμου Αθηναίων (opendata.cityofathens.gr, CC BY 4.0).
//   node build_air.js   → air-data.js (και air-geocode.json, η θέση κάθε σταθμού, για να μη ρωτάμε ξανά)
// Μετρήσεις: ωριαίες, με χρονοσήμανση UTC «στρογγυλεμένη προς τα πάνω» (interval_timestamp 07:00Z = 06:00–07:00Z = 08:00–09:00 ώρα Ελλάδας τον Νοέμβριο).
// Το σύνολο δεδομένων δίνει μόνο διευθύνσεις, όχι συντεταγμένες: η θέση βρίσκεται από τη διεύθυνση με το Nominatim του OpenStreetMap
// (ένα αίτημα το δευτερόλεπτο). Θέσεις έξω από την Αθήνα απορρίπτονται.
// Φθηνοί αισθητήρες, όχι σταθμοί αναφοράς. Μονάδες όπως τις δίνει ο Δήμος (το σύνολο δεδομένων δεν τις αναφέρει· πιθανότατα µg/m³).
const fs = require('fs'), path = require('path');
const API = 'https://opendata.cityofathens.gr/api/3/action/datastore_search';
const DATA_RES = 'a84cabca-bd0c-434d-8bee-21c082183442', REG_RES = '47ba486c-4ecf-497e-892b-4e47c53f422a';
const DAY = '2026-11-03', NOW_Z = 7, NIGHT_Z = [1, 2, 3, 4];   // 08:00–09:00 και 02:00–06:00 ώρα Ελλάδας
const UA = 'digital-traffic-warden-hackathon/1.0 (open-data demo)';
const GEO = path.join(__dirname, '..', 'app', 'air-geocode.json'), OUT = path.join(__dirname, '..', 'app', 'air-data.js');
// Διευθύνσεις που το Nominatim δεν βρίσκει ή βρίσκει αλλού (π.χ. η Πλατεία Αιγύπτου είναι στην Αθήνα, όχι στην Αγ. Παρασκευή).
const QUERY = { 1: 'Κολυμβητήριο Γουδή, Αθήνα', 3: 'Μάρκου Μουσούρου 70, Αθήνα', 21: 'Λόφος Γιαλούρου, Αθήνα', 62: 'Πλατεία Αιγύπτου, Αθήνα 104 34',
  63: 'Τσαμαδού, Εξάρχεια, Αθήνα', 74: 'Πλατεία Πέτρουλα, Κολωνός, Αθήνα', 90: 'Πλατεία Τράλλεων, Γαλάτσι' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = async url => { for (let i = 0; i < 4; i++) { try { const r = await fetch(url, { headers: { 'User-Agent': UA } }); if (r.ok) return r.json(); } catch (e) {} await sleep(2000 * (i + 1)); } throw new Error('απέτυχε: ' + url); };
const inAthens = (lat, lon) => lat > 37.90 && lat < 38.10 && lon > 23.62 && lon < 23.85;

(async () => {
  const reg = (await get(API + '?resource_id=' + REG_RES + '&limit=500')).result.records;
  const hours = []; for (let h = 0; h < 24; h++) hours.push(DAY + 'T' + String(h).padStart(2, '0') + ':00:00');
  const filt = encodeURIComponent(JSON.stringify({ interval_timestamp: hours }));
  const rows = (await get(API + '?resource_id=' + DATA_RES + '&limit=5000&filters=' + filt)).result.records;
  const geo = fs.existsSync(GEO) ? JSON.parse(fs.readFileSync(GEO, 'utf8')) : {};
  for (const s of reg) {
    if (geo[s.station_id] && geo[s.station_id].lat != null && !QUERY[s.station_id]) continue;
    if (geo[s.station_id] && geo[s.station_id].q === QUERY[s.station_id]) continue;
    const qs = [QUERY[s.station_id], s.station_address && s.station_address.trim(), s.station_name + ', Αθήνα'].filter(Boolean);
    for (const q of qs) {
      await sleep(1100);
      const r = await get('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=gr&q=' + encodeURIComponent(q));
      if (r[0] && inAthens(+r[0].lat, +r[0].lon)) { geo[s.station_id] = { lat: +r[0].lat, lon: +r[0].lon, q, hit: r[0].display_name }; break; }
    }
    if (!geo[s.station_id]) geo[s.station_id] = { lat: null, lon: null, q: qs.join(' | ') };
    console.log(s.station_id, s.station_name, '→', geo[s.station_id].lat ? geo[s.station_id].lat.toFixed(5) + ', ' + geo[s.station_id].lon.toFixed(5) : 'δεν βρέθηκε');
  }
  fs.writeFileSync(GEO, JSON.stringify(geo, null, 1));
  const val = (id, z, k) => { const r = rows.find(x => x.station_id === id && x.interval_timestamp === DAY + 'T' + String(z).padStart(2, '0') + ':00:00'); return r && r[k] != null ? +r[k] : null; };
  const mean = a => { const v = a.filter(x => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  const st = reg.map(s => ({
    id: s.station_id, name: s.station_name, lat: geo[s.station_id].lat, lon: geo[s.station_id].lon,
    no2: val(s.station_id, NOW_Z, 'no2'), no2Night: mean(NIGHT_Z.map(z => val(s.station_id, z, 'no2'))),
    co: val(s.station_id, NOW_Z, 'co'), coNight: mean(NIGHT_Z.map(z => val(s.station_id, z, 'co')))
  })).filter(s => s.lat != null && s.no2 != null && s.no2Night != null);
  const r1 = x => Math.round(x * 10) / 10;
  const A = {
    source: 'Δήμος Αθηναίων, Smart Sense (opendata.cityofathens.gr, CC BY 4.0)', day: DAY, now: '08:00–09:00', night: '02:00–06:00',
    stations: st.map(s => ({ id: s.id, name: s.name, lat: +s.lat.toFixed(5), lon: +s.lon.toFixed(5), no2: r1(s.no2), no2Night: r1(s.no2Night), co: r1(s.co), coNight: r1(s.coNight) }))
  };
  fs.writeFileSync(OUT, '// Παράγεται από το build_air.js. Μην αλλάζετε με το χέρι.\nwindow.AIR = ' + JSON.stringify(A) + ';\n');
  console.log('σταθμοί με θέση και μέτρηση: ' + st.length + ' από ' + reg.length + '. NO₂ ' + A.now + ': μέσος ' + r1(mean(st.map(s => s.no2))) + ', νύχτα ' + r1(mean(st.map(s => s.no2Night))));
})().catch(e => { console.error(e); process.exit(1); });
