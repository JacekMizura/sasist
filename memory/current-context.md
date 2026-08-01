# current-context

## Active

Formularz klienta (`/orders/:id/customer-return-form`) przebudowany od zera:
- feature `customerReturnForm/` — karty produktów, sticky summary 70/30, forma zwrotu z IBAN dopiero przy przelewie
- Operator create (`OrderCaseCreateView`) bez zmian

## Constraints

- Tylko UI/architektura widoków; `createWmsReturn` bez zmian pól API
- Dwa interfejsy: klient (osobna strona) vs operator (panel zamówienia)
