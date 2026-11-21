# Προσομοίωση: scripts

Όλα τρέχουν από τη ρίζα του repo ή από αυτόν τον φάκελο, μόνο με Python 3.9+ / Node.js 18+ (χωρίς εξωτερικές βιβλιοθήκες). Ο πυρήνας της προσομοίωσης είναι το [../app/sim-core.js](../app/sim-core.js), κοινός για τις σελίδες και τα scripts.

## Δεδομένα

| Εντολή | Διαβάζει | Γράφει |
|---|---|---|
| `python build_data.py` | `../data/traffic/` | `../app/data.js`: ζήτηση ανά πρόσβαση, ανά 5 λεπτά, για τους τρεις κόμβους και τις έξι ημέρες |
| `node build_map.js [roads.json]` | `../data/traffic/`, προαιρετικά απάντηση Overpass | `../app/map-data.js`: όλοι οι ανιχνευτές και οι δρόμοι για τον χάρτη του κέντρου ελέγχου |

Οι κόμβοι, η αντιστοίχιση ανιχνευτή → πρόσβαση και οι ημέρες ορίζονται στην αρχή του `build_data.py`.

## Έλεγχος

`node verify.js` ελέγχει τη σύνταξη. Τρέχει κάθε κόμβο × σενάριο και ελέγχει ότι διατηρούνται τα οχήματα. Κάνει **ελέγχους ασφαλείας σε κάθε βήμα**: ενδιάμεσο χρόνο, ελάχιστο πράσινο, ανώτατη αναμονή. Ελέγχει επίσης τους κανόνες ελλιπών δεδομένων και τις σελίδες. Με `--per` δίνει ανάλυση ανά πρόσβαση. Τελειώνει με exit 0 αν όλα περνούν.

## Αριθμοί και πειράματα

Όλα γράφουν στο [../knowledge-base/results/](../knowledge-base/results/).

| Εντολή | Διάρκεια | Αποτέλεσμα |
|---|---|---|
| `node numbers.js` | ~10 λεπτά | `numbers.md`, `numbers.json`, και το `../app/stage-config.js`: ο σπόρος που παίζει η σκηνή, ο πλησιέστερος στη διάμεσο των 30 |
| `node experiment-optimal.js` | λεπτά | κανόνες εναντίον βελτιστοποίησης |
| `node experiment-hybrid.js` | λεπτά | πρόβλεψη από ιστορικό, εικόνα δικτύου, ανιχνευτές παντού |
| `node experiment-network.js run <site> <blind> <ctrl> <από> <έως>` και μετά `report` | ~8 λεπτά/ημέρα για τον `'network'` | ελεγκτές δικτύου |
| `node experiment-year.js <site> [blind] [days]` και μετά `report` | 7–35 λεπτά/κόμβο | 365 συνθετικές μέρες |
| `node experiment-frontier.js …` | βλ. σχόλια στην αρχή του αρχείου | απόσταση από το βέλτιστο, ιστορικό, θέσεις ανιχνευτών |
| `node experiment-neighbours.js run <από> <έως>`, `report`, `export` | ~45 s/σπόρο | η Κηφισίας ως άξονας τριών φαναριών· το `export` γράφει το `../app/corridor-data.js` |
| `node experiment-sofias.js run <σπόρος>`, `report`, `export` | λεπτά/σπόρο | η Λ. Βασ. Σοφίας με 14 φανάρια· το `export` γράφει το `../app/sofias-data.js` |
| `node experiment-emergency.js run <σπόρος>`, `report` | ~1 λεπτό/σπόρο | προτεραιότητα σε όχημα έκτακτης ανάγκης (θέλει το `corridor-data.js`) |
| `node experiment-impact.js run <σπόρος>`, `report` | ~2 λεπτά/σπόρο | οι τρεις άξονες του `../app/demo.html` μαζί, με ρολόι, σημερινούς ανιχνευτές και ανιχνευτή σε κάθε κάθετη· και ασθενοφόρο στη Βασ. Σοφίας |
| `node experiment-ride-numbers.js` | ~10 s | οι αριθμοί του `../app/ride.html` από τα ακατέργαστα δεδομένα της 3/11 και από 10 σπόρους· γράφει το `../app/ride-numbers.js` |
| `node experiment-ride-time.js` | ~1 λεπτό | ποια ώρα δείχνει το `../app/ride.html` |
| `node build_buildings.js [overpass.json]` | ~1 λεπτό | κτίρια από το OpenStreetMap (Overpass) → `../app/buildings-data.js` |
| `node build_signals.js` | δευτερόλεπτα | `../app/osm-signals.json` → `../app/signals-data.js`: οι θέσεις των φαναριών για τον χάρτη |

`site`: `alex` (Λ. Αλεξάνδρας), `kif` (Κηφισίας × Πανόρμου), `iera` (Ιερά Οδός). `blind`: 1 = ο ελεγκτής βλέπει μόνο προσβάσεις με ανιχνευτή (σημερινή κατάσταση), 0 = ανιχνευτής σε κάθε πρόσβαση.
