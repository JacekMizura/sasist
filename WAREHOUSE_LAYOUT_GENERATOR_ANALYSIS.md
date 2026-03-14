# Warehouse Layout Generator – Analysis & Design

**Goal:** Design a system that generates an entire warehouse layout (multiple rack rows and aisles) from a single rack template, with configurable rows, columns, rack spacing, and aisle width, while preserving templates, naming, coordinates, and designer compatibility.

**Scope:** Analysis only. No implementation.

---

## 1. Current rack placement architecture

### 1.1 Where layout and racks live

- **Frontend:** `WarehouseDesigner.tsx` (main page) holds `layout: LayoutState` in React state and passes `setLayout` down. Layout is **not** from `WarehouseDesignerContext` (that context is a different, simpler flow). The designer used for this analysis is the full one with grid, catalog, and row tools.
- **LayoutState** (`types/warehouse.ts`): `layout_id`, `warehouse_id`, `warehouse_name`, `name`, `grid_cols`, `grid_rows`, `racks: RackState[]`, `aisles`, `visual_elements`, `picking_path`, `row_containers?: RowContainer[]`.
- **RackState:** `x`, `y`, `width`, `height` (cell units), `orientation`, `levels`, `bins_per_level`, `levelConfig`, dimensions in cm, `aisle_letter`, `rack_index`, `bins: BinState[]`, `color`, `name`, `rowPrefix`, `indexInRow`, optional `addressPattern`, `sectionStartIndex`, `binNamingType`, `templateId`, `rotationDegrees`.
- **Coordinates:** All rack positions are in **grid cell coordinates** (integer `x`, `y`, `width`, `height`). 1 cell = `GRID_UNIT_CM` (10 cm). So 2.8 m = 28 cells, 3.2 m = 32 cells.

### 1.2 How racks are created when the user drags a template to the grid

Two main paths:

**A) Drop on an empty row slot (row_containers)**  
- `useDesignerRackPlacement`: `getCatalogDropCell` → `findEmptySlotAt(layout.row_containers, cell)`; if found, `stampRackIntoSlot(rowId, slotIndex, item)`.
- `stampRackIntoSlot`: Gets row from `row_containers`, computes slot fit (horizontal: slot width vs rack width in cells; vertical: slot height vs rack width). Prefix = `row.rowPrefix ?? currentRowPrefix`, `indexInRow` = 1 + count of slots in that row that already have `rackId`. Builds bins with `createBinsForRack(..., rackLabel, ...)` where `rackLabel = \`${prefix}${indexInRow}\``. Creates one `RackState`, inserts into row slots (splits remainder slot), then `setLayout` with `reindexGeometricRow(nextRacks, newRack.rack_index)` so all racks in the same geometric row get sequential `indexInRow` and updated `name`/bins.

**B) Drop on free grid (no row slot)**  
- `stampRackFromCatalogItem(cell, item)`: If no empty slot, uses `findSnapToRowPosition(layout.racks, cell.x, cell.y, w, h)` to snap to an existing row; else `snapPosition(cell, w, h, layout.racks, layout.grid_cols, layout.grid_rows, aisleWidthCm)`. Prefix = snap row’s prefix or `currentRowPrefix`; `indexInRow` = snap’s or `getNextIndexInRow(layout.racks, prefix)`. Then builds one `RackState` with `createBinsForRack(..., rackLabel, ...)`, appends to `layout.racks`, and runs `reindexGeometricRow`.

**C) Draw row with template**  
- `useDesignerRowOperations.placeRowWithTemplate(start, end, item)`: Creates one `RowContainer` and fills it with racks in one go. Orientation from draw direction (horizontal vs vertical). `rowPrefix = currentRowPrefix`, `indexInRow` = 1, 2, 3… along the row. Each rack is created with the same pattern as above (template spec → `createBinsForRack` with `rackLabel = \`${rowPrefix}${indexInRow}\``).

So in all cases:

- **Rack label (name)** = `rowPrefix + indexInRow` (e.g. A1, A2, B1).
- **Bins** = `createBinsForRack(..., addressPattern, rowId = rackLabel, sectionStartIndex, binNamingType, levelConfig, namingStrategy, ...)` so bin labels use the template’s pattern with `{Row}` = rack name.

### 1.3 How rack coordinates are stored

- **In memory:** `RackState.x`, `RackState.y` in **grid cells** (0-based). `width`/`height` in cells (from `cmToCells(template.width_cm)` etc.).
- **Save payload** (`WarehouseDesigner.tsx` → `api.put('/warehouse/${whId}/layout', payload)`): `racks[].x`, `y`, `width`, `height`, `name`, `row_prefix`, `index_in_row`, `bins`, etc.
- **Backend** (`warehouse_layout_service.save_layout`): Persists to DB (WarehouseLayout, Rack, Bin, StorageLocation, Location). Rack positions are stored as given; backend uses `GRID_UNIT_CM` (10 cm) for bin coordinates: `base_x = rack.x * GRID_UNIT_CM`, etc.

So **aisle spacing is implicit**: there is no separate “aisle width” field on the layout. Gaps between racks are just empty grid space (difference between rack bounds). When dragging, **aisle width is used only for snap candidates** in `snapPosition`: candidate positions include `r.x + r.width + aisleCells` and `r.x - ghostW - aisleCells` (and same for y). So `aisleWidthCm` (default 250 cm) only affects **where** a new rack snaps, not how existing geometry is stored.

### 1.4 How rack IDs (A1, A2, …) and row letters are generated

- **Row letter / prefix:**  
  - **currentRowPrefix** (state in `useDesignerRowState`, default `"A"`): Used when placing a rack with no row (free drop or snap).  
  - **RowContainer.rowPrefix**: Set when creating a row (`placeEmptyRow` or `placeRowWithTemplate`) from `currentRowPrefix`. When placing into a row slot, prefix = `row.rowPrefix ?? currentRowPrefix`.  
  - So row letters are **not** auto-generated per “row index” in a grid; they come from (1) the row container’s prefix when placing in a row, or (2) `currentRowPrefix` when placing freely. The user can change `currentRowPrefix` in the sidebar (e.g. to “B”) before drawing the next row.

- **Rack label:** Always `\`${prefix}${indexInRow}\``, e.g. A1, A2, B1. `indexInRow` is 1-based and sequential per (geometric) row, enforced by `reindexGeometricRow` / `getNextIndexInRow`.

- **Numeric rows:** There is no built-in “R1-A1” style. Template can use `addressPattern` / `rowId` so that **bin** labels look like `R1-A1-1-1` if the user sets `rowId` to `"R1"` and pattern to `"{Row}-{Bin}-{Level}"`; but the **rack** `name` is still `prefix + indexInRow` (e.g. A1). So “row” in the sense of “layout row” is the letter (prefix); “R1” would be a custom rowId in the template for bin addressing.

### 1.5 How aisle spacing is represented

- **Not stored as a layout field.** Layout only has `grid_cols`, `grid_rows`, and each rack’s `x,y,width,height`. Aisle width is:
  - **Design-time:** `aisleWidthCm` (e.g. 250 cm) used in `snapPosition` to offer snap positions at ±`aisleCells` from existing racks.
  - **Row gap:** `rowGapCm` used when **placing a row** of racks: `stepW = pw + gapCells`, `stepH = ph + gapCells`, so spacing between racks in a drawn row = rack size + rowGapCm.
- So to “represent” aisle spacing in layout coordinates you simply **place racks so that the gap between two rows of racks is the desired aisle width in cells** (e.g. 3.2 m → 32 cells). The generator would do that by positioning each row at `y = prevRowY + prevRowHeight + aisleCells`.

### 1.6 Summary table

| Aspect | Current behaviour |
|--------|-------------------|
| Rack creation | Single rack: `stampRackAt` / `stampRackIntoSlot` / `stampRackFromCatalogItem`. Row of racks: `placeRowWithTemplate` or `placeEmptyRow` + fill. |
| Coordinates | Grid cells; 1 cell = 10 cm. Stored as `x, y, width, height` per rack. |
| Rack name | `rowPrefix + indexInRow` (e.g. A1, B2). |
| Row prefix | From `RowContainer.rowPrefix` (when in a row) or `currentRowPrefix` (free place). User sets prefix before drawing next row. |
| Aisle width | Not stored; used only in snap (magnetic) and in manual placement. Actual aisle = empty cells between rack rects. |
| Rack spacing in a row | From `rowGapCm` when drawing a row: step = rack size (cells) + `cmToCells(rowGapCm)`. |

---

## 2. Required generator capabilities (recap)

- **Rows count** – number of “layout rows” (e.g. 10 rows of racks).
- **Columns count** – racks per row (e.g. 3 → A1 A2 A3, then B1 B2 B3, …).
- **Rack spacing** – gap between racks in the same row (e.g. 2.8 m → 28 cells).
- **Aisle width** – gap between rows (e.g. 3.2 m → 32 cells).
- **Orientation** – horizontal (rows are horizontal lines of racks) or vertical (rows are vertical lines).

Naming must integrate with existing system (row-based A1, A2, … or numeric R1-A1 style if template uses it).

---

## 3. Design questions and answers

### 3.1 Safest way to replicate racks without breaking existing placement logic

**Answer:** Reuse the **same data shape and the same bin-creation path** as existing placement:

- For each generated rack, build **one** `RackState` with the same fields as today: `x`, `y`, `width`, `height`, `orientation`, template-derived dimensions, `levels`, `bins_per_level`, `levelConfig`, `bins` from `createBinsForRack(..., rackLabel, ...)`, `name = rackLabel`, `rowPrefix`, `indexInRow`, and template naming fields (`addressPattern`, `sectionStartIndex`, `binNamingType`, `templateId`, etc.). Then append to `layout.racks`.
- **Do not** introduce a different “generated rack” type or a different coordinate system. The generator is just a **batch** of the same operation: “place N×M racks with this template at these positions.”
- Optionally create **row_containers** for each generated row so that the rest of the designer (drag within row, reindex, fill row) still sees logical rows. That would mirror `placeRowWithTemplate` (one row container per row with slots filled by the generated racks). If the generator is “free-standing” (no row tool), you can still generate only `racks` and not `row_containers`; then the grid is just a list of racks and naming still works.

So the safest approach: **same RackState structure, same createBinsForRack + rackLabel, same cell coordinates; only the source of (x,y) and (rowPrefix, indexInRow) is the generator grid.**

### 3.2 Should the generator create racks by repeatedly calling the same placement logic used for drag-and-drop?

**Answer:** **Yes, in spirit; not necessarily by literally calling `stampRackIntoSlot`.**

- **Reuse:** `createBinsForRack` and the rule `rackLabel = rowPrefix + indexInRow` (and template’s `addressPattern`, `rowId`, etc.) so that bin labels and rack names are identical to manual placement.
- **Do not** call `stampRackIntoSlot` for each rack because that is tied to existing `row_containers` (slot layout, splitting slots). The generator computes its own grid of positions.
- **Recommended:** Extract a small helper that, given (template spec, rackLabel, rowPrefix, indexInRow, x, y, rackIndex, orientation), returns one `RackState` (with bins from `createBinsForRack`). Both the existing placement hooks and the generator then use this helper. So “same placement logic” = same **data production** (RackState + bins), not the same **interaction** (slot/row).

### 3.3 Where should the generator UI live?

Options considered:

- **Inside warehouse designer toolbar** – Good discoverability; toolbar already has mode switches (Select, Draw row, etc.). A “Generate layout” button could open a modal. Keeps layout generation in the same screen as the grid.
- **Inside rack template panel (RackSidebar)** – Fits “from template” idea (choose template, then “Generate grid from this template”). Could be a button near the catalog or in the template card. Slightly less visible than toolbar.
- **Modal after placing first rack** – Contextual but easy to miss and couples generation to “must place one first.”

**Recommendation:** **Toolbar + modal.** Add a “Generate layout” (or “Generuj układ”) action in the **DesignerToolbar** or in the **RackSidebar** (e.g. under catalog, “Generuj siatkę z szablonu”). Click opens a **modal** that:
- Lets user pick the **template** (from current catalog: preset or custom).
- Rows, columns, rack spacing, aisle width, orientation.
- Optional: starting position (cell or “top-left”) and starting row prefix (default A).
- Preview (see below) and Confirm.

So: **primary placement = designer toolbar or sidebar; UI = modal.**

### 3.4 How should aisle spacing be represented in layout coordinates?

**Answer:** **As empty space between rack rectangles.** No new layout field.

- Generator computes for each rack a cell position `(x, y)`.
- For “horizontal” orientation: row `r` has racks at `y = rowY[r]`, with `rowY[0] = startY`, `rowY[r] = rowY[r-1] + rackHeight + aisleCells`. Within a row, `x = startX + i * (rackWidth + spacingCells)`. So aisle width in cm → `aisleCells = cmToCells(aisleWidthCm)`; that many cells of gap between one row’s bottom edge and the next row’s top edge.
- Backend and map already interpret layout as “racks at (x,y) in cells”; they don’t need an explicit “aisle” between rows. Aisle width is just the delta in coordinates.

Optional: If the app later adds “aisle” entities (e.g. for routing), the generator could also create `layout.aisles` rectangles in the gaps; current code doesn’t require it for the grid to work.

### 3.5 How to ensure naming continues correctly across generated rows?

**Answer:** **Assign row prefix per layout row and index-in-row per rack.**

- **Row index → prefix:** For row index `r` (0-based), set `rowPrefix = startPrefix + r`. If `startPrefix` is `"A"`, then row 0 → A, row 1 → B, … (e.g. next letter). So `rowPrefix = String.fromCharCode(65 + r)` when startPrefix is `"A"`, or support numeric prefixes (R1, R2) if desired.
- **Rack label:** For rack at (row `r`, column `c`), `indexInRow = c + 1`, `rackLabel = \`${rowPrefix}${indexInRow}\`` (e.g. A1, A2, A3, then B1, B2, B3). Pass `rackLabel` as `rowId` (and rack name) into `createBinsForRack` so bin labels use the same naming as today.
- **Section / template:** If the template uses `sectionStartIndex` / `nextSectionIndex`, the generator can either keep one section per rack (1, 2, 3…) or one per row; either way, pass the chosen value into `createBinsForRack` so bin addresses stay consistent.
- **Existing racks:** If the user runs the generator on a non-empty layout, either (a) **replace** all racks (clear and generate), or (b) **append** and compute `startPrefix` / starting position so new racks don’t overlap and use the next available row letters. “Append” requires a convention (e.g. next row letter = max existing row prefix + 1 or next letter).

---

## 4. Best insertion point for generator logic

### 4.1 Frontend

- **New module:** e.g. `frontend/src/pages/WarehouseDesigner/layoutGenerator.ts` (or `useLayoutGenerator.ts`) that:
  - Takes: template (as CatalogItem or equivalent spec), rows count, columns count, rack spacing cm, aisle width cm, orientation, optional start cell (x0, y0), optional start row prefix.
  - Returns: `{ racks: RackState[], row_containers?: RowContainer[] }` (and optionally required `grid_cols`/`grid_rows` if the grid must be resized).
- **State:** Generator does **not** hold layout state; it **computes** a list of racks (and optionally row_containers). The parent (WarehouseDesigner) calls the generator and then does `setLayout(prev => ({ ...prev, racks: [...prev.racks, ...generated.racks], row_containers: [...(prev.row_containers ?? []), ...generated.row_containers] }))` for append, or replaces `racks`/`row_containers` for replace.
- **Rack index:** Use `nextRackIndex = layout.racks.length + 1 + i` so each generated rack has a unique `rack_index` (no collision with existing or future manual placement).
- **Shared helper:** Prefer a small `createRackStateFromTemplate(spec, { x, y, rackIndex, rowPrefix, indexInRow, orientation }, options)` used by both `useDesignerRackPlacement` / `useDesignerRowOperations` and the generator so that naming and bins are built in one place.

### 4.2 Backend

- **No change required** for a first version. Save payload already supports many racks; the backend just persists what the frontend sends. If later you want “generate on server” (e.g. for very large layouts), the same formulas (rows, columns, spacing, aisle, naming) can be implemented in Python and return the same payload shape.

---

## 5. How rack replication should work internally

1. **Inputs:** Template (dimensions, levels, bins_per_level, levelConfig, naming fields, color, templateId, reserve_bin_keys, etc.), rows count R, columns count C, rack spacing cm, aisle width cm, orientation (horizontal | vertical), start (x0, y0), start row prefix (e.g. "A").
2. **Cell conversion:** `rackW = cmToCells(template.width_cm)`, `rackH = cmToCells(template.depth_cm)` (for vertical orientation swap if needed). `spacingCells = cmToCells(rackSpacingCm)`, `aisleCells = cmToCells(aisleWidthCm)`.
3. **Positions:**  
   - Horizontal: Row r at `y = y0 + r * (rackH + aisleCells)`. Column c at `x = x0 + c * (rackW + spacingCells)`.  
   - Vertical: Row r at `x = x0 + r * (rackW + aisleCells)`. Column c at `y = y0 + c * (rackH + spacingCells)`.  
   (Adjust for orientation so “row” is the direction that gets the next letter; “column” is index-in-row.)
4. **Per rack:** For each (r, c), `rowPrefix = nextPrefix(r)` (e.g. letter from startPrefix + r), `indexInRow = c + 1`, `rackLabel = rowPrefix + indexInRow`. Call shared helper to build one `RackState` (with `createBinsForRack(..., rackLabel, ...)`) and push to list. `rack_index` = base + (r * C + c).
5. **Optional row_containers:** For each row r, create a `RowContainer` with id e.g. `row-gen-${r}-${Date.now()}`, `rowPrefix`, orientation, and slots that match the generated rack rects so the designer can still “see” rows and use move/trim/fill.
6. **Grid bounds:** If generator places racks beyond current `grid_cols`/`grid_rows`, either expand layout grid in the same update or prevent generation and ask user to expand grid first.

---

## 6. Naming strategy for generated racks

- **Rack name:** `rowPrefix + indexInRow` (e.g. A1, A2, A3, B1, B2, B3). Same as manual placement.
- **Row prefix:** One letter (or token) per layout row: A, B, C, … from `startPrefix`. If numeric rows are desired (R1-A1), the generator could take a “row naming” option: `letter` (A,B,C) vs `numeric` (R1,R2,R3); then `rowPrefix = "R" + (r+1)` and rack name could still be `R1-1`, `R1-2`, or keep `rowId` in template for bin labels only (e.g. bins R1-1-1-1).
- **Bins:** Already determined by template: `createBinsForRack(..., rackLabel, ...)` with template’s `addressPattern`, `rowId` (can be set to `rackLabel`), `sectionStartIndex`, `binNamingType`, `namingStrategy`, `namingOrientation`, etc. So bin labels stay consistent with template and with manual placement.
- **Where rack names are generated:** In the generator loop and in existing placement: always `rackLabel = \`${rowPrefix}${indexInRow}\``; then passed into the single place that builds bins and rack state (shared helper + `createBinsForRack`).

---

## 7. UI proposal for generator panel

### 7.1 Modal: “Generate warehouse layout”

- **Title:** e.g. “Generuj układ magazynu” / “Generate warehouse layout”.
- **Template selection:** Dropdown or list of current catalog (presets + custom templates). Required. Shows template name and optional short summary (levels × bins, size).
- **Layout shape:**
  - **Rows:** Number input (e.g. 10). Meaning: number of layout rows (each row gets one letter/prefix).
  - **Columns:** Number input (e.g. 3). Meaning: racks per row.
- **Spacing:**
  - **Rack spacing (m or cm):** Number input, e.g. 2.8 m. Gap between racks in the same row.
  - **Aisle width (m or cm):** Number input, e.g. 3.2 m. Gap between rows.
- **Orientation:** Radio or select: “Horizontal” (rows are horizontal) / “Vertical” (rows are vertical).
- **Origin (optional):**
  - **Start position:** “Top-left” (0,0) or custom (x, y) in cells or in m. Default (0,0).
  - **First row prefix:** Text, default “A”.
- **Behaviour when layout not empty:** Radio: “Replace existing layout” / “Append to current layout”. If append, start position or row prefix can be derived from current max extent / next letter.
- **Preview:** Small grid (e.g. 10×10 max) showing rectangles or labels (A1…A3, B1…B3, …) so user sees row/column and naming. Optional: show total size in cells or meters.
- **Actions:** “Cancel”, “Generate”. Generate closes the modal and applies the new racks (and optional row_containers) to the layout.

### 7.2 Where to open the modal

- **Option A:** Designer toolbar: add a button “Generuj układ” that opens the modal. Good for “I want to fill the grid from scratch.”
- **Option B:** RackSidebar: under the catalog, button “Generuj siatkę z szablonu” that opens the same modal with the currently selected (or first) template pre-selected. Good for “I picked this template, now fill many rows.”
- **Both:** Toolbar button + sidebar button both open the same modal; sidebar can pass initial template if one is selected.

### 7.3 Preview grid (sketch)

- 2D grid of cells (e.g. 10×10 or up to R×C). Each cell = one rack. Label inside = rack name (A1, A2, …). Grey lines for row/column. Optional: show spacing and aisle as gaps. Read-only; no interaction except “this is what you’ll get.”

---

## 8. Summary

| Topic | Conclusion |
|-------|------------|
| **Current placement** | Single rack or one row via `stampRack*` / `placeRowWithTemplate`; coordinates in cells; rack name = rowPrefix + indexInRow; bins from `createBinsForRack` with template naming. |
| **Generator insertion** | New frontend module that produces `RackState[]` (and optionally `RowContainer[]`) using the same bin and naming logic; called from a modal; `setLayout` to replace or append. |
| **Replication** | Loop over (row, col), compute (x,y), rowPrefix, indexInRow, rackLabel; build one RackState per cell via shared helper + `createBinsForRack`. |
| **Naming** | Row prefix = letter (or R1, R2) per row; rack name = prefix + indexInRow; bins from template pattern with rackLabel as rowId. |
| **Aisle/spacing** | Represented only by rack positions: gap between racks = spacingCells; gap between rows = aisleCells. No new layout field. |
| **UI** | Modal with template, rows, columns, rack spacing, aisle width, orientation, start/prefix, replace vs append, preview grid; trigger from toolbar or RackSidebar. |

This keeps the generator consistent with existing placement, naming, and save/load, and leaves room for future options (numeric row names, server-side generate, or writing explicit aisle entities).
