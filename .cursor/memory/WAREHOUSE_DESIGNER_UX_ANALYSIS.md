# Warehouse Designer — UX and logic issues (analysis only)

Structured report for four issues. **No code was changed.**

---

## SECTION 1 — Building dimensions rendering (duplicate)

**Goal:** Keep building dimensions only in the "Budynek" panel; remove them from the layout canvas.

### Where building dimensions are rendered on the layout

- **File:** `frontend/src/components/warehouse/WarehouseCanvas.tsx`
- **Location:** Inside the main `<svg>` (lines 642–655).

**Current logic:**

1. **Condition:** Dimensions are rendered when:
   - `layout.building_width_m != null` **and**
   - `(layout.building_depth_m != null || layout.building_height_m != null)`.

2. **What is drawn:** A `<g pointerEvents="none">` containing two `<text>` elements:
   - **Width:** `{layout.building_width_m} m` at `(width/2, -10)` (above the canvas, centered).
   - **Depth:** `{depthM} m` (depthM = `layout.building_depth_m ?? layout.building_height_m`) at the right side of the canvas, rotated -90°.

3. **ViewBox:** When building dimensions exist, the SVG `viewBox` is expanded (lines 621–624) to include extra space for these labels: `viewBox={... `${-20} ${-18} ${width + 38} ${height + 18}` ...}`. So the canvas reserves space for the dimension text.

### Toggle / state

- There is **no** `showDimensions` (or similar) state for this.
- The dimension text is shown **whenever** the layout has `building_width_m` and depth set; there is no user toggle.
- **DimensionOverlay.tsx** is **not** used for building dimensions. It is used elsewhere for **rack/aisle dimension lines** (e.g. selection/drag) and takes `dimensionLines` and `aisleHighlights`. The building width/depth labels are inline in `WarehouseCanvas.tsx` only.

### Where "Budynek" panel shows dimensions

- **DesignerToolbar** (top bar): "Budynek: W × D × H m" button (opens Edit Building modal) — `DesignerToolbar.tsx` lines 67–76, 89–91.
- **RackSidebar** (Budynek panel in sidebar): Shows dimensions and area/volume — `RackSidebar.tsx` (e.g. lines 112–113, 143, 147, 149).

### Changes needed to fix (duplicate removed from canvas)

1. **In `WarehouseCanvas.tsx`:**
   - **Remove** the `<g>` block that renders the two `<text>` elements (lines 642–655), so building width/depth are no longer drawn on the canvas.
   - **Optional:** Reconsider the expanded `viewBox` (lines 621–624). If it was only needed to make room for the dimension labels, it can be reverted to `0 0 ${width} ${height}` when the labels are removed. If the extra padding is still desired for other reasons (e.g. building border), keep it as is.

2. **No change** to DimensionOverlay or any `showDimensions` flag; building dimensions are not wired to that component.

---

## SECTION 2 — Building border rendering (dashed → solid)

**Goal:** Building border should be a solid line (walls), not dashed.

### Where the building rectangle is rendered

- **File:** `frontend/src/components/warehouse/WarehouseCanvas.tsx`
- **Location:** Same `<svg>` as above, first child after the opening `<svg>` tag (lines 633–642).

**Current code:**

```tsx
<rect
  x={0}
  y={0}
  width={width}
  height={height}
  fill="none"
  stroke="#666"
  strokeWidth={2}
  strokeDasharray="6 4"
/>
```

- This rect outlines the full canvas (building footprint). The **dashed** look comes from **`strokeDasharray="6 4"`**.

### Other dashed strokes in the same file

- **Aisle/row/ghost UI:** Other uses of `strokeDasharray` in `WarehouseCanvas.tsx` (e.g. 759, 787, 815) are for **ghost placement**, **row preview**, etc., not the building outline. Only the rect at 633–642 is the building border.

### Change needed

- In `WarehouseCanvas.tsx`, on the building outline `<rect>` (lines 633–642), **remove** the attribute `strokeDasharray="6 4"` (or set it to `"none"` if you prefer to keep the attribute). That will make the stroke solid.

---

## SECTION 3 — Special locations (Start Point, Packing Station) cannot be moved or deleted

**Goal:** Understand why Start Point and Packing Station can be added but not moved or deleted.

### Where these elements are rendered

- **File:** `frontend/src/components/warehouse/WarehouseCanvas.tsx`
- **Locations:** Three blocks (lines 705–742):
  - **pick_start:** MapPin icon in green circle.
  - **packing:** Package icon in blue circle.
  - **dock:** Diamond + "DOCK" text (if present).

**Critical detail:** Each of these `<g>` elements has **`pointerEvents="none"`**:

- `pick_start`: `<g key="special-pick_start" pointerEvents="none" ...>`
- `packing`: `<g key="special-packing" pointerEvents="none" ...>`
- `dock`: `<g key="special-dock" pointerEvents="none">`

So **all pointer events (click, drag) pass through** to elements below. The special locations never receive mouse/touch events; therefore no drag or click-to-delete can be implemented on them without changing this.

### How they are added

- **Modes:** `LayoutMode.ADD_START` and `LayoutMode.ADD_PACK` (see `frontend/src/warehouse-layout/LayoutMode.ts`).
- **Toolbar:** Buttons in `WarehouseCanvas.tsx` (lines 413–414) set the layout mode to `ADD_START` or `ADD_PACK`.
- **Interaction:** `frontend/src/pages/WarehouseDesigner/interactions/usePlacementInteraction.ts`:
  - On mouse down with `layoutMode === ADD_START` or `ADD_PACK`, it calls **`addSpecialLocation(cell, type)`** (lines 55–56) and does not handle any other action (no move/delete).
- **State and API:** In `WarehouseDesigner.tsx`:
  - State: `specialLocations` (`useState<SpecialLocationsState>`) with `pick_start`, `packing`, `dock` (each `{ x, y } | null` in cm).
  - Load: `GET /warehouse/:id/special-locations` fills `specialLocations`.
  - Add: `POST /warehouse/special-location` with `warehouse_id, x, y, type`; then refetch special-locations and update state. There is **no** backend call for **update** (move) or **delete** in the designer flow found in the searched code; only add and read.

### Why there is no move or delete

1. **Rendering:** `pointerEvents="none"` prevents any click/drag on the icons.
2. **Interaction layer:** `usePlacementInteraction` only handles **adding** when in `ADD_START`/`ADD_PACK`; there is no hit-test for “click on existing special location” or “drag special location” and no handlers that call an update/delete API or update local state for move/delete.
3. **Backend:** Only add and get are used; update/delete endpoints may exist elsewhere but are not wired in the designer.

### Changes needed to allow move and delete

1. **Rendering (WarehouseCanvas.tsx):**
   - Remove `pointerEvents="none"` from the special-location `<g>` elements (or set `pointerEvents="auto"` / `"all"`), and give them a deterministic `key` and possibly `data-type` / `data-kind` so the same element can be targeted by events.

2. **Hit-test and state:**
   - In the same place where canvas mouse events are handled (e.g. in `WarehouseDesigner.tsx` or a shared interaction hook), add logic to detect when the click/down is over a special location (e.g. by comparing pointer position in cm with `specialLocations.pick_start`, `.packing`, `.dock` and a small hit radius).
   - Optionally track “selected special location” (e.g. type + index) so that a toolbar or context menu can offer “Move” / “Delete”.

3. **Move:**
   - For drag: on pointer down over a special location, enter a “dragging special location” mode; on move, update local state (and optionally debounced API); on pointer up, call API to update position (if an update endpoint exists) and refetch or update state.
   - If backend has no update endpoint, add one (e.g. `PATCH /warehouse/special-location` or `PUT` with id/type + new x,y) and call it from the designer.

4. **Delete:**
   - On click (or via context menu / toolbar when a special location is selected), call a delete API (e.g. `DELETE /warehouse/special-location` or set type to null); then refetch or set `specialLocations.pick_start` / `.packing` / `.dock` to `null` as appropriate.

5. **Modes:**
   - Decide whether ADD_START/ADD_PACK should be the only way to place, or if in “select” mode clicking an existing icon should select it for move/delete. If the same mode is used for add and for selecting, then hit-test order must prefer “existing special location” over “add new” when the click is on an icon.

---

## SECTION 4 — Warehouse selector showing an extra number

**Goal:** Understand why the top bar shows something like `[warehouse dropdown] 1` (an extra number next to the dropdown).

### Where the warehouse selector lives

- **File:** `frontend/src/pages/WarehouseDesigner/DesignerToolbar.tsx`
- **Parent:** Rendered as the `actions` prop of `PageLayout` in `WarehouseDesigner.tsx` (lines 1249–1271).

### What is rendered next to the dropdown

In `DesignerToolbar.tsx`, the top bar has (in order):

1. **Nav tabs** (Magazyn / Projektant Layoutu)
2. **Building block:** “Budynek: W × D × H m” (or “Ustaw wymiary budynku”) and optional “Zajętość: X%”
3. **Warehouse `<select>`:**  
   - `value={selectedWarehouseId ?? ""}`  
   - Options: `warehouses.map((wh) => <option key={wh.id} value={wh.id}>{wh.name}</option>)`
4. **Conditional span:**  
   - `{warehouseName ? <span className="text-sm text-slate-600">{warehouseName}</span> : null}`  
   - So **next to the dropdown** the UI shows **`warehouseName`** whenever it is truthy.
5. **Sync badge:** A span showing “Sync z DB” or “Nie zapisano” (from `UI_STRINGS.warehouse.selector.syncSaved` / `notSaved`).

**Source of `warehouseName`:** Passed from `WarehouseDesigner.tsx` as **`warehouseName={layout.warehouse_name}`**. The layout’s `warehouse_name` is set when the layout is loaded from the API (e.g. `warehouse_layout_service` returns `warehouse_name: wh.name`). So **the extra text next to the dropdown is the same warehouse name** (or whatever the API returns as `warehouse_name`).

### Why an “extra number” appears

- The dropdown **already** shows the selected warehouse’s **name** (e.g. “Magazyn 1” or “1”) in the selected `<option>`.
- The **second element** is the **`warehouseName`** span, which shows **the same value** again (`layout.warehouse_name`).
- So if the warehouse is named **“1”**, the user sees:  
  **`[dropdown showing “1”]` `1`**  
  i.e. the dropdown and then the number “1” again. The “extra number” is the **redundant** display of the warehouse name in the span. (If the name were longer, it would be duplicate text; with a short name like “1” it looks like an extra number.)

### Changes needed

1. **Remove redundant label (recommended):**  
   - Remove the conditional block that renders `{warehouseName ? <span ...>{warehouseName}</span> : null}` in `DesignerToolbar.tsx` (lines 105–107). The dropdown already shows the selected warehouse name; the extra span is redundant and causes the duplicate “1” (or any name) next to the dropdown.

2. **Alternative (keep for edge cases):**  
   - If you want to keep a separate label for cases where the dropdown text might be stale (e.g. name updated from another tab), show the span only when `warehouseName` is truthy **and** different from the selected option’s label (e.g. `warehouses.find(w => w.id === selectedWarehouseId)?.name !== warehouseName`). That way you avoid the duplicate “1” when the name matches the option.

---

## Summary table

| Issue | Main file(s) | Current behavior | Fix direction |
|-------|--------------|------------------|----------------|
| **1. Duplicate building dimensions** | `WarehouseCanvas.tsx` (642–655, viewBox 621–624) | Building width/depth in m are drawn on the canvas when layout has dimensions; no toggle. | Remove the dimension `<g>` (and optionally simplify viewBox). |
| **2. Building border dashed** | `WarehouseCanvas.tsx` (633–642) | Building outline rect uses `strokeDasharray="6 4"`. | Remove `strokeDasharray` (or set to `"none"`) on that rect. |
| **3. Special locations not moveable/deletable** | `WarehouseCanvas.tsx` (705–742), `usePlacementInteraction.ts`, `WarehouseDesigner.tsx` | Icons have `pointerEvents="none"`; only add is implemented; no update/delete in designer. | Enable pointer events, add hit-test and drag/click handlers, wire move/delete (and backend if missing). |
| **4. Extra number by warehouse selector** | `DesignerToolbar.tsx` (105–107) | `warehouseName` is rendered next to the dropdown; when name is “1”, it looks like an extra number. | Remove the `warehouseName` span or show it only when it differs from the selected option. |
