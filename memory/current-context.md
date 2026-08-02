# current-context

## Active

Tryby operacyjne WMS = tylko tryby floor/terminal; Operacje/Wózki/QC/Dokumenty/Analiza/Zakupy/Etykiety → Uprawnienia (migracja legacy mode→permission).

## Constraints

- Dual-read: empty modes nadal otwiera Operacje; non-empty wymaga `warehouse.operations` (lub legacy key)
- Legacy-only JSON (`["operations","carts"]`) nie jest zerowane do `[]`/`null` (to = wszystkie tryby floor) — grant perms + keep keys do admin save
- Brak zmiany dostępu po migracji
