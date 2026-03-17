# Product dimension normalization

## Summary

A single normalization layer was added so product dimensions are handled consistently across the frontend. API responses can use different field names (`length`, `width`, `height`, or `length_cm`, `width_cm`, `height_cm`, `depth_cm`). The frontend now normalizes these to **width_cm**, **depth_cm**, **height_cm** in one place and uses only those fields everywhere else (slot capacity, bin packing, etc.).

## Changes

### 1. Normalization utility

**File:** `frontend/src/utils/productNormalizer.ts`

- **`normalizeProductDims(p)`** — accepts any product-like object (API response or record).
- Returns `{ width_cm, depth_cm, height_cm }` as numbers, using this mapping:
  - **width_cm:** `p.width_cm ?? p.width ?? 0`
  - **depth_cm:** `p.depth_cm ?? p.length_cm ?? p.length ?? 0` (depth = length in warehouse convention)
  - **height_cm:** `p.height_cm ?? p.height ?? 0`
- Values are coerced to number (strings from JSON become numbers); invalid or missing values become `0`.
- Null/undefined input returns `{ width_cm: 0, depth_cm: 0, height_cm: 0 }`.

### 2. WarehouseProduct creation from API

**File:** `frontend/src/pages/WarehouseDesigner.tsx`

- **loadLayout()** — when building the products list from the products API, dimension mapping was replaced with:
  - `const dims = normalizeProductDims(p);`
  - Product object now sets: `width_cm: dims.width_cm || undefined`, `depth_cm: dims.depth_cm || undefined`, `height_cm: dims.height_cm || undefined` (so `0` is stored as `undefined` for optional fields).
- **fetchProductsForMap()** — same change: use `normalizeProductDims(p)` and assign the three fields (with `|| undefined` so missing dimensions stay undefined on `WarehouseProduct`).

The previous helper `productDimensionCm` was removed; normalization is the single source of truth.

### 3. Frontend logic uses only width_cm, depth_cm, height_cm

- **WarehouseProduct** (`frontend/src/types/warehouse.ts`) — already defines optional **width_cm**, **depth_cm**, **height_cm**. No other dimension property names are used on products.
- **useDesignerMagazynState** — builds `productDims` from `firstProduct.width_cm`, `firstProduct.depth_cm`, `firstProduct.height_cm` and passes them to `calculateMaxCapacityByDimensions`. No change needed; it already uses the standardized fields.
- **warehouseUtils** — `calculateMaxCapacityByDimensions(slot, product)` and `calculateMaxCapacityByVolume(slotVol, productVol)` — slot and product dimensions are always passed as objects with **width_cm**, **depth_cm**, **height_cm**. No other dimension names are used in bin packing or capacity logic.

### 4. Slot capacity behavior

- When a product has dimensions (width_cm, depth_cm, height_cm all set and > 0), **calculateMaxCapacityByDimensions** is used and the UI shows the 3D packing result (e.g. slot 50×60×70 cm, product 46×24×20 cm → 6 szt.).
- When dimensions are missing or zero, the code falls back to **calculateMaxCapacityByVolume**. So slot capacity now uses dimension-based packing whenever the API provides dimensions and they are correctly normalized into `WarehouseProduct`.

## Verification

- All product creation from API (loadLayout, fetchProductsForMap) goes through **normalizeProductDims**.
- Only **width_cm**, **depth_cm**, **height_cm** are used for product dimensions in capacity and bin-packing logic.
- No remaining use of `length`, `width`, `height`, `length_cm`, or `depth_cm` as alternate product dimension sources outside the normalizer.
