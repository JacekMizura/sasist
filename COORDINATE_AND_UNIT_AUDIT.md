# Warehouse Designer – Coordinate and Unit System Audit

**Scope:** Frontend Warehouse Designer and related backend services.  
**Purpose:** Confirm canonical units, map conversions, and identify mixed-unit usage and risks.  
**No code was modified; analysis only.**

---

## SECTION 1 — Canonical unit used in the system

### Definition

- **Canonical unit for layout (racks, aisles, row slots, visuals):** **grid cell**.  
- **1 cell = 10 cm** everywhere in layout and rack placement.

### Where the grid size is defined

| Location | Symbol / constant | Value | Role |
|----------|-------------------|--------|------|
| **Frontend** `frontend/src/types/warehouse.ts` | `GRID_UNIT_CM` | `10` | Single source of truth for “1 cell = N cm”. Re-exported via `warehouseTypes.ts`. |
| **Frontend** `frontend/src/pages/WarehouseDesigner/DesignerRackPlacement.ts` | `CELLS_PER_METER` | `10` | Used for grid_cols/rows interpretation and conversions (1 m = 10 cells). |
| **Frontend** `frontend/src/components/warehouse/WarehouseCanvas.tsx` | `CELLS_PER_METER` | `10` (local) | Grid lines (every 10 cells = 1 m) and row preview length in meters. |
| **Backend** `backend/models/warehouse.py` | `GRID_UNIT_CM` | `10` | Comment and conversion: “Grid: 1 unit = 10 cm. x, y on Rack are in 10cm units.” |
| **Backend** `backend/services/warehouse_layout_service.py` | `GRID_UNIT_CM` (from models) | `10` | Rack cell → cm: `base_x = rack.x * GRID_UNIT_CM`. |

### Stored coordinates (layout state and API)

- **Rack / Aisle / Row slot / Visuals:** `x`, `y`, `width`, `height` are in **grid cells** (integers for racks/aisles/slots; can be number for visuals).
- **Backend Rack model:** `x`, `y`, `width`, `height` are integers in **10 cm units** (i.e. cells).  
- **Backend Location model (special locations and bins):** `x`, `y` are **centimeters** (Float). So “canonical” for layout is cells; for Location it is cm.
- **StorageLocation (bin) model:** `x_cm`, `y_cm`, `z_cm` — **centimeters** (derived from rack cells × GRID_UNIT_CM + offset).

**Conclusion:** The **layout grid** consistently uses **grid cell** as the canonical unit (1 cell = 10 cm). The **Location** and **StorageLocation** tables use **centimeters** as the canonical unit; conversion from layout cells to cm happens in the backend when syncing bins/locations.

---

## SECTION 2 — All coordinate conversion functions

### Frontend

| Function | File | Conversion | Notes |
|----------|------|------------|--------|
| `cmToCells(cm)` | `warehouseUtils.ts` | `Math.round(cm / GRID_UNIT_CM)` | cm → cells. |
| `metersToCells(m)` | `warehouseUtils.ts` | `Math.floor((m * 100) / GRID_UNIT_CM)` | meters → cells (1 m = 10 cells). |
| `snapCm(cm)` | `warehouseUtils.ts` | `Math.round(cm / GRID_UNIT_CM) * GRID_UNIT_CM` | Snap cm to nearest 10 cm. |
| `pathDistanceMeters(points, cellsPerMeter)` | `warehouseUtils.ts` | Sum of `hypot(dx, dy) * (1 / cellsPerMeter)` | Path in **cells** → distance in **meters** (default cellsPerMeter = 10). |
| `getCellFromClientPosition(clientX, clientY, rect, gridCols, gridRows)` | `DesignerRackPlacement/utils/designerMouseUtils.ts` | `(clientX - left) / width * gridCols`, same for Y, then round & clamp | **Pixels** (client) → **cell index** (integer). |
| **Inline:** cell → cm for cursor | `useDesignerMouseHandlers.ts` | `cell.x * GRID_UNIT_CM`, `cell.y * GRID_UNIT_CM` | Used for `cursorCm` (display). |
| **Inline:** cell → cm for special location API | `WarehouseDesigner.tsx` | `cell.x * SPECIAL_LOCATION_CELL_CM`, `cell.y * SPECIAL_LOCATION_CELL_CM` | **Different scale:** SPECIAL_LOCATION_CELL_CM = 100, so 1 cell = 100 cm here (see Section 3). |
| **Inline:** cell → px for rendering | All canvas layers | `x * cellPx`, `y * cellPx` (and + offset for center) | Cells → pixels using `cellPx` (BASE_PX_PER_CELL = 5). |
| **Inline:** special location cm → px | `WarehouseCanvas.tsx` | `(specialLocations.pick_start.x / SPECIAL_CELL_CM) * cellPx + cellPx/2` | SPECIAL_CELL_CM = 100; backend returns x,y in **cm**; canvas treats them as “per 100 cm” to get a scale. So effectively same as (x_cm/100)*cellPx — inconsistent with 10 cm/cell. |
| **Inline:** grid_cols/rows legacy | `WarehouseDesigner.tsx` loadLayout | `(d.grid_cols ?? 24) <= 24 ? (d.grid_cols ?? 24) * CELLS_PER_METER : (d.grid_cols ?? GRID_COLS)` | If backend sends grid_cols ≤ 24, frontend treats it as “meters” and multiplies by 10 to get cells. |
| **Inline:** width_m, length_m | `WarehouseDesigner.tsx` save payload | `width_m: layout.grid_cols / CELLS_PER_METER`, `length_m: layout.grid_rows / CELLS_PER_METER` | Cells → meters for legacy payload. |
| **Inline:** visual dimensions | `WarehouseMainView.tsx` | `ve.width_cm ?? ve.width * GRID_UNIT_CM` | Visuals can store width in cells; display in cm. |

### Backend

| Conversion | File | Formula / role |
|------------|------|-----------------|
| Rack cell → cm | `warehouse_layout_service.py` | `base_x = rack.x * GRID_UNIT_CM`, `base_y = rack.y * GRID_UNIT_CM` (in `_bin_coords_cm`, `_bin_center_and_dimensions_cm`). |
| Distance cm → m | `warehouse_graph_service.py` | `d_cm * CM_TO_M` (0.01); `distance_euclidean_m(x1_cm, y1_cm, x2_cm, y2_cm)` → meters. |
| Graph nodes | `warehouse_graph_service.py` | Node positions stored in **cm** (from Location coordinates). Edges: `distance_m` in meters. |
| Slotting / simulation | `warehouse_graph_service.py`, `route_engine.py`, etc. | Inputs in cm; distances in meters. |

### Summary

- **Shared utilities:** `cmToCells`, `metersToCells`, `snapCm`, `pathDistanceMeters` in `warehouseUtils.ts`; `getCellFromClientPosition` in `designerMouseUtils.ts`.
- **Scattered inline conversions:** cell→cm for cursor and for special-location API, cell→px in every layer, special-location cm→px, legacy grid_cols/rows interpretation, width_m/length_m, visual width_cm fallback.

---

## SECTION 3 — Mixed unit usage (problem areas)

### 1. Special locations: 1 cell = 100 cm vs 10 cm

- **Layout grid:** 1 cell = 10 cm (`GRID_UNIT_CM`).
- **Special locations (Add Start Point / Packing / Dock):** Frontend sends to API `x_cm = cell.x * SPECIAL_LOCATION_CELL_CM` with `SPECIAL_LOCATION_CELL_CM = 100` (`DesignerRackPlacement.ts`, `WarehouseDesigner.tsx`). So the **same grid cell** (e.g. 5, 5) is sent as (500 cm, 500 cm) for special locations but would be (50 cm, 50 cm) if interpreted as layout grid.
- **Backend** stores Location.x, Location.y in **cm** and returns them in cm. So a click at cell (10, 10) sends 1000, 1000 cm; a click at (1, 1) sends 100, 100 cm. So the designer is using a **10× coarser grid** for special locations (one “cell” = 1 m) while the rest of the layout uses 10 cm cells.
- **Rendering:** `WarehouseCanvas.tsx` uses `SPECIAL_CELL_CM = 100` and `(specialLocations.pick_start.x / SPECIAL_CELL_CM) * cellPx`. So backend returns cm; dividing by 100 gives “decimeters” or a scale that matches the 100 cm per “unit” the frontend sent. So rendering is consistent with the 100 cm convention but **inconsistent with the rest of the layout** (10 cm/cell).
- **Risk:** Confusion and bugs if someone assumes special-location coordinates use the same 10 cm/cell grid as racks. Simulation expects cm; it gets cm, but the **resolution** of start/packing is 1 m, not 10 cm.

### 2. cursorCm in cm, layout in cells

- `cursorCm` is set as `cell.x * GRID_UNIT_CM`, `cell.y * GRID_UNIT_CM` (true cm from grid cell). So cursor display is in cm; internal layout is in cells. No bug, but two representations (cells vs cm) for the same point.

### 3. Legacy grid_cols / grid_rows (meters vs cells)

- On **load:** If backend returns `grid_cols <= 24` (or `grid_rows <= 16`), frontend treats the value as **meters** and multiplies by `CELLS_PER_METER` (10) to get cells. So 24 → 240 cells.
- If backend returns e.g. 240, frontend keeps 240 (cells).
- So the **same field** is interpreted as meters in one case and cells in another. Backend currently appears to persist grid_cols/grid_rows as cell counts (e.g. 240, 160); the “≤24” check is for older data.
- **Risk:** Any backend or client that sends small integers (e.g. 24) without the frontend’s legacy logic will be misinterpreted if that logic is removed or changed.

### 4. width_m / length_m in payload

- Frontend sends `width_m: layout.grid_cols / CELLS_PER_METER`, `length_m: layout.grid_rows / CELLS_PER_METER` (cells → meters). Backend stores `width_m`, `length_m` on WarehouseLayout; it also has `building_width_m`, `building_depth_m`. So both “grid in meters” and “building in meters” exist; grid is primarily defined by `grid_cols`/`grid_rows` (cells).

### 5. Visual elements: width/height in cells vs width_cm/depth_cm/height_cm

- Visuals have both grid-style `width`, `height` (used for layout and hit-test) and optional `width_cm`, `depth_cm`, `height_cm`. Display in `WarehouseMainView` uses `ve.width_cm ?? ve.width * GRID_UNIT_CM`. So visuals can be in cells with cm derived, or in explicit cm.

### 6. No single “cells → pixels” helper

- Every layer does `coord * cellPx` (and often `+ 1` or `- 2` for stroke). `cellPx` is passed as a prop (from `BASE_PX_PER_CELL` = 5 in the main designer). So conversion is consistent but **duplicated** in RackLayer, RowLayer, VisualLayer, PathLayer, SelectionOverlay, DimensionOverlay, and inline in WarehouseCanvas for aisles, ghosts, special locations.

---

## SECTION 4 — Canvas rendering coordinate flow

### Pipeline

1. **Layout data (canonical):**  
   `layout.racks`, `layout.aisles`, `layout.row_containers`, `layout.visual_elements`, `layout.picking_path`, `specialLocations` (from API).  
   Racks/aisles/slots/visuals: **x, y, width, height in grid cells.**  
   Special locations: **x, y in cm** (from API).  
   Picking path: **x, y in cells.**

2. **Canvas size:**  
   `width = layout.grid_cols * cellPx`, `height = layout.grid_rows * cellPx` (e.g. 240×5 = 1200 px, 160×5 = 800 px). So **viewBox** is effectively `0 0 (grid_cols * cellPx) (grid_rows * cellPx)`; 1 cell = `cellPx` pixels.

3. **Transform:**  
   `transform: translate(pan.x, pan.y) scale(zoom)` (pan in **pixels**, zoom dimensionless). Applied to the div wrapping the SVG. So **cells → pixels** is `cell * cellPx`; then pan and zoom are applied in pixel space.

4. **Layers (cells → pixels):**  
   - **RackLayer:** `rectX = drawAt.x * cellPx + 1`, `rectY = drawAt.y * cellPx + 1`, `rectW = r.width * cellPx - 2`, etc.  
   - **RowLayer:** `slot.x * cellPx + 1`, `slot.w * cellPx - 2`, etc.  
   - **VisualLayer:** `ve.x * cellPx + 1`, `ve.width * cellPx - 2`, etc.  
   - **PathLayer:** `pickingPathPoints.map(p => p.x * cellPx + cellPx/2, p.y * cellPx + cellPx/2)`.  
   - **Aisles (inline in WarehouseCanvas):** `a.x * cellPx + 1`, `a.width * cellPx - 2`.  
   - **Special locations:** `(specialLocations.pick_start.x / SPECIAL_CELL_CM) * cellPx + cellPx/2` — **cm** from API divided by 100, then scaled by cellPx (so 100 cm → 1 “unit” → cellPx pixels; i.e. 1 m → cellPx px, not 10 cm → cellPx px).  
   - **Ghosts:** `ghostPosition.x * cellPx + 2`, etc.

5. **getCellFromEvent:**  
   Client pixel position relative to SVG rect → proportional: `(clientX - left) / width * gridCols`, then round. So **pixels → cell index**. This assumes the SVG (or the scrollable area) exactly represents the grid; with pan/zoom the rect is the transformed SVG’s bounding rect, so the mapping is correct for the current view.

### Summary

- **Rendering:** Layout (cells) → multiply by `cellPx` → pixel positions; then pan (px) and zoom (scale) applied.  
- **Interaction:** Client coords → `getCellFromClientPosition` → cell index (integer).  
- **Special locations** are the only data rendered from **cm**; they use a different scale (100 cm per “unit”) so they do not follow the 10 cm/cell grid.

---

## SECTION 5 — Layout generator coordinate logic

### File: `frontend/src/components/warehouse/layoutGenerator.ts`

- **Input:** Template dimensions in **cm** (`width_cm`, `depth_cm`); spacing/aisle in **cm** (`rackSpacingCm`, `aisleWidthCm`); `startX`, `startY` in **cells**; `maxCols`, `maxRows` in **cells** (from `metersToCells(building_width_m)` etc.).
- **Conversion:**  
  `rackW = cmToCells(template.width_cm)`, `rackH = cmToCells(template.depth_cm)`,  
  `spacingCells = cmToCells(rackSpacingCm)`, `aisleCells = cmToCells(aisleWidthCm)`.
- **Placement:** All positions and steps are in **cells**:  
  `x = startX + (colOffset + c) * stepW`, `y = startY + g * stepH`,  
  `stepW = rackW + spacingCells`, `stepH = rackH + aisleCells`.  
  So the generator is **fully cell-based** after converting cm inputs to cells.
- **Rounding/snapping:**  
  `cmToCells` uses `Math.round(cm / GRID_UNIT_CM)`; no extra snapping.  
  Truncation: if `x + rackW > maxCols` or `y + rackH > maxRows`, the rack is skipped (no rounding of position).
- **Output:** `RackState` with `x`, `y`, `width`, `height` in **cells**; `RowContainer` slots with `x`, `y`, `w`, `h` in **cells**.

**Conclusion:** Layout generator uses **cells** consistently; cm are converted at the entrance via `cmToCells` and optional building bounds via `metersToCells`. No meters or pixels inside the algorithm.

---

## SECTION 6 — Backend coordinate assumptions

### Rack / Aisle (warehouse_layout, warehouse_layout_service)

- **Stored:** Rack `x`, `y`, `width`, `height` as **integers in 10 cm units** (cells). Aisle same (from frontend, in cells).
- **API:** GET/PUT layout send/receive rack and aisle positions as in frontend; no conversion in the API layer. Service persists them as-is.
- **Bin/Location coordinates:** When saving layout, service computes **cm** from rack cells: `base_x = rack.x * GRID_UNIT_CM`, then per-bin offsets in cm; writes `StorageLocation.x_cm`, `y_cm`, `z_cm` and `Location` (for bins) with `x`, `y`, `z` in **cm**.

### Location (special locations and bins)

- **Location model:** `x`, `y`, `z` are **Float, centimeters** (docstring and usage).
- **Special location API:** `POST /warehouse/special-location` accepts `x`, `y` in the body (frontend sends cm from `cell * 100`). So backend expects **cm** for special locations.
- **get_special_locations_xy:** Returns `(x, y)` in **cm** (from Location.x, Location.y).

### Warehouse graph (warehouse_graph_service, graph_location_service)

- **Nodes:** Stored with coordinates in **cm** (from Location coordinates; graph generation uses locations in cm).
- **Edges:** `distance_m` in **meters**; computed from node positions (cm) × 0.01.
- **Locations:** Assumed to have `x`, `y` in **cm** when assigning to nodes and for distance.

### Simulation / slotting / analytics

- **get_special_locations_xy:** Returns start/packing in **cm**.  
- **distance_point_to_point_cm**, **distance_euclidean_m:** Inputs in **cm**; output in cm or m.  
- **Route engine:** Distances in **meters**.

### Serialization

- No conversion in API request/response for **layout** rack/aisle: they are stored and returned as integers (cells).  
- **Special locations:** Request body and response are in **cm**.  
- **StorageLocation / Location** in DB are in **cm**; any API that returns them exposes cm.

**Conclusion:** Backend assumes **cells (10 cm)** for rack/aisle layout; **cm** for Location, StorageLocation, and graph; **meters** for distances and route lengths. Conversion from cells to cm happens in `warehouse_layout_service` when syncing bins to StorageLocation and Location.

---

## SECTION 7 — Risks and inconsistencies

1. **Special location grid 100 cm vs 10 cm**  
   Same canvas grid is used with 1 cell = 100 cm for start/packing/dock but 1 cell = 10 cm for racks. So special locations have 10× coarser resolution and are inconsistent with the rest of the grid. Easy to misuse if someone assumes one scale.

2. **Duplicate conversion logic**  
   Cells → pixels repeated in many components (`* cellPx`); no shared `cellsToPixels(cell, cellPx)`. Small risk of one place using a different offset (e.g. +1 vs +2).

3. **Rounding differences**  
   `cmToCells`: `Math.round`. `metersToCells`: `Math.floor`. So 0.99 m → 9 cells, 1.0 m → 10 cells; 99 cm → 10 cells, 100 cm → 10 cells. Asymmetric at boundaries.

4. **Legacy grid_cols/grid_rows**  
   Interpretation “≤24 means meters, else cells” is implicit and easy to break if backend or another client sends cell counts &lt; 24.

5. **cursorCm vs cell**  
   Two representations (cm and cell) for the same cursor; both correct but must be kept in sync (cursorCm = cell * GRID_UNIT_CM).

6. **Layout generator vs renderer**  
   Generator outputs cells; renderer expects cells. No unit mismatch. Only special locations use cm on the canvas.

7. **Backend Location vs Rack**  
   Rack: cells. Location: cm. So “coordinates” in the backend are not a single unit; conversion is done in the layout service when creating/updating Location/StorageLocation from layout.

8. **Snap and tolerance in cells**  
   `DesignerRackPlacement` uses `GRID_UNIT_CM` and cell math; `SNAP_DISTANCE_THRESHOLD_CM = 15` is in cm but compared to distances computed from cell deltas × GRID_UNIT_CM. So snap logic is consistent (cm).

---

## SECTION 8 — Recommended coordinate architecture

### Canonical unit: grid cell

- **Layout storage and API (racks, aisles, row slots, visuals):**  
  Store and transmit **x, y, width, height in grid cells**.  
  **1 cell = 10 cm** everywhere (single constant `GRID_UNIT_CM = 10`).

### Frontend

- **Layout state:** Only cells. No pixels or meters in layout state.
- **Rendering:** Single conversion at render time: **cells → pixels** via a shared helper, e.g. `cellsToPx(cells: number, cellPx: number) => cells * cellPx`, and a single place that defines “rect from cell rect” (e.g. `cellRectToPx({ x, y, w, h }, cellPx, stroke?)`). All layers use it.
- **Interaction:** **Pixels → cells** only in `getCellFromEvent` (already correct). Cursor display in cm can stay as `cell * GRID_UNIT_CM` or be documented as “display only.”
- **Special locations:** Align with layout grid: send and store in **cells** (same as racks), and convert to cm only at the API boundary (frontend: cells → cm when calling POST; backend: store in cm or in a dedicated “grid cell” and document it). Prefer backend accepting cells and converting to cm internally so the frontend uses one grid (10 cm) everywhere. If keeping API in cm, frontend should send `cell.x * GRID_UNIT_CM` (10), not 100, so resolution matches the rest of the layout.
- **Legacy grid_cols/rows:** Document the “≤24 = meters” rule or migrate to always sending cells and drop the scale.

### Backend

- **Rack / Aisle:** Keep storing **cells** (10 cm units). No change.
- **Location / StorageLocation:** Keep storing **cm** for analytics and graph. Conversion from layout cells to cm stays in `warehouse_layout_service` when syncing from layout. Document clearly: “Layout coordinates are in cells; Location/StorageLocation are in cm.”
- **Special location API:** Either accept **cells** and convert to cm server-side (recommended), or keep accepting cm and document that frontend must send cm (and fix frontend to use GRID_UNIT_CM for consistency).

### Conversions (single place)

- **Frontend:**  
  - `warehouseUtils.ts`: keep `cmToCells`, `metersToCells`, `snapCm`, `pathDistanceMeters`.  
  - Add optional: `cellsToCm(cells)`, `cellsToMeters(cells)` for display/API.  
  - Rendering: one `cellsToPx` (or rect helper) used by all canvas layers.
- **Backend:**  
  - Keep `rack.x * GRID_UNIT_CM` in one module (layout service).  
  - All distance/length APIs use cm or m consistently (already the case).

### Summary table

| Domain        | Canonical unit | Storage / API     | Convert to pixels (frontend) | Convert to cm (backend)      |
|---------------|----------------|-------------------|------------------------------|------------------------------|
| Layout (racks, aisles, slots, visuals) | Grid cell       | cells             | `cell * cellPx`              | `cell * GRID_UNIT_CM`        |
| Special locations (recommended) | Grid cell       | Prefer cells in API, then backend → cm | Same as layout               | On save: `cell * GRID_UNIT_CM` |
| Location / StorageLocation (backend) | cm              | cm                | N/A                          | N/A                          |
| Distances / routes              | meters          | meters            | N/A                          | From cm: × 0.01              |

This keeps **one grid** (10 cm/cell) for the whole designer and moves any “grid vs cm” boundary to a few, documented places (layout save, special-location API, and backend sync to Location/StorageLocation).
