# Analysis: Incorrect Cylinder Capacity (Fallback to Volume)

**Example:** Product cylinder diameter 5 cm, height 22 cm; slot 50×60×70 cm.  
**Expected:** floor(50/5) × floor(60/5) × floor(70/22) = 10 × 12 × 3 = **360**.  
**Actual UI:** **1680** (volume-based fallback).

---

## SECTION 1 — Product dimensions mapping

**Source:** `frontend/src/utils/productNormalizer.ts` and product load in `WarehouseDesigner.tsx`.

**Convention:**

- **width_cm** ← API `width_cm` or `width`
- **depth_cm** ← API `depth_cm` or `length_cm` or `length`
- **height_cm** ← API `height_cm` or `height`

**Backend Product model** (`backend/models/product.py`): stores **length**, **width**, **height** (no separate diameter). So for a cylinder:

- **Diameter** is usually stored in one horizontal dimension: e.g. **width = 5** (diameter).
- **Height** = **height = 22**.
- **Length** may be left **0** or empty if the user only enters “diameter” and “height” in the UI, or set equal to diameter (5).

**Result for cylinder (diameter 5, height 22):**

- If user sets **width = 5**, **height = 22**, **length = 0** or unset:
  - **width_cm = 5**, **depth_cm = 0** (from length), **height_cm = 22**.
- If user sets **length = 5**, **width = 5**, **height = 22**:
  - **width_cm = 5**, **depth_cm = 5**, **height_cm = 22**.

So for cylinder, **depth_cm** can be **0** or missing when only diameter (width) and height are provided. There is no separate “diameter” field; diameter is taken from **width_cm** (and optionally length/depth when set).

---

## SECTION 2 — Cylinder capacity function

**In `warehouseUtils.ts`:** **calculateMaxCapacityCylinder(slotDims, productDims)** (lines 838–851):

- **diameter** = `productDims.width_cm ?? 0`
- **height** = `productDims.height_cm ?? 0`
- **Guard:** `if (!slotW || !slotD || !slotH || !diameter || !height) return 0`
- **Formula:** `floor(slotW/diameter) * floor(slotD/diameter) * floor(slotH/height)`

So the utility expects **width_cm** = diameter and **height_cm** = height; it does **not** use **depth_cm**. It does require all slot dimensions and both diameter and height.

**In `useDesignerMagazynState.ts`:** **capacityForProduct** does **not** call **calculateMaxCapacityCylinder**. It has its **own inline** cylinder logic (lines 56–64):

- **perW** = floor(slotWidth / dims.width_cm)
- **perD** = floor(slotDepth / dims.width_cm)  // diameter = width_cm
- **perH** = min(floor(slotH / dims.height_cm), maxCountZ)
- **return** perW * perD * perH

So cylinder capacity in the hook uses **dims.width_cm** as diameter for both width and depth, and **dims.height_cm** for height. That formula is correct. The problem is **before** this block.

---

## SECTION 3 — Caller logic

**capacityForProduct** (useDesignerMagazynState.ts, lines 35–68):

1. Builds **dims** from **product.width_cm**, **product.depth_cm**, **product.height_cm** (with effective height for compression).
2. **Guard (line 47):** `if (!dims.width_cm || !dims.depth_cm || !dims.height_cm) return 0;`
3. Then, if **shape === "cylinder"**, uses the inline cylinder formula with **dims.width_cm** and **dims.height_cm**.

So for cylinder, the code **does** use diameter (width_cm) and height (height_cm) correctly in the formula. But it **requires** **dims.depth_cm** to be truthy because of the **shared** guard. For a cylinder stored as width=5 (diameter), height=22, length=0, we get **dims.depth_cm = 0**, so **!dims.depth_cm** is **true** → **capacityForProduct** returns **0** and the cylinder block is never run.

**Conclusion:** Cylinder capacity **is** implemented (inline in the hook) and the formula is correct. The guard that requires **dims.depth_cm** is what prevents it from running when **depth_cm** is 0 or missing.

---

## SECTION 4 — Fallback to volume

**Where fallback happens:** In **binMaxCapacityPieces** and **binCapacityDetails** (useDesignerMagazynState.ts):

- **byDims = capacityForProduct(slotDims, firstProduct)** (or **capacityForProduct(slotDims, prod)**).
- **capacity = byDims > 0 ? byDims : calculateMaxCapacityByVolume(slotVol, productVol)**.

When **capacityForProduct** returns **0** (because of the guard), **byDims** is 0, so **capacity** is set to **calculateMaxCapacityByVolume(slotVol, productVol)**.

**Volume calculation:** slot 50×60×70 cm → 210 dm³. If product volume is stored as e.g. 0.125 dm³, then floor(210 / 0.125) = **1680**, which matches the UI. So the system is using the volume fallback whenever the dimension-based path returns 0.

**Why this branch is executed:** The dimension-based path returns 0 because **capacityForProduct** returns 0 when **dims.depth_cm** is falsy. For cylinders stored with only diameter (width) and height, **depth_cm** is often 0 or unset, so the guard fails and the cylinder formula is never used.

---

## SECTION 5 — Preview generation

**packingLayoutForProduct** (useDesignerMagazynState.ts, lines 71–117):

- Same **dims** and **same guard:** `if (!dims.width_cm || !dims.depth_cm || !dims.height_cm) return null`.
- For **shape === "cylinder"** it then computes **countX** = floor(sw/diameter), **countY** = floor(sd/diameter), **countZ** = min(floor(sh/height), maxCountZ), and returns a **PackingLayoutResult** with **boxW_cm/boxD_cm** = diameter, **boxH_cm** = height.

So preview uses the same **dims** and the same guard. When **depth_cm** is 0, the function returns **null** and no cylinder preview is shown; behaviour is consistent with capacity (dimension path not used, so no layout preview).

---

## SECTION 6 — Root cause

**Root cause:** The **shared guard** in **capacityForProduct** and **packingLayoutForProduct** requires **all three** of **dims.width_cm**, **dims.depth_cm**, and **dims.height_cm** to be truthy. For cylinders we only need **diameter** (one horizontal dimension) and **height**. In the current mapping:

- **diameter** → **width_cm**
- **height** → **height_cm**
- **depth_cm** comes from **length**; for “diameter + height only” products, **length** is often 0 or unset, so **depth_cm = 0**.

So **!dims.depth_cm** is true, the guard fails, **capacityForProduct** returns 0 (and **packingLayoutForProduct** returns null). The UI then uses **calculateMaxCapacityByVolume**, giving 1680 instead of 360.

**Fix (recommended):** For **shape === "cylinder"**, do **not** require **depth_cm**. Treat cylinder as needing only **width_cm** (diameter) and **height_cm**:

- **Before** the existing guard: if **shape === "cylinder"**, require only **dims.width_cm** and **dims.height_cm**; if either is missing or 0, return 0 / null. Then run the cylinder block (using **dims.width_cm** as diameter for both slot width and slot depth).
- **Otherwise** keep the existing guard (all three dims required) and the box path.

Alternatively, when building **dims** for cylinder, set **depth_cm = width_cm** when **depth_cm** is missing or 0, so the existing guard passes and the formula (which already uses width_cm for both perW and perD) stays correct. Either approach removes the incorrect dependency on **depth_cm** for cylinders.

---

**Summary:** Cylinder capacity logic and formula are correct and use diameter = width_cm and height = height_cm. The guard that requires **dims.depth_cm** causes an early return when depth_cm is 0 (e.g. cylinder with only diameter and height). The caller then falls back to volume capacity (1680). Relaxing the guard for cylinders (or defaulting depth_cm to width_cm for cylinder) so that only diameter and height are required fixes the issue. No changes were made in this analysis.
