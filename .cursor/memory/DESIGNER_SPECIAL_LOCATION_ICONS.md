# Warehouse Designer — Special location icons

## Summary

Clear icons were added for **Start Point** and **Packing Station** on the warehouse map. Only the way markers are rendered was changed; logic, coordinates, and API behavior are unchanged. **Dock** was left as before (no icon).

---

## Start Point icon

- **Icon:** `MapPin` from `lucide-react`
- **Placement:** Centered on the special location cell using existing cell → pixel logic: `px = (x / GRID_UNIT_CM) * cellPx + cellPx / 2`, same for `py`
- **Visual:** Icon is drawn inside a light green circle (`#dcfce7` fill, `#166534` stroke). Icon color follows the green theme (`#22c55e` via `style.color` for `currentColor`)
- **Size:** `iconSize = Math.min(24, Math.max(14, cellPx * 0.6))` so the icon stays visible at different zoom levels

---

## Packing Station icon

- **Icon:** `Package` from `lucide-react`
- **Placement:** Same as Start Point (centered on the cell)
- **Visual:** Icon inside a light blue circle (`#dbeafe` fill, `#1d4ed8` stroke). Icon color blue (`#1d4ed8`)
- **Size:** Same scaling as Start Point

---

## Dock

- **Unchanged:** Dock still uses the existing diamond polygon and "DOCK" text. No icon was added.

---

## Files modified

| File | Change |
|------|--------|
| `frontend/src/components/warehouse/WarehouseCanvas.tsx` | Imported `MapPin` and `Package` from `lucide-react`. Replaced the Start Point circle+text and Packing Station rect+text with icon-based markers (circle background + lucide icon), using the same `px`/`py` and layer order. Dock block untouched. |

---

## Implementation details

- **Library:** `lucide-react` was already in the project; nothing was installed.
- **Positioning:** Icons are rendered in a `<g>` with `transform={`translate(${px - half}, ${py - half})`}` so the icon’s center is at the cell center.
- **Layer order:** Special locations are still drawn in the same place in the tree (after RackLayer, before VisualLayer), so they remain above racks.
- **Zoom:** Icon size scales with `cellPx` within 14–24px so markers stay visible at different zoom levels.
