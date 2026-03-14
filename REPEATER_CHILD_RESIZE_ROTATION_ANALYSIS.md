# Repeater child resize/rotation bug – analysis

**Problem:** When a barcode (or any element) is inside a Repeater, resizing appears to change the repeater slot size instead of the barcode, and rotation does not behave correctly. Elements inside a repeater seem to have their size “forced” by the repeater.

**Conclusion:** The **layout engine does not override** child width/height. The bug is in the **designer**: only **top-level** elements are selectable and resizable, so the user is actually selecting and resizing the **repeater**, not the inner barcode.

---

## 1. Current repeater layout logic

**File:** `frontend/src/utils/labelLayoutEngine.ts`, `flattenElements()` (approx. lines 334–386).

- Repeater reads `record[rep.dataset]`, optionally filters/sorts, then iterates over `rep.template.elements` once per item.
- Slot origin for index `i`:
  - **Horizontal:** `cx = baseX + i * itemW`, `cy = baseY` (with `baseX = x0_mm + rep.x`, `baseY = x0_mm + rep.y`, `itemW = rep.itemWidth ?? 20`, `itemH = rep.itemHeight ?? rep.itemWidth ?? 20`).
  - **Vertical:** `cx = baseX`, `cy = baseY + i * itemH`.
  - **Grid:** `cx = baseX + col * itemW`, `cy = baseY + row * itemH` with `row = i // columns`, `col = i % columns`.
- For each slot it calls:
  - `flattenElements(template, itemData, labelWidthMm, labelHeightMm, cx, cy, out)`.

So the repeater only supplies a **new origin** `(cx, cy)` per slot. It does **not** pass or impose a slot size on children.

Each child is then processed by the same `flattenElements` loop: when it is not a group/repeater, it goes through **elementToLayoutItem(el, x0_mm, y0_mm, record)** with `x0_mm = cx`, `y0_mm = cy`. So:

- **Position:** `x_mm = cx + el.x`, `y_mm = cy + el.y` (slot origin + element offset). Correct.
- **Size:** `width_mm = Math.max(0.5, el.width)`, `height_mm = Math.max(0.5, el.height)` (from the element). **Child width/height are never set from `rep.itemWidth` or `rep.itemHeight`.**

So in the layout engine, repeater controls **only position**; **size** comes from the child element.

---

## 2. Whether child element width/height are overridden

**They are not overridden in the layout engine.**

- There is no code of the form `child.width = rep.itemWidth` or `child.height = rep.itemHeight`.
- `itemW` / `itemH` are used only to compute **slot origins** (`cx`, `cy`). They are not written onto child elements or layout items.
- **elementToLayoutItem** (lines 140–166, 377) uses `el.width` and `el.height` for every element, including those inside a repeater.

So the **computed layout** uses each child’s own width/height; the repeater does not replace them with the slot size.

---

## 3. Code snippet showing the relevant (correct) logic

Repeater branch in `flattenElements()`:

```ts
// labelLayoutEngine.ts, repeater block
const template = rep.template?.elements ?? [];
const itemW = rep.itemWidth ?? 20;
const itemH = rep.itemHeight ?? rep.itemWidth ?? 20;
const baseX = x0_mm + rep.x;
const baseY = y0_mm + rep.y;
// ...
for (let i = 0; i < items.length; i++) {
  // cx, cy = slot origin only
  cx = baseX + (dir ? 0 : i * itemW);
  cy = baseY + (dir ? i * itemH : 0);
  flattenElements(template, itemData, labelWidthMm, labelHeightMm, cx, cy, out);
}
```

Later, for a child element (e.g. barcode), the only call that builds its layout item is:

```ts
const item = elementToLayoutItem(el as LabelElement, x0_mm, y0_mm, record);
// with x0_mm = cx, y0_mm = cy
// elementToLayoutItem uses:
//   x_mm = x0_mm + el.x,  y_mm = y0_mm + el.y
//   width_mm = Math.max(0.5, el.width),  height_mm = Math.max(0.5, el.height)
```

So the “problematic” behaviour is not here: the engine does **not** overwrite child size with slot size.

---

## 4. Why resizing and rotation “break” inside the repeater

The behaviour comes from the **designer**, not from the layout engine.

**Selection and overlay are top-level only**

- **useLabelSelection** builds `overlayElementsOrdered` from **template.elements** only (no recursion into repeater or group).
- So the overlay divs (and thus selection and resize handles) exist only for **top-level** elements: the repeater, groups, and any root-level barcodes/text. They do **not** exist for **repeater.template.elements** (e.g. the barcode inside the repeater).

**What the user actually selects**

- When the user clicks on the repeated barcode in the canvas, the visible content is the **label SVG** (from the layout engine). The SVG is `pointer-events-none`, so the click hits whatever is behind it.
- Behind it, the only overlay boxes are for **template.elements**. So the only box under the repeated content is the **repeater** (one box for the whole repeater, using repeater’s `x`, `y`, `width`, `height` from `getOverlaySizePx`).
- So the user is **selecting the repeater**, not the inner barcode.

**Resize**

- Resize uses **updateElement(id, patch)** with the selected element’s id.
- **updateElement** in `LabelTemplateDesigner.tsx` (lines 200–217) does:
  - `template.elements.map((el) => { if (el.id !== id) return el; ... return clamped; })`.
- It only iterates **top-level** elements. So the only element that can receive the patch is the **repeater**. The inner barcode’s id never matches any top-level `el.id`, so the barcode is never updated.
- Result: “Resizing” updates **repeater.width** and **repeater.height** (the repeater’s box in the designer). The user perceives this as “the slot size changed” because the repeater’s overlay is what they dragged. The barcode’s own width/height are unchanged.

**Rotation**

- Rotation is applied the same way: only the selected (top-level) element is patched. So when the user thinks they’re rotating the barcode, they’re rotating the **repeater** (if the repeater even has a rotation in the UI). Repeater rotation is not used in the layout engine for positioning or for child layout, so rotation does not propagate to the repeated content in the way the user expects.

So:

- **Layout engine:** Repeater sets only **(cx, cy)**; child size and rotation come from **el.width**, **el.height**, **el.rotation**. No overwriting.
- **Designer:** Only the repeater is selectable/resizable/rotatable when the user clicks on repeated content, so resize/rotation apply to the repeater, not to the child. That is why it looks like “the repeater forces size” and “rotation doesn’t work” for the barcode.

---

## 5. Rotation and transforms vs repeater

- **Layout:** Each layout item is built with `elementToLayoutItem` and keeps `el.rotation` and `el.width` / `el.height`. **wrapElement** in `svgRenderer.ts` uses `item.x_mm`, `item.y_mm`, `item.width_mm`, `item.height_mm`, and `item.rotation` to build a transform (translate + rotate around element center). So rotation and size are per element, not per repeater slot.
- **renderBarcode** uses `item.width_mm` and `item.height_mm` only. No slot or repeater size is used there.
- So once the **correct** element (the barcode) is in the layout with the right size/rotation, rendering is correct. The bug is that in the designer the user cannot select that element; they select the repeater instead.

---

## 6. Minimal architectural fix (do not implement yet)

1. **Designer: support selecting and editing elements inside a repeater**
   - Either:
     - **A)** Flatten the structure used for overlay/selection so that repeater **template** elements (and optionally group elements) appear in the list of “selectable” elements, with their **layout** position/size (e.g. first slot or a single “template” representative), and when the user selects one, **updateElement** is able to patch that element by id; or
     - **B)** Keep overlay for the repeater only, but when the user selects the repeater, allow a “sub-selection” or “edit template” mode that then shows overlays for **rep.template.elements** (e.g. in the first slot) and allows resize/rotation for those, with **updateElement** (or a variant) that can patch an element by id **inside** a repeater’s template.
   - In both cases, **updateElement** (or a dedicated updater) must **recurse** into `repeater.template.elements` (and groups) and apply the patch to the element whose `id` matches, instead of only iterating `template.elements`.

2. **Resize/rotation**
   - Resize (e.g. **useLabelResize**) must work with the **same** structure: when the selected element is a repeater-inner element, it must find that element (e.g. by id in a recursive walk), read its current x, y, width, height, and apply the new width/height (and x/y if resizing from corners that move the origin) to **that** element via the recursive update. Same idea for rotation.

3. **No change required in layout engine**
   - **flattenElements** and **elementToLayoutItem** already use child `el.width`, `el.height`, and `el.rotation` and do not override them with repeater slot size. So no change is needed there; the fix is entirely in the designer’s selection and update logic so that the user is actually resizing/rotating the inner barcode (or other repeater child), not the repeater.

4. **Optional: repeater box vs slot**
   - Clarify in the UI whether the repeater’s overlay represents “repeater container” or “one slot.” That does not fix the bug but can reduce confusion. The minimal fix is still: allow selecting and updating repeater-inner elements so that their width, height, and rotation are what get changed.
