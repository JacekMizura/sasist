# Repeater children not editable – root cause analysis

**Problem:** Elements inside a repeater (e.g. barcode) cannot be edited correctly in the designer: resize, rotate, move, and layer controls fail or behave inconsistently, even after exposing repeater children to the selection system.

**Conclusion:** Repeater children **are** included in the overlay and **do** receive updates via `updateElement`. The main causes of the remaining bugs are: **(1) only one overlay box per child (first slot)** so selection is inconsistent when clicking other slots; **(2) layer controls use only top-level `template.elements` for zIndex min/max and the layout engine does not sort repeater template by zIndex; **(3) duplicate (Ctrl+D) only looks up `template.elements`, so repeater children are never duplicated; **(4) resize handles use `selected.x`/`selected.y` (element-relative), which is correct, but the single overlay instance can make it seem like resize/move “don’t work” when the user is clicking a different slot.**

---

## 1. How the selection overlay currently works

**File:** `frontend/src/pages/LabelSystem/hooks/useLabelSelection.ts`

- **`flattenOverlayEntries(elements)`** (lines 81–109) builds the list of selectable items:
  - Iterates over `elements` (top-level `template.elements` sorted by zIndex).
  - For each **group**: pushes the group, then recurses into `group.elements` with `appendGroupEntries` (children get `displayX = baseX + child.x`, `displayY = baseY + child.y`).
  - For each **repeater**: pushes the repeater at `(rep.x, rep.y)`, then for each child in `rep.template.elements` pushes `{ element: child, displayX: rx + child.x, displayY: ry + child.y }` (or recurses if child is a group).
  - For other elements: pushes at `(el.x, el.y)`.

- **`overlayEntries`** (lines 155–158) = `flattenOverlayEntries([...template.elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)))`.

- **`overlayElementsOrdered`** (lines 162–166): when `selectedId` is set, the entry whose `element.id === selectedId` is moved to the end of the array (so its overlay div is drawn on top with higher z-index).

So the overlay is a **flattened** list: repeater and group **children are included**, each with a **single** overlay entry. Positions use **display** coordinates (canvas-relative): for a repeater child, `displayX = rep.x + child.x`, `displayY = rep.y + child.y`.

---

## 2. Whether repeater children are included

**Yes.** Repeater children are included:

- In `flattenOverlayEntries`, for `el.type === "repeater"` the code pushes the repeater, then iterates `rep.template?.elements ?? []` and pushes each child (or expands groups inside the repeater) with `displayX: rx + child.x`, `displayY: ry + child.y`.

So every repeater child has **exactly one** overlay entry. That entry is positioned at the **first slot** only (repeater origin + child offset). The **renderer** instead produces one layout item **per slot** (e.g. 3 barcodes for 3 items). So there are **multiple visual instances** of the barcode in the SVG, but **only one interactive overlay** (over the first slot). Clicking the 2nd or 3rd barcode in the preview hits either the repeater’s big overlay box or empty space, not the child’s overlay, so selection is **inconsistent** unless the user clicks the first slot.

---

## 3. Whether element IDs match between overlay and template

**Yes.** Overlay entries use the **same** `element` reference (and thus `element.id`) as in the template:

- Each `OverlayEntry` is `{ element: TemplateElement, displayX, displayY }`.
- The same object (from `rep.template.elements` or `group.elements`) is pushed; no generated or index-based IDs.
- **`findElementById(template.elements, id)`** (lines 13–26) recurses into groups and into `rep.template.elements`, so the selected element is correctly resolved by id.
- **`updateElement(id, patch)`** in `LabelTemplateDesigner.tsx` (lines 200–223) uses **`updateInElements`**, which recurses: when `el.id === id` it applies the patch; for groups it recurses into `g.elements`; for repeaters it recurses into `r.template.elements`. So updates **do** reach repeater children by id.

So ID mapping is correct; the wrong-element bug is not due to ID mismatch.

---

## 4. Whether updateElement supports nested elements

**Yes.** In `LabelTemplateDesigner.tsx`, **`updateElement`** (lines 194–231) uses **`updateInElements(elements)`**:

- If `el.id === id`, it merges the patch and returns the clamped element.
- If `el.type === "group"`, it returns `{ ...g, elements: updateInElements(g.elements ?? []) }`.
- If `el.type === "repeater"`, it returns `{ ...r, template: { ...r.template, elements: updateInElements(r.template?.elements ?? []) } }`.

So repeater (and group) children are traversed and updated by id. Resize, move, and property edits that go through `updateElement` do reach repeater children.

---

## 5. Why resize / rotate / move appear to fail inside repeaters

**Resize and move (logic):**  
Drag and resize use **element-relative** coordinates (`el.x`, `el.y`, `el.width`, `el.height`) and **`getElementParentBounds(template.elements, id)`** for clamping. For a repeater child, parent bounds are the slot (`itemWidth` × `itemHeight`). So **in code**, resize and move should update the correct child in `repeater.template.elements`. The main issue is **interaction**: the user often clicks on the **2nd or 3rd** barcode (other slots). There is **no** overlay there, so they select the **repeater** (or nothing). Then:

- Resize/move apply to the **repeater** (width/height/x/y), not to the barcode → “resize changes slot size”, “barcode can’t be moved”.
- If they do manage to select the barcode (by clicking the first slot), resize/move should work; any remaining bug would be in coordinate conversion or stale state, not in “updates don’t reach children”.

**Rotation:**  
Rotation is applied via the inspector (`updateElement(id, { rotation })`). That path supports nested elements. If rotation “doesn’t work”, it may be that the inspector or the renderer doesn’t handle rotation for repeater children the same way as for top-level elements, or the user is again selecting the repeater instead of the barcode.

**Layer controls:**  
In **`LabelInspectorPanel.tsx`** (lines 95–137), the layer section is shown when `selected.type !== "group" && selected.type !== "repeater"`, so it **is** shown for repeater children (e.g. barcode). But:

- “To front” / “To back” use `allZ = template.elements.map(... zIndex ?? 0)` — i.e. **only top-level** elements. So the min/max zIndex used for “to back” / “to front” ignore repeater children. Repeater children get a zIndex relative to the wrong set.
- In **`labelLayoutEngine.ts`**, when expanding a repeater we use `const template = rep.template?.elements ?? []` and iterate in **array order**. There is **no** sort by zIndex inside `rep.template.elements`. So changing zIndex on a repeater child does **not** change draw order inside the repeater. So “layer controls do not work” for repeater children: the value updates but the visual order does not.

**Duplicate (Ctrl+D):**  
In **`useLabelSelection.ts`** (lines 183–206), on Ctrl+D we do `const el = template.elements.find((e) => e.id === selectedId)`. Only **top-level** elements are searched. So when a repeater child is selected, `el` is `undefined` and duplication is skipped. So “repeater children cannot be duplicated” is a direct consequence of this.

---

## 6. Position and bounding boxes

**Repeater children do have their own bounding box:**

- **LabelCanvas.tsx** (lines 132–166): for each `entry` in `overlayElementsOrdered`, it renders a div with:
  - `left = entry.displayX * PX_PER_MM`, `top = entry.displayY * PX_PER_MM`
  - `width/height` from **`getOverlaySizePx(el, PX_PER_MM)`**, which uses `el.width` and `el.height` (so the child’s own size).

So for a repeater child we get one div at `(rep.x + child.x, rep.y + child.y)` with size `(child.width, child.height)` — i.e. **one box at the first slot only**. The repeater itself gets one box at `(rep.x, rep.y)` with size `(rep.width, rep.height)` (RepeaterElement has width/height). So:

- Clicks on the **first** slot’s barcode can hit the child’s overlay (it’s drawn after the repeater, so on top).
- Clicks on the **second/third** slot hit the repeater’s large box or no overlay, so the user selects the repeater or clears selection. That explains “element selection behaves inconsistently” and the impression that “resize/rotate/move don’t work” (they’re applied to the repeater, not the barcode).

---

## 7. Renderer vs designer mismatch

- **Renderer (`labelLayoutEngine.ts` + `renderLabel.ts` + `svgRenderer.ts`):**  
  For each repeater, the layout engine iterates over dataset items and, per item, calls `flattenElements(rep.template.elements, itemData, ..., cx, cy, out)`. So it produces **one layout item per slot per child** (e.g. 3 items for a barcode in a 3-item repeater). Each item has correct `x_mm`, `y_mm`, `width_mm`, `height_mm` (and rotation) from the child element.

- **Designer:**  
  The overlay has **one entry per template child** (one per element in `rep.template.elements`), positioned at the **first slot** only. So we have **one interactive overlay** for the barcode vs **multiple** rendered barcodes.

So the mismatch is: **many visual instances (one per slot) vs one interactive instance (first slot)**. The designer never exposes overlay boxes for the 2nd, 3rd, … slots, so only the first slot is selectable. All other slots either select the repeater or do nothing.

---

## 8. Exact root cause (summary)

1. **One overlay box per repeater child (first slot only)**  
   So only the first repeated instance is clickable. Clicking any other instance selects the repeater or clears selection, so resize/rotate/move appear to “not work” or to “change the repeater” instead of the barcode.

2. **Layer controls use only top-level elements**  
   `allZ` in LabelInspectorPanel is from `template.elements` only, and the layout engine does not sort `rep.template.elements` by zIndex, so changing zIndex for a repeater child doesn’t change order and feels broken.

3. **Duplicate uses only top-level elements**  
   `template.elements.find(e => e.id === selectedId)` never finds a repeater child, so Ctrl+D does nothing for them.

4. **updateElement and IDs are correct**  
   Nested elements are updated by id; the problem is selection (single overlay per child) and feature logic (layer, duplicate) assuming a flat list.

---

## 9. Minimal architectural fix (do NOT implement yet)

1. **Selection / overlay**
   - **Option A:** For repeaters, create **one overlay per slot** for each template child (e.g. when preview shows 3 items, 3 overlay boxes for the barcode), each with the same `element.id`. On click, set `selectedId` to that id (and optionally store “slot index” if needed). Resize/move then apply to the single template element, so all slots update together. This fixes “can’t select barcode when clicking 2nd/3rd slot”.
   - **Option B:** Keep one overlay per child at the first slot only, but make the **repeater** overlay non-hit-testable (pointer-events: none) so clicks on other slots fall through to the canvas and you don’t accidentally select the repeater; then the user must use the first slot to select the child. This is a minimal change but doesn’t fix “click 2nd slot to select barcode”.

2. **Layer controls**
   - For “to front” / “to back”, when the selected element is a repeater (or group) child, compute `allZ` from the **sibling** list (e.g. `rep.template.elements` or `group.elements`), not from `template.elements`.
   - In **labelLayoutEngine**, when iterating `rep.template.elements`, **sort by zIndex** (e.g. `[...template].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))`) so that changing zIndex for a repeater child actually changes draw order inside the repeater.

3. **Duplicate**
   - When duplicating, if `template.elements.find(e => e.id === selectedId)` is null, resolve the element (and its parent) with a recursive `findElementById` plus a helper that returns the parent repeater/group and the array (e.g. `rep.template.elements`). Then insert a copy (new id) into that array and set selection to the new id.

4. **No change required**
   - `updateElement` already supports nested elements. Resize/move logic already uses element-relative coordinates and parent bounds; once selection is correct (user actually selects the child), they should work. Only add the above overlay/layer/duplicate fixes.
