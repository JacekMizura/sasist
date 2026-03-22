# Wall elements feature (doors and loading gates)

Changelog for the Warehouse Designer wall elements feature.

## Overview

Users can place **doors (Drzwi)** and **loading gates (Brama)** on the building perimeter. Elements are positioned along one of four walls (north, south, east, west) with position and width in centimetres. Gates support a type: **Kurier**, **Dostawca**, or **Oba**.

## STEP 1 — Layout model (frontend)

**File:** `frontend/src/types/warehouse.ts`

- **`WallSide`:** `"north" | "south" | "east" | "west"`.
- **`WallElement`:** `id`, `type: "door" | "gate"`, `wall`, `position_cm`, `width_cm`, optional `gateType: "courier" | "supplier" | "both"` for gates.
- **`LayoutState`** extended with optional **`wall_elements?: WallElement[]`**.

## STEP 2 — Backend persistence

- **Model:** `backend/models/warehouse.py` — **`WarehouseLayout`** has new column **`wall_elements_json`** (Text, nullable).
- **Schema:** `backend/schemas/warehouse_layout.py` — **`WallElementSchema`** (id, type, wall, position_cm, width_cm, gateType) and **`WarehouseLayoutPayload.wall_elements`**.
- **Service:** `backend/services/warehouse_layout_service.py` — **`get_layout()`** includes **`wall_elements`** (parsed from `wall_elements_json`); **`save_layout()`** reads **`wall_elements`** from payload and writes **`wall_elements_json`**.
- **Schema upgrade:** `backend/db/schema_upgrade.py` — **`ensure_warehouse_layout_building_columns()`** adds **`wall_elements_json`** if missing.

## STEP 3 — WallElementsLayer

**File:** `frontend/src/components/warehouse/WarehouseCanvas/WallElementsLayer.tsx`

- Renders doors and gates on the four building edges.
- Converts `position_cm` / `width_cm` to pixels using `cellPx` and `GRID_UNIT_CM`.
- North/South: horizontal band at top/bottom; East/West: vertical band at left/right.
- Doors: grey fill; gates: colour by `gateType` (courier/supplier/both) with label (K/D/K+D).
- Supports selected state and drag preview.

## STEP 4 — Wall click detection

**File:** `frontend/src/pages/WarehouseDesigner/utils/designerMouseUtils.ts`

- **`getWallFromClientPosition()`:** client coords + SVG rect + canvas size and grid → **`{ wall, position_cm }`** or null. Uses a hit band (18 px) from each edge to determine which wall was clicked.
- **`getPositionCmAlongWall()`:** client coords + fixed wall → position in cm along that wall (for drag).

## STEP 5 — Placement mode (Drzwi / Brama)

- **RackSidebar** (Elementy wizualne): two buttons **Drzwi** and **Brama** set **`wallElementTool`** to `"door"` or `"gate"`. Hint: "Kliknij na krawędź budynku (obwód), aby umieścić."
- **useDesignerMouseHandlers:** when **`wallElementTool`** is set and click hits a wall, **door** → **`onAddWallElement(wall, position_cm, "door")`**; **gate** → **`onRequestGatePlacement(wall, position_cm)`** (opens gate type modal).
- **WarehouseDesigner:** **`addWallElement()`** creates a new **WallElement** (door 100 cm, gate 350 cm width), clamps position to wall length, appends to **`layout.wall_elements`**, clears tool and selects the new element.

## STEP 6 — Gate type selector

- When placing a **gate**, **`onRequestGatePlacement`** sets **`pendingGatePlacement`** and **`showGateTypeModal`**.
- Modal: **Typ bramy** with buttons **Kurier**, **Dostawca**, **Oba**. On pick → **`addWallElement(..., "gate", gateType)`**, close modal and clear pending. **Anuluj** closes without placing.

## STEP 7 — Drag along wall

- **WallElementsLayer** **`onPointerDown`** → **`onStartWallElementDrag(el)`** sets **`draggingWallElementId`**.
- **WarehouseDesigner** **useEffect:** while **`draggingWallElementId`** is set, **window** **pointermove** → **`getPositionCmAlongWall()`** → **`setDragPreviewPositionCm`**; **pointerup** → **`updateWallElementPosition(id, position_cm)`**, then clear drag state.
- **`updateWallElementPosition`** clamps **position_cm** to **`[0, wall_length_cm - width_cm]`** so the element stays on the wall.

## STEP 8 — Delete

- **DesignerKeyboard:** **Delete** / **Backspace** when **`selectedWallElementId`** is set → **`deleteSelectedWallElement()`** (removes from **`layout.wall_elements`**, clears selection).
- Selection: click on a wall element in **WallElementsLayer** sets **`selectedWallElementId`**; **clearAllSelections** in the mouse handler also clears **`selectedWallElementId`**.

## Load / save

- **loadLayout** in **WarehouseDesigner** maps **`d.wall_elements`** from API into **`LayoutState.wall_elements`** (id, type, wall, position_cm, width_cm, gateType).
- Save payload includes **`wall_elements: layout.wall_elements ?? []`**; backend persists to **`wall_elements_json`**.

## Verification

- **Layout i szablony** → **Elementy wizualne** → **Drzwi** / **Brama** → click on building border → door or gate type modal (for gate) → element appears on the edge.
- Drag element along its wall; position is clamped.
- Select element → **Delete** removes it.
- Save layout and reload: wall elements persist and render correctly.
