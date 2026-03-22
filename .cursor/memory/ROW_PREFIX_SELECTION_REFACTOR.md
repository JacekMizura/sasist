# Row prefix selection refactor

## Summary

- **Removed** global row prefix state and sidebar UI. Row prefix is no longer controlled from the sidebar.
- **Added** modal-based row prefix selection: the user is asked for the row prefix only when creating a new row or placing a rack on empty canvas.
- **Updated** row creation flow so that `placeEmptyRow`, `placeRowWithTemplate`, and catalog drop (new rack on empty space) request the prefix via `RowPrefixModal` and pass the chosen prefix into the creation logic.

## Changes

### Removed

- **Global state** `currentRowPrefix` / `setCurrentRowPrefix` from `useDesignerRowState.ts` and from `WarehouseDesigner.tsx`.
- **RackSidebar** UI for "Aktualny rząd" and "Re-index", and props: `currentRowPrefix`, `setCurrentRowPrefix`, `onReindexRow`.
- **Hooks** no longer take `currentRowPrefix`: `useDesignerRowOperations`, `useDesignerRackPlacement`.

### Added

- **RowPrefixModal** (`frontend/src/components/warehouse/RowPrefixModal.tsx`): modal with title "Wybierz indeks rzędu", label "Prefix rzędu", input (default "A"), buttons "Anuluj" and "OK". Props: `open`, `onClose`, `onConfirm(prefix)`, `defaultPrefix`.
- **WarehouseDesigner** state: `rowPrefixModalOpen`, `pendingRowCreation` (typed as `emptyRow` | `rowWithTemplate` | `stampRack` | null).
- **Wrappers**: opening the row prefix modal when a new row or rack is requested, then on confirm running the corresponding action with the selected prefix.

### Row creation flow

- **Empty row** (draw row tool): ref calls wrapper → modal opens → on OK, `placeEmptyRow(start, end, prefix)`.
- **Row with template** (draw row with template): ref calls wrapper → modal opens → on OK, `placeRowWithTemplate(start, end, item, prefix)`.
- **Drop rack from catalog**:
  - If drop is into an **empty row slot**: `stampRackFromCatalogItem(cell, item)` (prefix from row).
  - If drop **snaps to existing row**: `stampRackFromCatalogItem(cell, item)` (prefix from snap).
  - If drop on **empty canvas**: modal opens → on OK, `stampRackFromCatalogItem(cell, item, prefix)`.

### Files touched

- `frontend/src/components/warehouse/RackSidebar.tsx` – removed row prefix UI and related props.
- `frontend/src/components/warehouse/RowPrefixModal.tsx` – new modal component.
- `frontend/src/pages/WarehouseDesigner/useDesignerRowState.ts` – removed `currentRowPrefix` state.
- `frontend/src/pages/WarehouseDesigner/useDesignerRowOperations.ts` – `currentRowPrefix` removed from params; `placeEmptyRow(start, end, rowPrefix)`, `placeRowWithTemplate(start, end, item, rowPrefix)`; `fillSelectedRowWithTemplate` uses selected row’s prefix.
- `frontend/src/pages/WarehouseDesigner/useDesignerRackPlacement.ts` – `currentRowPrefix` removed; `stampRackFromCatalogItem(cell, item, rowPrefix?)`; `stampRackIntoSlot` uses row’s prefix.
- `frontend/src/pages/WarehouseDesigner.tsx` – modal state, pending callback, `RowPrefixModal`, wrappers for row creation and `handleCatalogDrop` for catalog drop; removed `currentRowPrefix` / `setCurrentRowPrefix` / `onReindexRow` from `RackSidebar` usages.

### Unchanged

- Backend models and layout structure.
- Auto layout generation (e.g. `GenerateWarehouseLayoutModal`) keeps existing `startRowPrefix` logic.
- Rack IDs and bin naming still use the row prefix passed when creating the row/rack.
