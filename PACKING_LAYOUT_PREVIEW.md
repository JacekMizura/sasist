# Packing layout preview (single-product slots)

## Summary

When a slot contains **exactly one product** and both slot and product have dimensions, hovering over the "Fizyczna poj." label shows a **packing visualization**: the same rotation chosen by the 3D packing algorithm is used to draw a small preview (countX × countZ) so users can see how the product fits in the slot.

## Changes

### 1. Packing layout calculation

**File:** `frontend/src/components/warehouse/warehouseUtils.ts`

- **`calculatePackingLayout(slot, product)`** — same 6 rotations as capacity logic; returns the best layout as:
  - **count** — total pieces that fit
  - **rotationIndex** — which rotation (0–5)
  - **countX**, **countY**, **countZ** — pieces along slot width, depth, height
  - **boxW_cm**, **boxD_cm**, **boxH_cm** — product box dimensions in that rotation  
  Returns `null` if any slot or product dimension is missing.

- **`PackingLayoutResult`** — exported interface for the above shape.

- **`calculateMaxCapacityByDimensions`** — now implemented as:  
  `const layout = calculatePackingLayout(slot, product); return layout ? layout.count : 0;`  
  So capacity and layout use the same rotation logic.

### 2. Preview data in hook

**File:** `frontend/src/pages/WarehouseDesigner/useDesignerMagazynState.ts`

- **binPackingPreview** — `useMemo` that:
  - For each bin, collects assigned products (same logic as binItemCounts / binCapacityDetails).
  - Keeps only bins with **exactly one** assigned product.
  - Derives slotDims (from bin or rack) and productDims.
  - Calls **`calculatePackingLayout(slotDims, productDims)`**.
  - If result exists, stores:  
    `binPackingPreview[key] = { ...layout, productName: product.name, slotDims }`.

- **binPackingPreview** is included in the hook return value.

### 3. Pass preview to grid

**File:** `WarehouseDesigner.tsx`

- **binPackingPreview** is taken from `useDesignerMagazynState` and passed to **RackSideViewGrid** as **binPackingPreview={binPackingPreview}**.

### 4. Grid props and type

**File:** `frontend/src/components/warehouse/RackSideViewGrid.tsx`

- New prop:  
  **binPackingPreview?: Record<string, PackingLayoutResult & { productName: string; slotDims: { width_cm?: number; depth_cm?: number; height_cm?: number } }>**
- **PackingLayoutResult** is imported from `./warehouseUtils`.

### 5. Hover and overlay

- **hoveredBinKey** — `useState<string | null>(null)`.
- The capacity **`<g>`** (the one that contains the "Fizyczna poj." text and tooltip) has:
  - **onMouseEnter={() => setHoveredBinKey(`${lev}-${bin}`)}**
  - **onMouseLeave={() => setHoveredBinKey(null)}**

- When **hoveredBinKey === key** and **binPackingPreview[key]** exists, a **foreignObject** is rendered above the bin with:
  - **Product: {productName}**
  - An **SVG** (120×80) that draws **countX × countZ** rectangles (12px spacing, 10×10 cells, fill #60a5fa, stroke #1e3a8a), i.e. the front-face stacking from the chosen rotation.

- Overlay styling: white background, 1px solid #ddd, padding 6px, font-size 11px, light box-shadow; minimal flat design.

### 6. When the preview is shown

The overlay appears only when:

- The slot has **exactly one** product (binPackingPreview is only built for those).
- That product has dimensions (so **calculatePackingLayout** returns a result).
- The user is **hovering** over the "Fizyczna poj." group (hoveredBinKey is set).

Slots with zero or multiple products never get a binPackingPreview entry, so no overlay. Volume-only capacity (no dimensions) does not get a layout, so no preview.

## Verification

- Single-product slot with dimensions: hover "Fizyczna poj." → packing preview overlay with product name and countX × countZ boxes.
- Multi-product or no-product slot: no preview.
- Missing product dimensions: no preview (layout is null).
