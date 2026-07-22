# current-context

## Active

**Sprzedaż bezpośrednia — UI Przelew + cleanup tekstów** — lokalny commit, bez push.

- Root cause braku „Przelew”: `payment_methods.transfer=false` z starego defaultu zapisany w settings/cache; panel filtruje po flagach.
- Fix: migracja legacy `transfer:false` → `true` (dopóki brak `extensions.ds_payment_methods_v2`); cache `v2`; układ 2×2; usunięte helperteksty Paragon/Odbiór.

## Preferencja commitów (user)

Komunikaty commitów po polsku, krótkie, opisujące co zrobiono.
