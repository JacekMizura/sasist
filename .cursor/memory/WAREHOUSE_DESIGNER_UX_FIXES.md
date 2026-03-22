# Warehouse Designer — UX fixes

Summary of UI and interaction improvements. Core layout logic unchanged.

---

## 1. Removed building dimensions from canvas

- **File:** `frontend/src/components/warehouse/WarehouseCanvas.tsx`
- **Change:** Removed the `<g>` block that rendered building width and depth text labels (e.g. "X m" above the canvas and depth on the right).
- **ViewBox:** Reverted to `0 0 ${width} ${height}` (no extra space for dimension labels).
- Building borders still render; layout rendering unchanged. Dimensions remain visible only in the "Budynek" panel (toolbar button and sidebar).

---

## 2. Building border solid

- **File:** `frontend/src/components/warehouse/WarehouseCanvas.tsx`
- **Change:** On the building outline `<rect>`, removed `strokeDasharray="6 4"`.
- **Style:** `stroke="#666"`, `strokeWidth={2}`, no dash. Border now looks like solid warehouse walls.

---

## 3. Start / packing points movable

- **Files:** `frontend/src/components/warehouse/WarehouseCanvas.tsx`, `frontend/src/pages/WarehouseDesigner.tsx`, `backend/api/warehouse_layout.py`
- **Canvas:** Removed `pointerEvents="none"` from special location icons (Start Point, Packing Station, Dock) so they receive mouse events.
- **Drag:** Implemented drag (mousedown → start drag, mousemove → update position, mouseup → commit). Mouse position is converted to grid cell via existing `getCellFromEvent`; on commit the new cell is converted to cm and sent to the API.
- **Backend:** Added `PATCH /warehouse/special-location/{location_id}` with body `{ x, y }` (cm) to update position. Frontend calls it on drag end and refetches special locations.

---

## 4. Start / packing points deletable

- **Files:** `frontend/src/components/warehouse/WarehouseCanvas.tsx`, `frontend/src/pages/WarehouseDesigner.tsx`, `backend/api/warehouse_layout.py`
- **Interaction:** Right-click on a special location icon opens a context menu with "Usuń". Clicking it deletes the location.
- **Backend:** Added `DELETE /warehouse/special-location/{location_id}`. Frontend calls it and refetches special locations.
- **Rendering:** Icons stay centered on the cell, above the rack layer, and visible at all zoom levels.

---

## 5. Duplicate warehouse name removed

- **File:** `frontend/src/pages/WarehouseDesigner/DesignerToolbar.tsx`
- **Change:** Removed the `<span>` that showed `warehouseName` next to the warehouse `<select>`. The dropdown already shows the selected warehouse name; the extra label was redundant (and showed as a duplicate "1" when the name was short).

---

## Verification checklist

- [ ] Add start point
- [ ] Add packing station
- [ ] Move start point (drag)
- [ ] Move packing station (drag)
- [ ] Delete start point (right-click → Usuń)
- [ ] Delete packing station (right-click → Usuń)
- [ ] Building border renders as solid
- [ ] Building dimensions visible only in "Budynek" panel
- [ ] Warehouse selector no longer shows duplicated name
