# Rack Properties UX fixes

Summary of UX improvements in the Rack Properties panel of the Warehouse Designer. No rack layout structure or backend models were changed.

---

## 1. Bin renamed to Pozycja

- **File:** `frontend/src/constants/uiStrings.ts`
- **Change:** `UI_STRINGS.warehouse.rackProperties.levelsBins` text updated from **"Poziomy / Biny"** to **"Poziomy / Pozycje"**.
- Schema field names (e.g. `bins_per_level`) are unchanged; only the user-facing label was translated.

---

## 2. Drag helper text removed

- **File:** `frontend/src/components/warehouse/RackPropertiesSidebar.tsx`
- **Change:** Removed the paragraph:  
  `<p className="text-[10px] text-slate-500 mt-1">Przeciągnij na planie, aby przenieść.</p>`  
  It had no functional dependency.

---

## 3. Location percentages removed

- **File:** `frontend/src/components/warehouse/RackPropertiesSidebar.tsx`
- **Section:** "Lokacje (poziom → pozycja)"
- **Change:** Removed the percentage display (`{pct}%`) and the occupancy calculation (`vol`, `used`, `pct`) that was only used for this list.
- The list now shows only **Level → Position** (e.g. `1 → 1`, `1 → 2`, `2 → 1`) in a simple format.

---

## 4. Paste fallback position added

- **Issue:** Paste required `cursorCm` to be set; it becomes `null` when the mouse leaves the canvas, so paste failed in that case.
- **Files:** `frontend/src/pages/WarehouseDesigner.tsx`, `frontend/src/pages/WarehouseDesigner/DesignerKeyboard.ts`, `frontend/src/components/warehouse/RackPropertiesSidebar.tsx`, `WarehouseCanvas.tsx`, `WarehouseMainView.tsx`
- **Implementation:**
  - **Last cursor ref:** In `WarehouseDesigner`, a ref `lastCursorCmRef` stores the last non-null `cursorCm` (updated in a `useEffect` when `cursorCm` changes).
  - **Fallback chain:** `getPastePosition()` returns `cursorCm ?? lastCursorCmRef.current ?? viewportCenterCm`, where `viewportCenterCm` is the center of the layout in cm: `(layout.grid_cols * GRID_UNIT_CM) / 2`, `(layout.grid_rows * GRID_UNIT_CM) / 2`.
  - **Usage:** Paste (button "Wklej" and Ctrl+V) and duplicate (Ctrl+D) use `getPastePosition()` instead of `cursorCm`, so paste/duplicate work even when the mouse has left the canvas.
- No changes in `useDesignerMouseHandlers.ts` or `useDesignerRackPlacement.ts`; only consumer logic and passed props were updated.

---

## 5. Multi-select editing disabled

- **File:** `frontend/src/components/warehouse/RackPropertiesSidebar.tsx`
- **Change:** When `isMultiSelect` is true, the panel no longer shows editable inputs for **Wysokość (cm)** and **Poziomy**.
- **New UI:** Read-only information only:
  - **Wysokość (cm):** If all selected racks have the same value, that value is shown; otherwise **"różne"**.
  - **Poziomy:** If all selected racks have the same value, that value is shown; otherwise **"różne"**.
- Removed: `onBlur` handlers, `setLayout` updates, and multi-edit logic for height and levels.

---

## Verification checklist

- [ ] Selecting a single rack
- [ ] Editing height and levels for a single rack (unchanged)
- [ ] Selecting multiple racks (read-only height/levels, no edits)
- [ ] Copy racks (Kopiuj / Ctrl+C)
- [ ] Paste racks (Wklej / Ctrl+V), including when mouse has left the canvas
- [ ] Duplicate racks (Ctrl+D) with fallback position
- [ ] Dragging racks on the canvas
