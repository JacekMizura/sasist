# Report: Why calculateMaxCapacityByDimensions() Is Not Used

**Example:** Slot 50×60×70 cm, product 55×38×20 cm → correct capacity 3 (3D packing), UI shows 5 (volume: floor(210/41.8) ≈ 5).

**Goal:** Identify why the dimension-based branch is not executed. **No code changes** in this document.

---

## SECTION 1 — slotDims values

**Source (useDesignerMagazynState.ts, lines 168–169):**

```ts
const slotDims = { width_cm: bin.width_cm, depth_cm: bin.depth_cm, height_cm: bin.height_cm };
```

- **slotDims** are taken directly from the **bin**: `bin.width_cm`, `bin.depth_cm`, `bin.height_cm`.
- **Observed at runtime:** For bins loaded from the **layout API**, these three values are **undefined**.
- **Reason:** The backend **does not store or return** per-bin dimensions.

**Evidence:**

- **Backend model** `backend/models/warehouse.py` — **Bin** has: `label`, `level_index`, `segment_index`, `volume_dm3`, `current_load_dm3`, `storage_type`. **No** `width_cm`, `depth_cm`, `height_cm` columns.
- **Layout API** `backend/services/warehouse_layout_service.py` (lines 196–207) — **bins_out** for each bin includes only: `id`, `label`, `barcode_data`, `level_index`, `segment_index`, `volume_dm3`, `current_load_dm3`, `storage_type`. **No** `width_cm`, `depth_cm`, `height_cm`.
- **Frontend loadLayout** (`WarehouseDesigner.tsx`, lines 421–424) — Maps `b.width_cm`, `b.depth_cm`, `b.height_cm` from the API response only when present; since the API never sends them, they stay **undefined**.

**Conclusion:** For layouts loaded from the server, **slotDims** is always  
`{ width_cm: undefined, depth_cm: undefined, height_cm: undefined }`.

---

## SECTION 2 — productDims values

**Source (useDesignerMagazynState.ts, lines 170–174):**

```ts
const productDims = {
  width_cm: firstProduct.width_cm,
  depth_cm: firstProduct.depth_cm,
  height_cm: firstProduct.height_cm,
};
```

- **productDims** come from **WarehouseProduct** (`firstProduct`), which is populated when products are loaded (in **loadLayout** or **fetchProductsForMap**).
- After the earlier fix, the frontend maps product dimensions from both **`*_cm`** and **`length`/`width`/`height`** in the API response. The products API returns **`length`**, **`width`**, **`height`** (see **backend** `_product_to_dict` in product.py).
- So for products that have dimensions in the backend, **productDims** are expected to be **populated** (e.g. 55, 38, 20 for the example product).

**Conclusion:** **productDims** can be valid numbers when product dimensions exist in the API. The failing branch is **not** due to missing product dimensions in the typical case; it is due to **missing slot dimensions**.

---

## SECTION 3 — Condition evaluation

**Condition (useDesignerMagazynState.ts, lines 176–182):**

```ts
const byDims =
  slotDims.width_cm &&
  slotDims.depth_cm &&
  slotDims.height_cm &&
  productDims.width_cm &&
  productDims.depth_cm &&
  productDims.height_cm
    ? calculateMaxCapacityByDimensions(slotDims, productDims)
    : 0;
```

- All six values must be truthy for the dimension branch to run.
- **slotDims:** As above, for API-loaded layouts, `slotDims.width_cm`, `slotDims.depth_cm`, and `slotDims.height_cm` are **undefined**.
- In JavaScript, **undefined** is falsy, so:
  - **slotDims.width_cm && …** → **false** (short-circuit).
- Therefore the condition evaluates to **false**, and **byDims** is set to **0**.

**Conclusion:** The condition fails because **at least one of** `slotDims.width_cm`, `slotDims.depth_cm`, `slotDims.height_cm` is falsy (in practice all three are undefined). Product dimensions are irrelevant to this failure when slot dimensions are missing.

---

## SECTION 4 — Executed branch

**Code (useDesignerMagazynState.ts, line 185):**

```ts
const capacity = byDims > 0 ? byDims : calculateMaxCapacityByVolume(slotVol, productVol);
```

- **byDims** is **0** (see Section 3).
- So **byDims > 0** is **false**.
- Therefore the **else** branch runs: **capacity = calculateMaxCapacityByVolume(slotVol, productVol)**.

**Numerics for the example:**

- Slot volume: 50×60×70 / 1000 = **210 dm³**.
- Product volume: 55×38×20 / 1000 = **41.8 dm³**.
- **floor(210 / 41.8) = 5** → matches the UI “Fizyczna poj.: 5 szt.”

**Conclusion:** The **volume** branch is always executed when the layout (and thus bins) comes from the API, because **byDims** is always 0 due to missing **slotDims**.

---

## SECTION 5 — Root cause

**Root cause:** **Slot (bin) dimensions are never provided by the layout API and are not stored on the Bin model.**

- The backend **Bin** model has no `width_cm`, `depth_cm`, `height_cm`; it only has `volume_dm3` (and label, level_index, segment_index, etc.).
- The layout service builds the bin list for the response **without** any dimension fields for bins.
- The frontend correctly maps whatever the API sends; since the API does not send bin dimensions, **bin.width_cm**, **bin.depth_cm**, **bin.height_cm** remain **undefined** after load.
- **slotDims** is therefore all undefined → the dimension condition fails → **byDims = 0** → **calculateMaxCapacityByVolume** is used.

So the 3D packing function is not used because **slot dimensions are missing**, not because product dimensions are missing (after the previous product-mapping fix).

---

## SECTION 6 — Recommended fix

Two main approaches:

### Option A — Frontend: derive slot dimensions from the rack when bin dimensions are missing

- In **useDesignerMagazynState**, when building **slotDims**, if **bin.width_cm** / **bin.depth_cm** / **bin.height_cm** are missing, **derive** them from the **rack** and level layout.
- Rack has **length_cm**, **width_cm**, **height_cm**, **levels**, **bins_per_level**, and optionally **internal_structure** / **levelConfig**.
- Example derivation (simple uniform split):
  - **width_cm** = rack.width_cm / rack.bins_per_level (or from internal_structure per segment if available).
  - **depth_cm** = rack.length_cm (depth of one bin along the rack depth).
  - **height_cm** = rack.height_cm / rack.levels (or from internal_structure per level if available).
- If **internal_structure** / **levelConfig** exists, use it to get per-level heights and per-segment widths for more accuracy.
- Then **slotDims** are always set (either from bin or from rack), so the condition can pass and **calculateMaxCapacityByDimensions** is used when product dimensions are also present.

**Pros:** Works with current API and DB; no backend change.  
**Cons:** Derived dimensions may not match custom per-bin sizes if they are ever added later.

### Option B — Backend: persist and return bin dimensions

- Add **width_cm**, **depth_cm**, **height_cm** to the **Bin** model (nullable).
- When saving the layout, if the frontend sends per-bin dimensions, store them; otherwise leave null.
- In the layout service, include **width_cm**, **depth_cm**, **height_cm** in **bins_out** when present.
- Optionally, when they are null, **compute** them from the rack (and internal_structure) in the layout service and return the computed values so the frontend always receives dimensions.

**Pros:** Single source of truth; supports future per-bin custom sizes.  
**Cons:** Requires migration and layout save/load changes.

**Practical recommendation:** Implement **Option A** first so that 3D capacity works for existing layouts without backend changes. Option B can be added later if you need stored per-bin dimensions or custom slot sizes.

---

**Summary:** The UI shows volume-based capacity because **slotDims** are undefined (bins from the API have no dimensions). The condition that guards **calculateMaxCapacityByDimensions** therefore fails, and **calculateMaxCapacityByVolume** is always used. Fix by ensuring **slotDims** are set, preferably by deriving them from the rack when bin dimensions are missing (Option A).
