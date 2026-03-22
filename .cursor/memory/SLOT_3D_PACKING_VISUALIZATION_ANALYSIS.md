# Analysis: 3D Packing Visualization for Single-Product Slots

**Goal:** Show how the product is arranged inside the slot using the same rotation chosen by the packing algorithm. Visualization only when a slot contains **exactly one** product.

---

## STEP 1 — Extending calculateMaxCapacityByDimensions

### Current behavior

**File:** `frontend/src/components/warehouse/warehouseUtils.ts` (lines 768–795)

- **Signature:** `(slot, product) => number`
- **Logic:** Tries 6 rotations of the product box `(w, d, h)` and computes `qty = floor(sw/w) * floor(sd/d) * floor(sh/h)` for each. Returns the **maximum** `qty` only. It does **not** return:
  - which rotation achieved the max,
  - `countX`, `countY`, `countZ` (counts along slot width, depth, height).

Rotation order (product dimensions aligned to slot W, D, H):

```ts
const rotations: [number, number, number][] = [
  [pw, pd, ph],  // 0: product (W,D,H) → slot (W,D,H)
  [pw, ph, pd],  // 1
  [pd, pw, ph],  // 2
  [pd, ph, pw],  // 3
  [ph, pw, pd],  // 4
  [ph, pd, pw],  // 5
];
// For each [w, d, h]: countX = floor(sw/w), countY = floor(sd/d), countZ = floor(sh/h); qty = countX * countY * countZ
```

### How to extend

**Option A — New function (recommended):** Add a second export that returns the full layout, and keep the existing function for backward compatibility.

```ts
export interface PackingLayoutResult {
  /** Max number of items that fit */
  count: number;
  /** Index 0–5 into the 6 rotations (same order as current rotations array) */
  rotationIndex: number;
  /** Number of boxes along slot width */
  countX: number;
  /** Number of boxes along slot depth */
  countY: number;
  /** Number of boxes along slot height */
  countZ: number;
  /** Product box size in chosen rotation: (width, depth, height) in slot axes (cm) */
  boxW_cm: number;
  boxD_cm: number;
  boxH_cm: number;
}

/** Like calculateMaxCapacityByDimensions but returns layout for visualization. Returns null if dimensions missing or count 0. */
export function calculatePackingLayout(
  slot: { width_cm?: number; depth_cm?: number; height_cm?: number },
  product: { width_cm?: number; depth_cm?: number; height_cm?: number }
): PackingLayoutResult | null {
  // Same validation as current function; same rotations loop.
  // Track not only maxQty but: bestRotationIndex, bestCountX, bestCountY, bestCountZ, bestW, bestD, bestH.
  // Return { count: maxQty, rotationIndex, countX, countY, countZ, boxW_cm: bestW, boxD_cm: bestD, boxH_cm: bestH }.
}
```

- **Backward compatibility:** Existing callers keep using `calculateMaxCapacityByDimensions(slot, product)` (returns `result.count` or you can implement it as `calculatePackingLayout(...)?.count ?? 0`).
- **Data for visualization:** `rotationIndex`, `countX`, `countY`, `countZ`, `boxW_cm`, `boxD_cm`, `boxH_cm` (and slot dimensions) are enough to draw a simple grid of boxes in the chosen orientation.

**Option B — Overload return type:** Change `calculateMaxCapacityByDimensions` to return `number | PackingLayoutResult` and have callers that need only the number read `.count`. This is a breaking change for TypeScript call sites and requires updating all callers.

**Recommendation:** Add **calculatePackingLayout** returning **PackingLayoutResult | null**; keep **calculateMaxCapacityByDimensions** as-is (or implement it as a one-liner that calls **calculatePackingLayout** and returns `result?.count ?? 0`). No breaking changes; new UI uses **calculatePackingLayout** where layout is needed.

---

## STEP 2 — Where to store packing result: binPackingPreview

**Location:** **useDesignerMagazynState.ts**

- Add a new memoized value, e.g. **binPackingPreview**, computed only for bins that have **exactly one** product and for which dimension-based packing applies.

**Shape:**

```ts
// Key: `${level_index}-${segment_index}` (same as binCapacityDetails).
// Value: only set when bin has exactly one product and calculatePackingLayout returns non-null.
binPackingPreview: Record<string, PackingLayoutResult>
```

**Computation:**

- Iterate over bins of the selected rack.
- For each bin, get assigned products (same logic as **binCapacityDetails**). If `assigned.length !== 1`, skip.
- For the single product, derive **slotDims** (same as in **binMaxCapacityPieces** / **binCapacityDetails**). If product has no dimensions, skip (no 3D layout).
- Call **calculatePackingLayout(slotDims, productDims)**. If result is null or `count === 0`, skip.
- Set **binPackingPreview[key] = result**.

**Dependencies:** `selectedRackForMagazyn`, `products` (and optionally reuse slotDims derivation from **binCapacityDetails** to avoid duplication). No need to depend on **binItemCounts** if you derive “assigned” again; alternatively derive from **binCapacityDetails** (if length === 1 and capacity came from dimensions, then compute layout for that one product).

**Return:** Add **binPackingPreview** to the hook’s return object. **WarehouseDesigner** passes it into **RackSideViewGrid** as a new prop.

---

## STEP 3 — Where slot UI and tooltip live in RackSideViewGrid

**Slot UI:** Each slot is a single **`<g>`** (lines 341–399) that contains:

- A **`<rect>`** for the slot background (x, y, w, h).
- Several **`<text>`** lines (Różnych produktów, Łącznie, dm³, then bar, then percentage).
- When **showPhysicalCapacity** and capacity data exist: an inner **`<g>`** with **`<title>`** (tooltip text) and the **"Fizyczna poj.: X szt."** text.

**Hover tooltip today:** The capacity line is wrapped in `<g>` with a **`<title>`** child. Browser shows a native tooltip on hover with the capacity-details text (from **binCapacityDetails**). There is no custom hover state or portal yet.

**Where to add the visualization:**

- **Option A — Inside the same `<g>` as the capacity line:** When **binPackingPreview[key]** exists (and slot has exactly one product), add a **second** layer of content that is shown on hover:
  - Either a **custom tooltip** (e.g. state `hoveredBinKey`) that renders a **floating div** (or portal) near the slot with the 3D preview inside it.
  - Or an **SVG group** that becomes visible on hover (e.g. `visibility: hidden` by default, `visibility: visible` when `hoveredBinKey === key`), positioned so it doesn’t overlap the slot text (e.g. to the side or in a corner of the slot, or in a small overlay above the slot).
- **Option B — Reuse/expand the `<title>` tooltip:** Native `<title>` cannot render HTML or SVG. So the **visualization cannot go inside `<title>`**. You need a custom hover UI (state + positioned element) to show the 3D preview.
- **Option C — Separate hover layer:** Use **onMouseEnter** / **onMouseLeave** on the capacity **`<g>`** (or the whole slot **`<g>`**) to set **hoveredBinKey**. When **hoveredBinKey === `${lev}-${bin}`** and **binPackingPreview[key]** exists, render the visualization in:
  - A **fixed or absolute div** (e.g. a small card next to the cursor or anchored to the slot), or
  - An **SVG `<g>`** inserted in the same SVG (e.g. a small “preview” area inside or next to the bin rect).

**Recommendation:** Use **custom hover state** (**hoveredBinKey**) on the slot or on the capacity group. When hovered and **binPackingPreview[key]** is set, render a **small overlay** (e.g. a div with position fixed/absolute, or an SVG group) that contains the packing visualization. That overlay can sit **next to the slot** (e.g. to the right of the rack, or above the slot) to avoid covering the slot text.

---

## STEP 4 — Rendering options (lightest first)

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **SVG grid** | Draw a 2D projection (e.g. front view: X×Z grid of rectangles, or top view: X×Y). Each box is a `<rect>`. Use **countX**, **countY**, **countZ** and **boxW_cm**, **boxD_cm**, **boxH_cm** (scaled to a small viewBox). | No extra deps; small bundle; fits inside existing SVG or a small inline SVG in a div. Easy to implement. | Only 2D (one face); no real 3D. |
| **CSS pseudo-3D** | One div per box, with `transform: translate3d(...)` and maybe `rotateX`/`rotateY` to suggest depth. Grid of divs in a container. | No WebGL; still lightweight. | More CSS and layout; isometric or perspective is limited; many divs if count is high. |
| **Three.js (or similar)** | Small 3D scene: slot as a box, product boxes as meshes inside it. | True 3D; can rotate view. | Heavy dependency; larger bundle; overkill for “simple” preview. |

**Recommendation:** Use an **SVG grid** (lightest and sufficient for “how the product is arranged”):

- **View:** e.g. **front face** (slot width × slot height): place **countX * countZ** rectangles (one per “row” along depth). Each rectangle has width/height proportional to **boxW_cm** and **boxH_cm**, scaled to a fixed preview size (e.g. 80×60 viewBox).
- **Data:** **slotDims**, **productDims**, **chosenRotation** (rotationIndex), **countX**, **countY**, **countZ**, and **boxW_cm**, **boxD_cm**, **boxH_cm** from **PackingLayoutResult**. Slot size for scaling can come from **slotDims** or from the same source as in the hook.
- **Placement:** Render this SVG inside the hover overlay (the same div/portal that you use for the custom tooltip when **binPackingPreview[key]** exists). No need to embed it inside the rack SVG if the overlay is a div; a small inline SVG in the overlay is simpler.

---

## STEP 5 — Data needed for visualization

| Data | Source | Purpose |
|------|--------|--------|
| **slotDims** | Already derived in hook (bin + rack). Can be passed per bin in **binPackingPreview** or recomputed in the grid from rack + bin. | Slot size for scaling the preview and for “slot outline” in the drawing. |
| **productDims** | **WarehouseProduct** (width_cm, depth_cm, height_cm). Already available in the hook. | Original product size; optional if we only use **PackingLayoutResult**. |
| **chosenRotation** | **PackingLayoutResult.rotationIndex** (0–5). | Which of the 6 orientations was chosen (for labeling; drawing uses box*_cm). |
| **countX, countY, countZ** | **PackingLayoutResult**. | Grid counts along slot W, D, H. |
| **boxW_cm, boxD_cm, boxH_cm** | **PackingLayoutResult** (product size in chosen rotation). | Size of one box in slot axes; used to draw and scale each cell in the SVG grid. |

**Minimal payload for the grid:** **PackingLayoutResult** plus **slotDims** (or slot W, D, H in cm) is enough. The grid does not need **productDims** or **WarehouseProduct** if the overlay only shows the box grid; for a caption like “Product X (55×38×20 cm)”, the hook can pass product name/sku and optional dimensions in a small extension of the preview payload.

**Suggested binPackingPreview value type:**

```ts
{
  layout: PackingLayoutResult;   // count, rotationIndex, countX, countY, countZ, boxW_cm, boxD_cm, boxH_cm
  slotDims: { width_cm: number; depth_cm: number; height_cm: number };
  productName?: string;          // optional for caption
}
```

---

## OUTPUT SUMMARY

### 1. How to extend calculateMaxCapacityByDimensions to return packing layout

- Add a **new** function **calculatePackingLayout(slot, product)** in **warehouseUtils.ts** that:
  - Uses the same 6 rotations and the same formula `qty = floor(sw/w)*floor(sd/d)*floor(sh/h)`.
  - Tracks which rotation gives the max and the corresponding **countX**, **countY**, **countZ** and **(w, d, h)**.
  - Returns **PackingLayoutResult | null** with **count**, **rotationIndex**, **countX**, **countY**, **countZ**, **boxW_cm**, **boxD_cm**, **boxH_cm**.
- Keep **calculateMaxCapacityByDimensions** returning only a number (or implement it as `calculatePackingLayout(...)?.count ?? 0`). No breaking change.

### 2. Where to store packing preview data

- In **useDesignerMagazynState**: add **binPackingPreview: Record<string, PackingLayoutResult (or extended type with slotDims/productName)>**.
- Compute it only for bins where **exactly one** product is assigned and **calculatePackingLayout** returns non-null.
- Return **binPackingPreview** from the hook; **WarehouseDesigner** passes it into **RackSideViewGrid**.

### 3. Where to render the visualization in RackSideViewGrid

- **Slot UI:** The slot is the **`<g>`** that contains the rect, text lines, and the capacity **`<g>`** with **"Fizyczna poj.: X szt."** and **`<title>`**.
- **Placement:** Add **onMouseEnter** / **onMouseLeave** on that capacity **`<g>`** (or the whole slot **`<g>`**) to set local state **hoveredBinKey**. When **hoveredBinKey === `${lev}-${bin}`** and **binPackingPreview[key]** is defined, render a **custom overlay** (e.g. a **position: fixed** or **absolute** div, or a portal) that contains the packing visualization (e.g. an SVG grid). The overlay can be anchored near the slot or near the cursor. Do **not** put the 3D preview inside **`<title>`** (browsers only show plain text there).

### 4. Which rendering method is best for performance

- **SVG grid** is the lightest: no new dependencies, minimal DOM (one `<svg>` with a few `<rect>`s), and fits the “same rotation as the algorithm” requirement by drawing **countX × countZ** (or countX × countY) rectangles with sizes derived from **boxW_cm**, **boxH_cm** (or **boxD_cm**). Recommended.
- **CSS pseudo-3D** is possible but heavier (many divs, more layout) and still not true 3D.
- **Three.js** is unnecessary for this use case and would increase bundle size and complexity; avoid for a “simple” preview.

---

**Conclusion:** Extend the packing logic with **calculatePackingLayout** returning layout + counts + box size in chosen rotation; store it in **binPackingPreview** in the hook for single-product bins; show an **SVG grid** in a **hover-only overlay** in **RackSideViewGrid** using that data. No code changes were made in this analysis.
