# Fix: Product dimension mapping for 3D slot capacity

## Why dimensions were not used

The slot physical capacity hint ("Fizyczna poj.: X szt.") can be computed in two ways:

1. **3D dimension packing** — `calculateMaxCapacityByDimensions(slot, product)` using slot and product `width_cm`, `depth_cm`, `height_cm` (6 rotations). This gives the correct maximum number of items that physically fit (e.g. slot 50×60×70 cm, product 46×24×20 cm → **6**).
2. **Volume fallback** — `calculateMaxCapacityByVolume(slotVol, productVol)` when dimensions are missing. This can overestimate (same example → **9**) because it ignores how boxes fit in 3D.

The backend API returns product dimensions as:

- **length**
- **width**
- **height**

The frontend expected:

- **width_cm**, **depth_cm**, **height_cm** (and optionally **length_cm**).

Because the mapping only read `p.width_cm`, `p.depth_cm`, `p.height_cm`, and the API sends `length`, `width`, `height`, **productDims were always undefined**. The code in `useDesignerMagazynState` then always used the volume fallback, so the UI showed an incorrect (often inflated) capacity.

## How API fields were mapped

**File:** `frontend/src/pages/WarehouseDesigner.tsx`

**Places:** Product lists are built from API responses in:

- **loadLayout()** — when loading layout and products for the warehouse.
- **fetchProductsForMap()** — when refreshing products for the Magazyn map.

**Change:** A helper `productDimensionCm(p, ...keys)` was added. It:

- Accepts an API payload object and a list of property names to try in order.
- Returns the first value that is a valid positive number (or can be coerced from a string).
- Ensures we only set dimensions when the value is finite and > 0.

Mapping used in both places:

- **width_cm:** `productDimensionCm(p, "width_cm", "width")` — API may send `width` or `width_cm`.
- **depth_cm:** `productDimensionCm(p, "depth_cm", "length_cm", "length")` — depth in warehouse terms is length; API may send `length` or `length_cm`/`depth_cm`.
- **height_cm:** `productDimensionCm(p, "height_cm", "height")` — API may send `height` or `height_cm`.

So both naming conventions are supported, and string values from the API are coerced to numbers before being assigned to `WarehouseProduct.width_cm`, `depth_cm`, `height_cm`.

## How this enables correct 3D packing

- **WarehouseProduct** (`frontend/src/types/warehouse.ts`) already includes optional **width_cm**, **depth_cm**, **height_cm**.
- **useDesignerMagazynState** already:
  - Builds `productDims` from the first product in each bin.
  - Uses `calculateMaxCapacityByDimensions(slotDims, productDims)` when both slot and product have all three dimensions.
  - Falls back to `calculateMaxCapacityByVolume(slotVol, productVol)` only when dimensions are missing.

With the mapping fix, products loaded from the API now get dimensions from `length`/`width`/`height` (and their `_cm` variants). So `productDims` is populated when the API provides dimensions, and 3D packing is used. When a product has no dimensions, the system still uses the volume fallback.

## Verification

- **Test case:** Slot 50×60×70 cm, product 46×24×20 cm.  
  **Expected:** `calculateMaxCapacityByDimensions` → **6**.  
  **UI:** "Fizyczna poj.: 6 szt."
- **Fallback:** Products with no dimensions still use `calculateMaxCapacityByVolume`; no change in behavior for those.
