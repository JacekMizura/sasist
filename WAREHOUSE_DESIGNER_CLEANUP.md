# Warehouse Designer Cleanup — Changelog

## 1. Removed features

- **Manual picking path system**
  - `manualPathPoints` state and all related logic
  - `showPickingPath` toggle and display
  - **Path Tool** (Narzędzie ścieżki) — mode and button
  - **Optimize (S)** (Optymalizuj (S)) — button and `handleMagicWand`
  - **Picking Path** (Ścieżka kompletowania) — toggle and path distance display
  - `useDesignerPath` hook and `usePathInteraction` hook
  - Path point selection: `selectedPathPointIndex`, `selectedPathLine`, `draggingPathPointIndex` and their setters
  - Delete handling for `pathNode:*` and `path` in `deleteObject`

- **PathLayer**
  - Removed `PathLayer` component and its usage in `WarehouseCanvas` (it was used only for manual picking paths).

- **Add Dock**
  - **Add Dock** toolbar button
  - Placement of DOCK in `usePlacementInteraction` (only ADD_START and ADD_PACK are placed now)
  - Keyboard shortcut "3" for ADD_DOCK and crosshair cursor for ADD_DOCK in `useLayoutMode`

- **Show Dimensions**
  - `showDimensions` state and **Show Dimensions** (Pokaż wymiary) checkbox
  - `useDesignerDimensions` hook
  - `DimensionOverlay` usage and dimension/aisle props in `WarehouseCanvas`
  - `showDimensions` parameter in `useRowInteraction` (row drag still uses snap; dimension-only logic removed)

- **Unused alternate designer**
  - Alternate designer implementation that used `WarehouseDesignerContext`: removed so only the main designer (used by the `/designer` and `/warehouse-designer` routes) remains.

---

## 2. Deleted files

| File | Purpose (removed) |
|------|--------------------|
| `frontend/src/components/warehouse/WarehouseCanvas/PathLayer.tsx` | Manual picking path overlay |
| `frontend/src/pages/WarehouseDesigner/useDesignerPath.ts` | Path points and magic-wand logic |
| `frontend/src/pages/WarehouseDesigner/useDesignerDimensions.ts` | Dimension lines and aisle highlights |
| `frontend/src/pages/WarehouseDesigner/interactions/usePathInteraction.ts` | Path tool mouse interaction |
| `frontend/src/pages/WarehouseDesigner/WarehouseDesigner.tsx` | Alternate designer page (context-based) |
| `frontend/src/pages/WarehouseDesigner/Toolbar.tsx` | Alternate designer toolbar |
| `frontend/src/pages/WarehouseDesigner/WarehouseGrid.tsx` | Alternate designer grid |
| `frontend/src/pages/WarehouseDesigner/RackConfiguratorPanel.tsx` | Alternate designer rack config panel |
| `frontend/src/context/WarehouseDesignerContext.tsx` | Context for alternate designer |

---

## 3. Simplified toolbar

The designer toolbar now includes only:

**Layout tools**
- **Draw Aisle** (Alejka)
- **Draw Row** (Rysuj Rząd)
- **Snap to grid** (Przyciągnij do siatki)

**Infrastructure tools**
- **Add Start Point**
- **Add Packing Station**

**View tools**
- **Show grid** (Widoczna siatka)
- **Show labels** (Pokaż etykiety)

**Removed from toolbar**
- Path Tool, Picking Path toggle, Optimize (S), Show Dimensions, Add Dock.

---

## 4. Lines of code removed (approx.)

- Deleted files: ~400 lines (PathLayer, useDesignerPath, useDesignerDimensions, usePathInteraction) + ~22k bytes in alternate designer + context (~500+ lines).
- In-place removals: ~150+ lines across `WarehouseDesigner.tsx`, `useDesignerMouseHandlers.ts`, `WarehouseCanvas.tsx`, `useRowInteraction.ts`, `usePlacementInteraction.ts`, `useRackInteraction.ts`, `useDesignerRowOperations.ts`, `DesignerKeyboard.ts`, `useLayoutMode.ts`.

**Total: on the order of 600+ lines removed** (excluding the alternate designer files, which add several hundred more).

---

## 5. Simulation and core features

- **Unchanged:** API contracts, database schema, and backend logic.
- **Unchanged:** Layout save/load still supports `picking_path` from layout data; it is no longer edited in the UI.
- **Unchanged:** Special locations API still supports `dock`; the UI no longer places docks.
- **Core features preserved:**
  - Draw Aisle, Add Start Point, Add Packing Station
  - Rack placement (catalog, rows, drag)
  - Layout generator, WarehouseCanvas rendering
  - RackLayer, RowLayer, SelectionOverlay
  - Row draw, row drag, marquee selection, visual elements, grid and labels

Simulation-related behavior (layout data, special locations, warehouse graph) remains intact; only unused or unfinished frontend designer features were removed.
