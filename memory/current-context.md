# current-context

## Active

Szczegóły zwrotu (RMZ): przebudowa UX jak Panel Zamówienia — bez Terminala WMS w layoucie, etykieta panelu = `PanelBulkStatusPickerDropdown` / `PanelTreeStatusItem`, decyzje produktu jako samodzielne segmented buttons.

## Constraints

- Tylko UX/UI — bez zmian logiki / backendu
- Status panelu SSOT: `PanelTreeStatusItem` (nie osobny renderer dla zwrotów)
- WMS: tylko akcja w menu ⋮ gdy moduł aktywny (`inventory_management_mode !== DOCUMENTS_ONLY`)
