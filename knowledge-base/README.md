# Βάση γνώσης

| Αρχείο | Τι περιέχει |
|---|---|
| [model.md](model.md) | Πώς δουλεύει η προσομοίωση και οι ελεγκτές. Τι είναι μετρημένο και τι παραδοχή, τα όρια, τι χρειάζεται ένας πιλότος. **Διαβάστε το πρώτο.** |
| [data-sources.md](data-sources.md) | Από πού έρχονται τα δεδομένα, με ποια άδεια, και τι δεν υπάρχει ανοιχτά. |
| [facts.md](facts.md) | Εξωτερικά στοιχεία με πηγή και βαθμό βεβαιότητας: σηματοδότηση στην Αττική σήμερα, τι έχει μετρηθεί αλλού. |

## Αποτελέσματα (`results/`)

Όλα τα αρχεία εδώ παράγονται από τα scripts του [../simulation/](../simulation/). Μην τα επεξεργάζεστε με το χέρι. Κάθε αριθμός είναι **προσομοίωση**.

| Αρχείο | Ερώτημα | Script |
|---|---|---|
| [results/numbers.md](results/numbers.md) | Οι αριθμοί της παρουσίασης: κάθε κόμβος × σενάριο, 30 εκτελέσεις. | `numbers.js` |
| [results/experiment-optimal.md](results/experiment-optimal.md) | Τρεις απλοί κανόνες ή βελτιστοποίηση; | `experiment-optimal.js` |
| [results/experiment-hybrid.md](results/experiment-hybrid.md) | Βοηθά η πρόβλεψη από ιστορικό, η εικόνα δικτύου ή οι ανιχνευτές σε κάθε πρόσβαση; | `experiment-hybrid.js` |
| [results/experiment-network.md](results/experiment-network.md) | Κοινή απόφαση για όλα τα φανάρια ενός διαδρόμου. | `experiment-network.js` |
| [results/experiment-year.md](results/experiment-year.md) | 365 συνθετικές μέρες με γεγονότα και βλάβες: χάνει ποτέ; παραβιάζει ποτέ όριο ασφαλείας; | `experiment-year.js` |
| [results/experiment-frontier.md](results/experiment-frontier.md) | Πόσο απέχουμε από το βέλτιστο, αξία ιστορικού, πού να μπει ο επόμενος ανιχνευτής. | `experiment-frontier.js` |

Τα ακατέργαστα αποτελέσματα ανά εκτέλεση (JSON) είναι στο `results/raw/`.
