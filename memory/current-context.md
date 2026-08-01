# current-context

## Active

Zwroty/reklamacje w Panelu Zamówienia (create in-panel):

- Header: Nowy zwrot / Nowa reklamacja → `OrderCaseCreateView` (nie WMS)
- Lista produktów + „Dodaj do zwrotu/reklamacji” + prawy panel podsumowania
- Po zapisie: karta `/orders/returns/:id` lub `/orders/complaints/:id`; RMZ i tak w WMS
- Usunięto Spakuj z headera; Dokumenty = tylko wystawione + 2 akcje wystawiania

## Constraints

- Tworzenie w Panelu; WMS = realizacja magazynowa (opcjonalny link)
- Bez zmian kontraktu backend create (lines w `createWmsReturn` / `createComplaintFromOrder`)
