# Βάση γνώσης

| Αρχείο | Τι περιέχει |
|---|---|
| [model.md](model.md) | Πώς δουλεύει η προσομοίωση και οι ελεγκτές. Τι είναι μετρημένο και τι παραδοχή, τα όρια, τι χρειάζεται ένας πιλότος. **Διαβάστε το πρώτο.** |
| [data-sources.md](data-sources.md) | Από πού έρχονται τα δεδομένα, με ποια άδεια, και τι δεν υπάρχει ανοιχτά. |
| [facts.md](facts.md) | Εξωτερικά στοιχεία με πηγή και βαθμό βεβαιότητας: σηματοδότηση στην Αττική σήμερα, τι έχει μετρηθεί αλλού, Traffic Commander και αρμοδιότητες. |

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
| [results/experiment-impact.md](results/experiment-impact.md) | Οι τρεις άξονες της απλής οθόνης μαζί: πόσες ώρες, πόσο CO₂, πόσο καθυστερεί ένα ασθενοφόρο; Οι αριθμοί της απλής παρουσίασης. | `experiment-impact.js` |
| [results/experiment-neighbours.md](results/experiment-neighbours.md) | Τι παθαίνουν τα γειτονικά φανάρια όταν αλλάζουμε την Κηφισίας × Πανόρμου; | `experiment-neighbours.js` |
| [results/experiment-sofias.md](results/experiment-sofias.md) | Ολόκληρη η Λ. Βασ. Σοφίας, 14 φανάρια: τι δίνουν οι σημερινοί ανιχνευτές και τι ένας ανιχνευτής σε κάθε κάθετη; | `experiment-sofias.js` |
| [results/experiment-ride-numbers.md](results/experiment-ride-numbers.md) | Οι αριθμοί του `ride.html`: πόσα αυτοκίνητα μέτρησαν οι ανιχνευτές στη Βασ. Σοφίας 08:00–09:00, πόσο χρόνο έχασαν και τι αλλάζει με τον Τροχονόμο. | `experiment-ride-numbers.js` |
| [results/experiment-ride-time.md](results/experiment-ride-time.md) | Ποια ώρα της 3/11 δείχνει το `ride.html`: η ώρα με το μεγαλύτερο μετρημένο πρόβλημα. | `experiment-ride-time.js` |
| [results/experiment-emergency.md](results/experiment-emergency.md) | Πόσο μένει ένα όχημα έκτακτης ανάγκης πίσω από ουρές, με και χωρίς προτεραιότητα; | `experiment-emergency.js` |

Τα ακατέργαστα αποτελέσματα ανά εκτέλεση (JSON) είναι στο `results/raw/`.
