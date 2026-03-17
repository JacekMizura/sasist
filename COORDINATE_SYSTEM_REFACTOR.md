# Coordinate System Refactor — Changelog

## Canonical rule

**1 grid cell = 10 cm.** All layout coordinates are stored in cells. The API continues to receive/return centimeters where required (e.g. special locations, dimensions).

---

## 1. Unit mismatch fixed (special locations)

**Problem:** Special locations (Start / Packing / Dock) used `SPECIAL_LOCATION_CELL_CM = 100` (1 cell = 100 cm), while the rest of the layout uses `GRID_UNIT_CM = 10` (1 cell = 10 cm).

**Changes:**
- **DesignerRackPlacement.ts:** Removed `SPECIAL_LOCATION_CELL_CM`. All conversions use the shared rule (1 cell = 10 cm).
- **WarehouseDesigner.tsx:** `addSpecialLocation` now sends `x_cm = cellsToCm(cell.x)` and `y_cm = cellsToCm(cell.y)` so the API still receives centimeters with 1 cell = 10 cm.
- **WarehouseCanvas.tsx:** Special location rendering now uses `GRID_UNIT_CM` (10) instead of a local `SPECIAL_CELL_CM = 100` when converting API cm → cell → pixels. Start/Pack/Dock markers align with the grid.

Result: Placing Start Point or Packing Station uses the same scale as racks and aisles; no more 10× offset.

---

## 2. Render helper added

**New file:** `frontend/src/components/warehouse/renderUtils.ts`

- **`cellToPx(cell, cellPx)`** — Converts a single cell coordinate to pixels (`cell * cellPx`).
- **`rectCellsToPx(x, y, w, h, cellPx)`** — Converts a rect in cell coordinates to a pixel rect `{ x, y, width, height }`.

All layout coordinates are in cells; these helpers standardize cell → pixel conversion for drawing.

---

## 3. Canvas layers refactored to use renderUtils

The following layers now use `cellToPx` from `renderUtils` instead of inline `x * cellPx`:

- **RackLayer.tsx** — Rack rect position/size and label center.
- **RowLayer.tsx** — Empty slots, row-drag ghost slots, and ghost rack rects.
- **SelectionOverlay.tsx** — Drag valid/invalid slots, marquee rect, and selected-rack toolbar position.
- **VisualLayer.tsx** — All visual elements (columns, carts, walls, doors, zones, mezzanines), ghost position, and labels.

**PathLayer** was removed in a previous cleanup and is not present.

---

## 4. Legacy grid logic

- **Checked:** No legacy behavior of the form “if grid_cols <= 24” or similar was found. The only comparison is in `clampGridToBuilding` (warehouseUtils.ts), which correctly clamps `grid_cols` / `grid_rows` to building size in cells (derived from `building_width_m` / `building_depth_m` via `metersToCells`).
- **Assumption:** Grid values (`grid_cols`, `grid_rows`, rack/row/aisle positions) are always in cells. Building dimensions in meters are still used for display and API; conversion to cells uses `metersToCells` in one place (clamp + layout generator / edit building).

---

## 5. Unit conversions centralized in warehouseUtils

**Added in `warehouseUtils.ts`:**
- **`cellsToCm(cells)`** — Centimeters from grid cells (cells × GRID_UNIT_CM).
- **`cellsToMeters(cells)`** — Meters from grid cells (cells × GRID_UNIT_CM / 100).

**Existing helpers (unchanged):**
- **`cmToCells(cm)`** — Grid cells from cm.
- **`metersToCells(m)`** — Grid cells from meters.

**Inline conversions replaced:**
- **WarehouseDesigner.tsx:** Special location API payload uses `cellsToCm(cell.x/y)`; template payload uses `cellsToCm(w/h)` for width_cm/height_cm.
- **useDesignerMouseHandlers.ts:** Cursor position in cm uses `cellsToCm(cell.x/y)`.
- **DesignerKeyboard.ts:** Cursor cm → cell uses `cmToCells(cursorCm.x/y)` for paste/duplicate.
- **RackPropertiesSidebar.tsx:** Cursor cm → cell uses `cmToCells(cursorCm.x/y)`.
- **DesignerRackPlacement.ts:** Snap distances use `cellsToCm(...)` for cm and `cmToCells(target)` for cm → cells; aisle width uses `cmToCells(aisleWidthCm)`.

---

## 6. Files modified

| File | Change |
|------|--------|
| `frontend/src/types/warehouse.ts` | No change (GRID_UNIT_CM = 10 remains source of truth). |
| `frontend/src/pages/WarehouseDesigner/DesignerRackPlacement.ts` | Removed `SPECIAL_LOCATION_CELL_CM`; use `cmToCells`, `cellsToCm` from warehouseUtils. |
| `frontend/src/pages/WarehouseDesigner.tsx` | Special locations use `cellsToCm`; template payload uses `cellsToCm`; import from warehouseUtils. |
| `frontend/src/components/warehouse/WarehouseCanvas.tsx` | Special location rendering uses `GRID_UNIT_CM`; import GRID_UNIT_CM. |
| `frontend/src/components/warehouse/renderUtils.ts` | **New.** `cellToPx`, `rectCellsToPx`. |
| `frontend/src/components/warehouse/WarehouseCanvas/RackLayer.tsx` | Use `cellToPx` from renderUtils. |
| `frontend/src/components/warehouse/WarehouseCanvas/RowLayer.tsx` | Use `cellToPx` from renderUtils. |
| `frontend/src/components/warehouse/WarehouseCanvas/SelectionOverlay.tsx` | Use `cellToPx` from renderUtils. |
| `frontend/src/components/warehouse/WarehouseCanvas/VisualLayer.tsx` | Use `cellToPx` from renderUtils. |
| `frontend/src/components/warehouse/warehouseUtils.ts` | Added `cellsToCm`, `cellsToMeters`. |
| `frontend/src/pages/WarehouseDesigner/useDesignerMouseHandlers.ts` | Cursor cm from `cellsToCm(cell.x/y)`. |
| `frontend/src/pages/WarehouseDesigner/DesignerKeyboard.ts` | Cursor cm → cell via `cmToCells` from warehouseUtils. |
| `frontend/src/components/warehouse/RackPropertiesSidebar.tsx` | Cursor cm → cell via `cmToCells`; removed GRID_UNIT_CM import. |

---

## 7. Verification

The following should still behave correctly:

- **Rack placement** — Catalog drop, row slots, drag; positions in cells; snapping uses `cellsToCm` / `cmToCells`.
- **Snapping** — Distance snap in DesignerRackPlacement uses centralized conversions.
- **Aisle drawing** — Aisle width in cm converted to cells with `cmToCells`.
- **Start point placement** — Add Special Location sends cm via `cellsToCm(cell)`; rendering uses GRID_UNIT_CM.
- **Packing station placement** — Same as Start point.
- **Layout generator** — Uses `cmToCells` / `metersToCells`; grid and building limits unchanged.

No API contract or backend behavior was changed; only the frontend coordinate and conversion logic was standardized to **1 cell = 10 cm** and centralized in `warehouseUtils` and `renderUtils`.
