# Fix: Slot dimension derivation from rack

## Problem

The slot physical capacity hint uses 3D packing when both slot and product have dimensions. The condition:

```ts
slotDims.width_cm && slotDims.depth_cm && slotDims.height_cm && productDims...
```

was always false for the slot side because **bin dimensions** (`width_cm`, `depth_cm`, `height_cm`) are not returned by the layout API for bins. So `slotDims` were always `{ width_cm: undefined, depth_cm: undefined, height_cm: undefined }`, and the system always fell back to **volume-based** capacity (`calculateMaxCapacityByVolume`), which can overestimate (e.g. slot 50×60×70 cm, product 55×38×20 cm → 5 instead of the correct 3).

## Solution

**Derive slot dimensions from the rack** when bin dimensions are missing.

**File:** `frontend/src/pages/WarehouseDesigner/useDesignerMagazynState.ts`

### Where slotDims were built

- Inside the `binMaxCapacityPieces` `useMemo`, for each bin with at least one product, `slotDims` were set as:
  - `{ width_cm: bin.width_cm, depth_cm: bin.depth_cm, height_cm: bin.height_cm }`
- When the layout API does not provide bin dimensions, these are all `undefined`.

### Fallback calculation

Before building `slotDims`, we now compute:

- **slotWidth:** `bin.width_cm ?? (rack.width_cm && rack.bins_per_level ? rack.width_cm / rack.bins_per_level : undefined)`
- **slotDepth:** `bin.depth_cm ?? rack.depth_cm ?? rack.length_cm` (rack uses `length_cm` for depth when `depth_cm` is absent)
- **slotHeight:** `bin.height_cm ?? (rack.height_cm && rack.levels ? rack.height_cm / rack.levels : undefined)`

Rack fields are read with safe checks (`!= null`, `> 0`) and `levels` / `bins_per_level` are guarded with `Math.max(1, ...)` so we never divide by zero.

### slotDims construction

- `slotDims` is now:
  - `{ width_cm: slotWidth, depth_cm: slotDepth, height_cm: slotHeight }`
- So when the rack has `width_cm`, `length_cm` (or `depth_cm`), `height_cm`, `levels`, and `bins_per_level`, we get real slot dimensions even when the API omits them on bins.

### Existing logic unchanged

- **Packing:** `calculateMaxCapacityByDimensions(slotDims, productDims)` is still used only when all six values (slot and product) are present and truthy; no changes to the algorithm.
- **Volume fallback:** When slot dimensions still cannot be determined (or product dimensions are missing), `byDims` remains 0 and we continue to use `calculateMaxCapacityByVolume(slotVol, productVol)`.

## Verification

- **Test case:** Slot (derived) 50×60×70 cm, product 55×38×20 cm → expected capacity **3**.
- **UI:** Shows "Fizyczna poj.: 3 szt." when both slot (from rack derivation) and product dimensions are available.
- **Fallback:** If the rack has no dimensions or slot dimensions cannot be derived, capacity still uses volume only.
