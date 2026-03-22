# Slot physical capacity hint (Magazyn view)

## Summary

Added a **physical slot capacity** hint in the Magazyn view: under the slot occupancy percentage, the UI now shows **"Fizyczna poj.: X szt."** — the maximum number of items that physically fit in the slot. The value is computed from slot and product dimensions (or volume fallback).

## Changes

### Volume fallback

- **`calculateMaxCapacityByVolume(slotVol, productVol)`** in `frontend/src/components/warehouse/warehouseUtils.ts`
- Returns `Math.floor(slotVol / productVol)` when both volumes are present; otherwise `0`.
- Used when product or slot dimensions are missing.

### Optional 3D bin packing

- **`calculateMaxCapacityByDimensions(slot, product)`** in `frontend/src/components/warehouse/warehouseUtils.ts`
- Accepts slot and product objects with optional `width_cm`, `depth_cm`, `height_cm`.
- Tries all 6 rotations of the product box and returns the maximum number of units that fit.
- Returns `0` if any required dimension is missing.

### UI hint

- In **`RackSideViewGrid.tsx`**, directly under the occupancy percentage text:
  - New line: **"Fizyczna poj.: {X} szt."**
  - Shown only when:
    - `showPhysicalCapacity` is true (Magazyn view), and
    - the slot has at least one assigned product (`quantity > 0`), and
    - a capacity value is available for that bin.
  - Styling: `fontSize={10}`, `fill="#6b7280"` (gray-500), minimal flat design.

### Magazyn-only visibility

- **`showPhysicalCapacity`** is passed from **WarehouseDesigner** as `mainView === "magazyn"`.
- The hint does not appear in the Layout designer; only in the Magazyn tab.

### Type and data

- **WarehouseProduct** (`frontend/src/types/warehouse.ts`) extended with optional **`width_cm`**, **`depth_cm`**, **`height_cm`** (may already exist in API responses).
- Product mapping in WarehouseDesigner (loadLayout and fetchProductsForMap) now copies these fields from the API when present (`length_cm` mapped to `depth_cm` where applicable).

### Capacity computation

- **`useDesignerMagazynState`** computes **`binMaxCapacityPieces`**: for each bin with at least one assigned product, the first such product is taken; capacity is computed with **`calculateMaxCapacityByDimensions`** when both slot and product have dimensions, otherwise with **`calculateMaxCapacityByVolume`**.
- **`binMaxCapacityPieces`** and **`showPhysicalCapacity`** are passed into **RackSideViewGrid** from **WarehouseDesigner**.

## Verification

- Empty slots: no hint shown.
- Slots with products: hint shows when in Magazyn view and capacity is computed (no NaN).
- Layout designer mode: unchanged; hint not shown.
- Performance: capacity is computed in existing `useMemo` blocks with minimal extra work.
