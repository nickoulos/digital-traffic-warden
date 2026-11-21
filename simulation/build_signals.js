// build_signals.js — osm-signals.json (σηματοδότες του OpenStreetMap) → signals-data.js για τον χάρτη του control.html.
// Οι κόμβοι OSM που απέχουν λιγότερο από 45 m ενώνονται σε ένα σημείο (μία διασταύρωση έχει συνήθως αρκετούς). © OpenStreetMap contributors, ODbL.
const fs = require('fs'), path = require('path');
const BOX = [37.964, 23.715, 38.004, 23.785];   // νότια, δυτικά, βόρεια, ανατολικά: η περιοχή που δείχνει ο χάρτης
const el = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app', 'osm-signals.json'), 'utf8')).elements.filter(n => n.lat > BOX[0] && n.lat < BOX[2] && n.lon > BOX[1] && n.lon < BOX[3]);
const m = (a, b) => 111000 * Math.hypot(a.lat - b.lat, (a.lon - b.lon) * 0.788), groups = [];
el.forEach(n => { const g = groups.find(g => m(g, n) < 45); if (g) { g.lat = (g.lat * g.n + n.lat) / (g.n + 1); g.lon = (g.lon * g.n + n.lon) / (g.n + 1); g.n++; } else groups.push({ lat: n.lat, lon: n.lon, n: 1 }); });
fs.writeFileSync(path.join(__dirname, '..', 'app', 'signals-data.js'), '// Παράγεται από το build_signals.js. Θέσεις σηματοδοτών: © OpenStreetMap contributors, ODbL.\nwindow.SIGNALS = ' + JSON.stringify(groups.map(g => [+g.lat.toFixed(5), +g.lon.toFixed(5)])) + ';\n');
console.log(el.length + ' κόμβοι OSM → ' + groups.length + ' σημεία');
