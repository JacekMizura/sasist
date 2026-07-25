# current-context

## Active

**Magazyn product↔location SSOT** — Projektant Magazynu czyta lokalizacje produktów z jednego indeksu.

### SSOT
- `frontend/src/pages/WarehouseDesigner/productLocationIndex.ts`
- Reguła: inventory qty>0 wygrywa; `assigned_locations` uzupełnia braki; tylko UUID z layoutu
- Konsumenci: wyszukiwarka, highlight mapy, MagazynProductsSidebar, ProductLocatorSidebar, rack click, occupancy bar/tooltip, useDesignerMagazynState

### Occupancy UI
- Cienki pasek na dole regału (zielony / pomarańczowy / czerwony)
- Hover: mały tooltip (nazwa, lokalizacje, produkty, %, pojemność)

### Constraints
Bez commit/push (dopóki user nie poprosi).
Raport: `memory/magazyn-product-location-ssot.md`
