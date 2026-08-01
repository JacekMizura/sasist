# current-context

## Active

UX zwrotów/reklamacji w Panelu (bez zmian backendu):

- Dropdown: aktywne zgłoszenia + Nowy zwrot / Nowa reklamacja / Formularz zwrotu
- Operator create = `OrderCaseCreateView` (klient + adres + produkty + summary)
- Formularz klienta = `/orders/:id/customer-return-form`
- Wiadomości/Dokumenty: bez „Przejdź do…”; klik wiadomości → Komunikacja + scroll
- Komentarz klienta: filtr `displayCustomerComment` (bez logów systemowych)

## Constraints

- Tylko UX; WMS = realizacja; bez zmian API create
