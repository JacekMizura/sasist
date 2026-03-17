# Architecture Analysis: Wall Elements (Doors & Loading Gates)

**Scope:** Extend Warehouse Designer so users can place **Doors (Wejścia)** and **Loading gates (Bramy wjazdowe)** on the building perimeter. Gates support type: `courier` | `supplier` | `both`. **No implementation**—analysis only.

---

## SECTION 1 — Building border rendering

### Where the building is drawn

- **File:** `frontend/src/components/warehouse/WarehouseCanvas.tsx`
- The “building” is the main SVG `<rect>` at `(0, 0)` with `width={width}` and `height={height}` (around lines 633–642). It uses the same dimensions as the grid/viewBox.

### Canvas dimensions and coordinate system

- **Source of width/height:** In `WarehouseDesigner.tsx` (lines 1209–1211):
  - `cellPx = BASE_PX_PER_CELL`
  - `width = layout.grid_cols * cellPx`
  - `height = layout.grid_rows * cellPx`
- So the drawn rectangle is **grid-based**: one cell = one grid unit; conversion to pixels uses **`cellPx`** (e.g. `cellToPx(ve.x, cellPx)` for visual elements).
- Layout also has **`building_width_m`**, **`building_depth_m`**, **`building_height_m`** (meters). These are stored and used for validation/display but **are not yet used to derive four explicit wall edges** (north/south/east/west) in the canvas. The visible border is effectively the full grid rectangle.

### Mouse vs. building edges

- Mouse → cell is done via **`getCellFromEvent(e)`**, giving `{ x, y }` in **cell coordinates**.
- There is no current logic that maps a click to “which wall” or “position along a wall”. To support wall snapping, the four walls need to be defined, e.g.:
  - **North:** y = 0, x ∈ [0, grid_cols)
  - **South:** y = grid_rows − 1 (or edge), x ∈ [0, grid_cols)
  - **West:** x = 0, y ∈ [0, grid_rows)
  - **East:** x = grid_cols − 1 (or edge), y ∈ [0, grid_rows)
- Optionally, if building size in meters is smaller than the grid, wall edges could be derived from `building_width_m` / `building_depth_m` converted to cells (e.g. via a fixed cm-per-cell or cells-per-meter constant used elsewhere).

---

## SECTION 2 — Existing visual elements system

### Tab and types

- Tab **"Elementy wizualne"** in the designer offers elements such as: Ściany (walls), Drzwi (doors), Stanowiska pakowania, Strefa przyjęć/wysyłki, etc.

### Data structure

- **File:** `frontend/src/types/warehouse.ts`
- **`VisualElementType`** includes: `"column" | "mezzanine" | "packing_station" | "cart" | "wall" | "door" | "zone"` (and possibly others).
- **`VisualElementState`** has: `id`, `type`, `x`, `y`, `width`, `height` (in **cells**), `zIndex`, plus optional: `name`, `label`, `length`, `thickness`, `doorStyle`, `zoneType`, `color`, `rotation`, `columnShape`, `diameter`, `width_cm`, `depth_cm`, `height_cm`, `total_volume_dm3`, `current_occupancy_dm3`.

### Storage in layout state

- **`LayoutState`** (same types file) has **`visual_elements: VisualElementState[]`**.
- They live in **`layout.visual_elements`** and are passed into the canvas and used when saving (e.g. `WarehouseDesigner.tsx` ~786) and when loading from API (e.g. ~464–486).

### Rendering

- **File:** `frontend/src/components/warehouse/WarehouseCanvas/VisualLayer.tsx`
- Renders each visual element by **cell** (`x`, `y`, `width`, `height`); walls and doors have custom drawing. Coordinates are converted to pixels using **`cellPx`** (e.g. `cellToPx(ve.x, cellPx)`).

### Placement flow

- **`addVisualElement(cell, type)`** in `WarehouseDesigner.tsx` is called when the user drops a visual element (e.g. from the “Elementy wizualne” panel) at a **grid cell**.
- Placement is **free**: click/drop anywhere on the grid; there is **no constraint to building walls**.

---

## SECTION 3 — Layout data model

### Frontend

- **`LayoutState`** in `frontend/src/types/warehouse.ts`: `grid_cols`, `grid_rows`, `building_width_m`, `building_depth_m`, `building_height_m`, `racks`, `aisles`, **`visual_elements`**, `row_containers`, etc.
- Racks: position/size in grid cells; bins and structure as in backend.
- Visual elements: array of **`VisualElementState`** (see Section 2).

### Backend

- **Model:** `backend/models/warehouse.py`
  - **`WarehouseLayout`:** `warehouse_id`, `name`, `width_m`, `length_m`, `grid_cols`, `grid_rows`, **`row_containers_json`** (Text), `building_width_m`, `building_depth_m`, `building_height_m`. **No column for `visual_elements`**.
  - Racks and aisles are separate tables (`Rack`, `Aisle`) linked to the layout.
- **Schema:** `backend/schemas/warehouse_layout.py` — **`WarehouseLayoutPayload`** has: `name`, `grid_cols`, `grid_rows`, `width_m`, `length_m`, `building_*`, `racks`, `aisles`, `row_containers`. **No `visual_elements`**.
- **Service:** `backend/services/warehouse_layout_service.py`
  - **`get_layout()`** returns a dict with layout_id, warehouse_id, grid_cols, grid_rows, building_*, racks, aisles, row_containers. **It does not include `visual_elements`**.
  - **`save_layout()`** persists name, grid_cols, grid_rows, building_*, racks, aisles, row_containers. **It does not read or write `visual_elements`**.
  - **`get_location_label_records()`** does `layout_data.get("visual_elements")` — so the code is prepared for visual_elements in the layout dict, but since `get_layout()` never adds them, that list is always empty unless extended.

### Conclusion

- **Racks** and **aisles** are fully persisted in the backend.
- **Visual elements** (including current “Drzwi” and “Ściany”) are **not persisted**: they are only in frontend state and in the PUT payload; the backend does not store or return them. To persist wall elements (and any visual elements), the backend must be extended (e.g. a `visual_elements_json` column or similar and schema/API changes).

---

## SECTION 4 — Proposed wall element model

A dedicated model for **perimeter** doors and gates keeps semantics clear and enables wall-based placement and validation.

```ts
type WallSide = "north" | "south" | "east" | "west";

type WallElement = {
  id: string;
  type: "door" | "gate";
  wall: WallSide;
  /** Position along the wall: 0 = start of wall (e.g. left for north/south, top for east/west), in cm */
  position_cm: number;
  /** Width of the element along the wall, in cm */
  width_cm: number;
  /** Only for type === "gate" */
  gateType?: "courier" | "supplier" | "both";
};
```

- **Doors** use `type: "door"`; no `gateType`.
- **Gates** use `type: "gate"` and **`gateType`** (`courier` | `supplier` | `both`).
- **`wall`** identifies which building edge; **`position_cm`** and **`width_cm`** define position and size along that edge. This allows:
  - Validation (element stays within wall length).
  - Snapping and drag-along-wall in cm or cell space (with a defined cm-per-cell or cells-per-meter for the perimeter).

Optional: add **`label`** or **`name`** for UI/printing. Backend can mirror this with a Pydantic schema and store in a JSON field (e.g. `wall_elements_json` or inside a broader `visual_elements_json` with a discriminator).

---

## SECTION 5 — Interaction model

1. **Select tool:** User selects **"Drzwi"** or **"Brama"** (and for gate, optionally **gateType** in a sub-control).
2. **Place:** User **clicks on a building wall** (perimeter). The app:
   - Determines which wall was clicked (north/south/east/west) from click position (e.g. which edge is closest, or strict “on edge”).
   - Converts click to **position along that wall** (e.g. in cm from the wall start).
   - Appends a new **WallElement** with default `width_cm` (e.g. door 90–120 cm, gate 300–400 cm) and optional default `gateType` for gates.
3. **Reposition:** User **drags** an existing door/gate **along the same wall** only. Position is clamped to `[0, wall_length_cm - width_cm]` so the element stays on the wall.
4. **Snapping:** Optionally snap **position_cm** to a grid (e.g. 10 cm) or to other wall elements to avoid overlap. Overlap checks: two elements on the same wall must not have overlapping `[position_cm, position_cm + width_cm]`.

**Wall length in cm:** Derive from layout: e.g. north/south length = `building_width_m * 100` (if building dimensions define the perimeter), or from grid: `grid_cols * 10` (if 1 cell = 10 cm). Same for east/west from `building_depth_m` or `grid_rows`. Use one consistent convention.

**Hit-testing:** For “click on wall”, define a **hit band** (e.g. 5–15 px from the outer edge of the building rect). If the click falls in the north band → north wall; similarly for south/east/west. Then compute position along wall from the click’s x (for north/south) or y (for east/west).

---

## SECTION 6 — Rendering approach

- **Option A — Reuse VisualLayer:** Extend **`VisualLayer`** to also accept **wall elements**. Convert each `WallElement` (wall + position_cm + width_cm) into a **pseudo-rect** in canvas space: e.g. for north wall, draw a rectangle at the top edge with width = `width_cm` in px and small height (door/gate symbol). Pros: one layer, consistent selection/ordering. Cons: VisualLayer is already cell-based; wall elements are wall-relative and cm-based, so conversion logic lives in one place.
- **Option B — New WallElementsLayer:** A dedicated **`WallElementsLayer`** only draws doors and gates on the perimeter. It receives `wallElements`, `building rect` (or grid_cols/grid_rows + cellPx), and draws symbols/icons on the four edges. Pros: clear separation, easier to add wall-specific UX (e.g. highlight wall on hover). Cons: one more layer and possibly duplicated “element list” handling if selection is unified elsewhere.

**Recommendation:** Prefer **Option B (WallElementsLayer)** for clarity and to keep wall-specific coordinate math (wall side + position_cm + width_cm → canvas) in one place. Selection and state updates can still be handled in the parent (e.g. WarehouseDesigner) and passed down. If the codebase later unifies all “decorative” elements in one layer, wall elements can be merged in.

**Rendering details:** For each wall, iterate `wallElements` for that wall, compute pixel position from `position_cm` and wall length, draw a small rect or icon (door vs. gate, and gate type icon/color if needed). Use the same `cellPx` or a consistent **cm-to-px** factor so that the perimeter scale matches the grid (e.g. 1 cell = 10 cm → 1 cm = cellPx/10 px).

---

## SECTION 7 — Backend storage

- **Current:** Layout is persisted via **`save_layout()`**; **`visual_elements`** are **not** stored or returned in **`get_layout()`**. So existing “Drzwi”/“Ściany” in the tab are **not** persisted.
- **For wall elements (and optionally all visual elements):**
  1. **Option 1 — Single JSON blob for all visual data:** Add **`visual_elements_json`** (Text) to **`WarehouseLayout`**. Store a JSON array that includes both current free-form visual elements and the new wall elements (e.g. with a `kind: "wall_element"` and the WallElement shape). **`get_layout()`** parses and returns `visual_elements` (and optionally a separate `wall_elements`) from this blob; **`save_layout()`** accepts `visual_elements` and/or `wall_elements` and writes them into `visual_elements_json`. Schema and payload extend to include `visual_elements` and/or `wall_elements`.
  2. **Option 2 — Dedicated wall_elements column:** Add **`wall_elements_json`** (Text) to **`WarehouseLayout`** for the array of **WallElement** only. Keep a separate **`visual_elements_json`** (or the same as today, not persisted) for the rest. Clear separation; simpler validation and API for wall elements.

**Recommendation:** If the product goal is to persist **only** wall elements (doors/gates) and leave other “Elementy wizualne” as non-persistent for now, add **`wall_elements_json`** and extend **WarehouseLayoutPayload** (and Pydantic schema) with **`wall_elements: List[WallElementSchema]`**. When saving, serialize to JSON and store in **`wall_elements_json`**; when loading, include **`wall_elements`** in the **`get_layout()`** return dict. If the goal is to persist **all** visual elements, add **`visual_elements_json`** and optionally store wall elements inside it (with a type discriminator) or in a separate key for easier validation.

**Schema (backend):** Define a **WallElementSchema** (Pydantic) with `id`, `type` (literal "door" | "gate"), `wall` (literal "north" | "south" | "east" | "west"), `position_cm`, `width_cm`, optional `gateType` for gates. Use it in the layout payload and in validation when reading/writing the JSON column.

---

## Summary

| Topic | Finding |
|-------|--------|
| **Building border** | One SVG `<rect>` in WarehouseCanvas; size = grid (grid_cols × grid_rows) in cellPx; building_*_m exist but are not used to define four wall edges. |
| **Visual elements** | Types in `warehouse.ts`; stored in `layout.visual_elements`; rendered in VisualLayer; placement by grid cell with no wall constraint. |
| **Layout model** | Frontend: LayoutState with visual_elements. Backend: WarehouseLayout has no visual_elements; they are not persisted. |
| **Wall element model** | Proposed: WallElement with id, type (door|gate), wall, position_cm, width_cm, gateType? for gates. |
| **Interaction** | Select Drzwi/Brama → click on wall → place; drag along same wall; snapping/overlap checks on same wall. |
| **Rendering** | Prefer new WallElementsLayer; convert wall + position_cm + width_cm to canvas using building dimensions or grid. |
| **Backend** | Add persistence (e.g. `wall_elements_json` and/or `visual_elements_json`), extend schema and get_layout/save_layout. |

No code changes were made; this document is analysis only.
