# Inventory count legacy (archived)

Removed from active module paths during UI architecture cleanup (2026-06-08).

These files implemented the **pre document-scoped** WMS flow (singleton queue / execution page).
They are not routed and must not be re-imported without explicit migration.

| File | Was |
|------|-----|
| `WmsInventoryCountExecutionPage.tsx` | Legacy counting page |
| `useWmsInventoryCountExecution.ts` | Legacy counting hook |
| `WmsInventoryTaskQueue.tsx` | Unwired task queue |
| `WmsInventoryTaskRow.tsx` | Queue row |
| `WmsInventoryMinimalQueue.tsx` | Compact queue |
| `WmsInventoryTaskFiltersBar.tsx` | Queue filters |
| `WmsInventorySessionSummary.tsx` | Execution summary panel |
| `WmsInventoryEmergencySearch.tsx` | Emergency search overlay |
| `WmsInventoryOperationalSearchModal.tsx` | Modal search |
| `WmsInventoryUniversalSearchModal.tsx` | Ctrl+K modal |
| `WmsInventoryProductChipList.tsx` | Product chips (legacy execution) |

Active WMS flow: see `docs/inventory-architecture.md`.
