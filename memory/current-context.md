# current-context

## Active

**warehouse_id unification (Analizy / Optymalizacja)** — wspólny mechanizm:

- `useWarehouseApiScope()` + `buildWarehouseParams()` (`modules/analizy/warehouseApiScope.ts`)
- UI: `AnalizyWarehouseSelect` (wiązany z `WarehouseContext.setWarehouse`)
- API clients biorą `WarehouseApiScope`, nie kopiują `warehouse_id` w ekranach

Backend / kontrakt API **bez zmian**.

IA hubu:
```
Analizy → Przegląd · Centrum · Raporty · Optymalizacja
```
