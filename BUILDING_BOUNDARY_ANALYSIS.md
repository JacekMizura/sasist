# Building dimensions (warehouse boundary) – Analysis

**Goal:** Introduce a **building boundary** that defines the maximum layout area so the designer works inside physical limits, placement is blocked outside, and the feature supports presentations and future use (distance simulation, heatmaps, utilization). No implementation; analysis only.

---

## 1. Current layout size logic

### 1.1 LayoutState and grid

- **Frontend** (`types/warehouse.ts`): `LayoutState` has `grid_cols`, `grid_rows` (numbers). No `building_*` or `max_*` fields.
- **Initial state** (`WarehouseDesigner.tsx`): `grid_cols: GRID_COLS` (240), `grid_rows: GRID_ROWS` (160) from `DesignerRackPlacement.ts`. So default = 240×160 cells = 24 m × 16 m at 10 cm/cell.
- **Load from backend** (`WarehouseDesigner.tsx` ~386–392): If API returns `grid_cols <= 24` and `grid_rows <= 16`, they are treated as “legacy” **meters** and multiplied by `CELLS_PER_METER` (10). Otherwise they are used as cell counts. So layout size is **defined only by grid dimensions**; there is no separate “building” or “max area” concept.

### 1.2 Is layout size defined only by grid dimensions?

**Yes.** The only size is `grid_cols` × `grid_rows`. Backend also stores `width_m` and `length_m` (derived on save: `width_m = layout.grid_cols / CELLS_PER_METER`). So effectively:

- **Single source of truth:** grid_cols, grid_rows (in cells).
- **Meters** are derived for display/API (width_m, length_m).

There are **no** building_width_m / building_height_m or max_grid_* fields.

### 1.3 Does the grid grow dynamically when racks are placed?

**No.** The grid is fixed. All placement logic **clamps** coordinates to the current grid:

- `stampRackAt`, `stampRackFromCatalogItem`: `x = Math.max(0, Math.min(layout.grid_cols - w, ...))`, same for y and grid_rows.
- `snapPosition`: candidates limited to `[0, gridCols - ghostW]`, `[0, gridRows - ghostH]`.
- `canPlaceGroup`, `canMoveRowTo`: reject if `rect.x + rect.width > gridCols` or `rect.y + rect.height > gridRows`.

So the grid **does not** grow when you place a rack at the edge; you hit the current limit. Changing “layout size” today means changing grid_cols/grid_rows (e.g. in a future “resize grid” action or when loading another layout).

### 1.4 Are there any boundary restrictions today?

**Yes, but only the grid rectangle.** The effective boundary is:

- **x:** [0, grid_cols) (rack right edge ≤ grid_cols).
- **y:** [0, grid_rows) (rack bottom edge ≤ grid_rows).

There are no extra “building” or “no-go” zones; no distinction between “inside building” and “outside building.” The grid **is** the boundary.

---

## 2. Storing building dimensions

### Option A — Building dimensions in meters

- **Fields:** `building_width_m`, `building_height_m` (optional).
- **Semantics:** Physical size of the warehouse building. Max layout area in cells = `building_width_m * 10`, `building_height_m * 10` (with 10 cm/cell).
- **Constraint:** `grid_cols <= building_width_m * 10`, `grid_rows <= building_height_m * 10`. So the current design grid cannot exceed the building.
- **Pros:** User-facing (m), good for presentations and future stats (e.g. utilization = occupied_m² / building_m²). Clear meaning.
- **Cons:** Depends on fixed cell size (10 cm) unless we also store or assume it.

### Option B — Grid dimensions as max

- **Fields:** `max_grid_cols`, `max_grid_rows` (or reuse `grid_cols`/`grid_rows` as the only extent).
- **Semantics:** “Building” = current grid; no separate building concept. Or “max” grid that layout cannot exceed.
- **Pros:** No conversion; validation is trivial (placement already uses grid_cols/grid_rows).
- **Cons:** No explicit “building in meters” for clients or utilization in m² without converting.

### Recommendation

**Option A (building in meters) with grid as design area.**

- Add optional **`building_width_m`**, **`building_height_m`** to layout (frontend + backend).
- When set:
  - **Max cells:** `maxCols = building_width_m * CELLS_PER_METER`, `maxRows = building_height_m * CELLS_PER_METER` (same 10 cm/cell).
  - **Rule:** `grid_cols <= maxCols`, `grid_rows <= maxRows`. So the design grid is always inside the building.
- When **not** set: keep current behaviour (grid_cols/grid_rows are the only boundary; no building).
- **Cell size:** Keep 10 cm/cell for now. If you later make cell size configurable, building_m can still drive max cells via `building_width_m * 100 / grid_unit_cm`.

This gives:

- A clear “building” for UX and future features (heatmaps, utilization %).
- One validation rule: placement and grid size stay within building-derived max.
- Backward compatibility: existing layouts without building_* behave as today.

---

## 3. Where boundary validation should happen

### 3.1 Current validation points

- **useDesignerRackPlacement.ts**
  - `stampRackAt`: clamps `x`, `y` to `[0, layout.grid_cols - w]`, `[0, layout.grid_rows - h]`.
  - `stampRackFromCatalogItem`: same clamp after snap or free drop; `getCatalogDropCell` uses `snapPosition(..., layout.grid_cols, layout.grid_rows, ...)`.
- **DesignerRackPlacement.ts**
  - `snapPosition`: all candidates and final position inside `[0, gridCols - ghostW]`, `[0, gridRows - ghostH]`.
  - `canPlaceGroup`: returns false if any rect has `rect.x + rect.width > gridCols` or `rect.y + rect.height > gridRows`.
- **useDesignerRowOperations.ts**
  - `canMoveRowTo`: checks every slot and rack rect against `gridCols`, `gridRows` (must be ≥ 0 and not exceed grid).
  - `placeEmptyRow`, `placeRowWithTemplate`: clamp start and count so slots stay within grid.

So **all placement and move validation already use `layout.grid_cols` and `layout.grid_rows`**. Nothing uses a separate “building” yet.

### 3.2 Where to enforce building boundary

- **Option 1 — Building caps grid:** When building is set, ensure `grid_cols <= maxCols` and `grid_rows <= maxRows` whenever layout or grid is set (e.g. on load, on “set building size,” on “resize grid”). Then **no change** to placement code: existing checks against `grid_cols`/`grid_rows` automatically enforce the building (because grid is never larger than building).
- **Option 2 — Validate against building in every placement path:** Pass `maxCols`/`maxRows` (from building or fallback to grid) and clamp/validate to `min(grid_cols, maxCols)` and `min(grid_rows, maxRows)`. Redundant if grid is already capped by building; only needed if you allow “grid larger than building” temporarily.

**Recommendation:** **Cap grid by building** (Option 1). When building dimensions are set or loaded:

- Compute `maxCols`, `maxRows` from building (m → cells).
- If current `layout.grid_cols > maxCols` or `layout.grid_rows > maxRows`, either (a) set grid to max and optionally warn, or (b) refuse to set building smaller than current grid and warn. So at all times `grid_cols <= maxCols`, `grid_rows <= maxRows`. Then:

**Validation locations (no logic change, just ensure grid is the authority):**

- **Placement:** Keep using `layout.grid_cols` and `layout.grid_rows` in:
  - `useDesignerRackPlacement` (stampRackAt, stampRackFromCatalogItem, getCatalogDropCell).
  - `snapPosition` (already receives gridCols, gridRows).
- **Move / row ops:** Keep using `layout.grid_cols` / `layout.grid_rows` in:
  - `canPlaceGroup`, `canMoveRowTo`, `placeEmptyRow`, `placeRowWithTemplate`, etc.
- **New:** When **setting** building (or loading layout with building), apply the cap so `grid_cols`/`grid_rows` never exceed building-derived max. Optionally, when user **resizes grid** (if you add that), clamp to building max. No need to add “building” to every clamp call if grid is always within building.

**Blocking placement outside the building** is then equivalent to **blocking placement outside the grid**, which is already implemented. The only new rule is: grid size cannot exceed building size.

---

## 4. Where boundary visualization should be rendered

### 4.1 Where the grid is drawn

- **WarehouseCanvas.tsx** (used by DesignerGrid → WarehouseMainView):
  - **Size:** `width = layout.grid_cols * cellPx`, `height = layout.grid_rows * cellPx` (passed in as props; computed in `WarehouseDesigner.tsx`: `width = layout.grid_cols * cellPx`, `height = layout.grid_rows * cellPx`).
  - **Grid:** Two/three `div`s with `position: absolute`, `width`, `height`, and CSS `backgroundImage` (linear-gradient for lines). Same size as the SVG. No separate “building” rect.
  - **SVG:** `viewBox={`0 0 ${width} ${height}`}`; all rack/row/aisle/visual layers use the same coordinate system (cells × cellPx for pixel size).

So the **grid background** is the same rectangle as the current layout extent (0,0) to (grid_cols×cellPx, grid_rows×cellPx). There is no separate “building outline” yet.

### 4.2 Adding a building boundary rectangle

- **Option A — Same as grid:** If building always equals grid (grid capped by building), the current canvas rectangle **is** the building. You can add a **stroke** around the SVG or the grid div (e.g. “building outline” 2px border) so it reads as “warehouse boundary” in presentations.
- **Option B — Building can be larger than grid:** If you allow “design area” smaller than building (e.g. building 80×40 m, grid 60×30), then draw:
  - **Building:** A rect from (0,0) to (building_cols*cellPx, building_rows*cellPx). Fill light (e.g. #f8fafc) or transparent, stroke (e.g. #64748b) to show boundary.
  - **Grid / design area:** Current content (racks, rows) inside grid_cols×grid_rows. So you’d render a “building” layer first, then the existing grid/content. Canvas size would need to be at least building size (or you keep canvas = grid and only show building when zoomed out; more complex).

**Recommendation for first version:** **Building = grid.** So:

- **Rendering:** In **WarehouseCanvas**, after the grid lines and before or after the SVG content, draw a single **building outline** (e.g. `<rect>` with no fill, stroke, or a very light fill). Same size as current canvas: `width` × `height` (which is grid_cols*cellPx × grid_rows*cellPx). So it’s just a visual “frame” so the rectangle reads as “warehouse building” in presentations. No extra coordinate math.
- **Component:** Same place the grid background is (WarehouseCanvas), e.g. one `<rect>` at (0,0) with width/height = full canvas, stroke = building colour, or a thin border on the wrapper div. No new component required.

**Out-of-bounds placement** is already detected by the same checks that keep racks inside the grid (see above). If you later support “building > grid,” out-of-bounds would be “outside grid” (and optionally “outside building” if you draw building larger and reject drops outside it).

---

## 5. Generator and building limits

### 5.1 How the generator positions racks

- **layoutGenerator.ts** — `generateWarehouseLayout(config)`:
  - Uses `startX`, `startY`, `rows`, `columns`, `rackSpacingCm`, `aisleWidthCm`, orientation.
  - Computes positions in cells: e.g. horizontal: `x = startX + c * stepW`, `y = startY + r * stepH`; stepW = rackW + spacingCells, stepH = rackH + aisleCells.
  - No reference to `grid_cols`, `grid_rows`, or any max. So with large rows/columns or start, racks can end up at arbitrary (x,y) and **can exceed the current layout grid** (and building) if the modal doesn’t check.

### 5.2 GenerateWarehouseLayoutModal

- Calls `generateWarehouseLayout(...)` then checks **overlap with existing racks** when mode is append; **no check** that generated racks stay within `layout.grid_cols` / `layout.grid_rows` (or building).

So the generator **does not** currently respect grid or building bounds.

### 5.3 How the generator should respect building limits

- **Inputs:** Pass **max extent** into the generator (and modal): e.g. `maxCols`, `maxRows`. When building is set, `maxCols = building_width_m * 10`, `maxRows = building_height_m * 10`; when not set, `maxCols = layout.grid_cols`, `maxRows = layout.grid_rows`.
- **In `generateWarehouseLayout`:**
  - **Option 1 — Clamp:** After computing each (x, y), clamp so the rack rect stays inside [0, maxCols] × [0, maxRows]. If a rack would extend past the boundary, either (a) clamp its position (might overlap previous rack) or (b) **stop generating** that row/column and return fewer racks (recommended: don’t clamp into overlap; cap count).
  - **Option 2 — Cap count:** Before generating, compute max rows/columns that fit: e.g. horizontal orientation, `maxColsFit = floor((maxCols - startX) / stepW)`, `maxRowsFit = floor((maxRows - startY) / stepH)`. Use `min(columns, maxColsFit)` and `min(rows, maxRowsFit)` so no rack is placed outside the box. Return only racks that fit; optional warning “Requested 10×3 but only 8×3 fit in building.”
- **In the modal:**
  - Before calling the generator, compute `maxCols`/`maxRows` from layout (and building if present).
  - Either (a) call generator with `maxCols`/`maxRows` and let it cap rows/columns and return a result, then show “Generated N racks (requested M)” if some were dropped, or (b) **prevent confirm** if the requested rows×columns would exceed the building and show: “Requested layout would exceed building (80×40 m). Reduce rows/columns or start position.”
  - Optional: **Preview** in the modal (e.g. “Fits in building: yes/no” or a small schematic) using the same max.

**Recommendation:**

- Add optional **`maxCols`**, **`maxRows`** to `LayoutGeneratorConfig` (or pass layout + building and derive inside the modal).
- In **generateWarehouseLayout**: when `maxCols`/`maxRows` are provided, **cap** the number of columns/rows so that no rack has `x + width > maxCols` or `y + height > maxRows`. Return the (possibly reduced) list and optionally a flag `truncated: true` if some were dropped.
- In **GenerateWarehouseLayoutModal**: pass `maxCols`/`maxRows` from layout (and building); after generate, if result was truncated, show a short warning (“Layout truncated to fit building”). Optionally disable “Generate” or show a warning when the requested shape would exceed the building.

This keeps the generator reusable and makes it respect building (or grid) without changing its core loop; only the extent and possibly the returned count change.

---

## 6. UX: where and how to configure building size

### 6.1 Possible locations

- **When creating warehouse** — Building size as part of warehouse creation (e.g. “Building: 80 m × 40 m”). Good for new warehouses; existing ones would need another place to set it.
- **Warehouse settings panel** — Dedicated “Building” or “Warehouse dimensions” section. Fits “building is a property of the warehouse/layout.”
- **Designer toolbar** — e.g. “Building: 80×40 m” with an edit icon opening a small modal or inline fields. Always visible in the designer; easy to find.

**Recommendation:** **Designer toolbar or sidebar** (and optionally warehouse settings for persistence). In the designer, a compact control (e.g. “Budynek: 80×40 m” with edit) so the user sees the boundary while designing. If you have a warehouse settings screen, mirror the same fields there and persist with the layout (or warehouse).

### 6.2 Fields

- **Building width (m)** — number, e.g. 80.
- **Building height/depth (m)** — number, e.g. 40. (Call it “depth” or “length” if that matches your convention; backend uses `length_m` for layout.)
- **Grid cell size** — currently fixed 10 cm. Optional later: allow 5 cm / 10 cm / 20 cm and derive max cells from building; for now omit or show as read-only “10 cm”.

Validation: building width/height > 0; when set, ensure `grid_cols <= building_width_m * 10` and `grid_rows <= building_height_m * 10` (or adjust if grid is resizable).

---

## 7. Future features (compatibility)

- **Heatmaps / picking simulation / walking distance:** All use the same cell coordinates and layout extent. If “layout” is always inside the building, heatmaps and routes stay inside the same rectangle. Building area in m² = `building_width_m * building_height_m` for normalization or masking.
- **Layout utilization:**  
  - **Warehouse area:** `building_width_m * building_height_m` (m²).  
  - **Occupied:** Sum of rack footprints (e.g. `rack.width * rack.height` in cells → m² using 0.1 m per cell).  
  - **Utilization:** `occupied_m² / building_m² * 100%`.  
  So storing building in meters fits utilization and reports (e.g. “56% utilization”).
- **Distance simulation:** Distances in meters = cell distance × 0.1; building bounds can be used to clip or validate paths.

No change to current coordinate system is required; building is an optional cap and a semantic “boundary” for UX and stats.

---

## 8. Summary

| Topic | Conclusion |
|-------|------------|
| **Current layout size** | Defined only by `grid_cols` and `grid_rows`. No building or max area. |
| **Grid growth** | Grid is fixed; placement is clamped to grid; no dynamic growth. |
| **Current boundary** | Only the grid rectangle [0, grid_cols) × [0, grid_rows). |
| **Storing building** | Prefer **Option A:** optional `building_width_m`, `building_height_m`. Derive max cells; require `grid_cols`/`grid_rows` ≤ building. When not set, behaviour unchanged. |
| **Boundary validation** | **Cap grid by building** when building is set or loaded. Keep all existing placement/move checks against `grid_cols`/`grid_rows`; no need to pass building into every clamp. |
| **Boundary visualization** | **WarehouseCanvas:** add a building outline (e.g. rect stroke or border) around the current canvas (0,0)–(width, height). Same size as grid in first version (building = grid). |
| **Generator** | Pass **maxCols**/ **maxRows** (from building or grid) into generator; in **generateWarehouseLayout** cap rows/columns so no rack exceeds the box; in **GenerateWarehouseLayoutModal** pass max, show truncation warning if needed. |
| **UX** | Building width/height (m) in designer toolbar or sidebar (and optionally warehouse settings); optional grid cell size later. |

This keeps the current designer and grid logic intact, adds a clear building concept for limits and future use, and ensures the generator respects the same bounds.
