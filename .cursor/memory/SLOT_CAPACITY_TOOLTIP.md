# Slot capacity tooltip (per-product physical capacity)

## Summary

A tooltip was added on the "Fizyczna poj.: X szt." label so that when a slot contains multiple products, hovering shows **capacity per product**: product name, max pieces that fit, and quantity in slot.

## Changes

### 1. Product list per bin and capacity per product

**File:** `frontend/src/pages/WarehouseDesigner/useDesignerMagazynState.ts`

- **binCapacityDetails** — new structure:
  - Type: `Record<string, { product: WarehouseProduct; quantity: number; capacity: number }[]>`  
  - Key: `${level_index}-${segment_index}` (same as binItemCounts).
  - Value: array of entries for each product assigned to that bin.

For each bin:

1. **Collect assigned products** — same logic as `binItemCounts` / `binUniqueProductCounts`: match by `bin.locationUUID` + `product.assignedLocations` or by `product.location_id === bin.label/location_id`. For each matching product, store **product** and **quantity** (from `assignedLocations[].quantity` or `product.quantity`).
2. **Slot dimensions** — derived once per bin (from bin or rack: width_cm, depth_cm, height_cm), same as in `binMaxCapacityPieces`.
3. **Capacity per product** — for each product in the bin:
   - Prefer **calculateMaxCapacityByDimensions(slotDims, productDims)** when both slot and product have dimensions.
   - Otherwise **calculateMaxCapacityByVolume(slotVol, productVol)**.
   - Push `{ product, quantity, capacity }` into the bin’s array.

Only bins with at least one product get an entry; only products with finite capacity are pushed.

### 2. Hook return and grid props

- **useDesignerMagazynState** now returns **binCapacityDetails** in addition to existing values.
- **WarehouseDesigner.tsx** destructures **binCapacityDetails** and passes it to **RackSideViewGrid** as **binCapacityDetails={binCapacityDetails}**.

### 3. RackSideViewGrid: new prop and tooltip

**File:** `frontend/src/components/warehouse/RackSideViewGrid.tsx`

- **New prop:**  
  `binCapacityDetails?: Record<string, { product: WarehouseProduct; quantity: number; capacity: number }[]>`
- **Import:** `WarehouseProduct` from `../../types/warehouse`.
- The element that renders **"Fizyczna poj.: X szt."** is wrapped in an SVG **`<g>`** that contains:
  - **`<title>`** — native SVG tooltip. Content:
    - First line: **"Fizyczna pojemność:"**
    - Then one line per product in `binCapacityDetails[key]`:  
      **`${product.name}: max ${capacity} szt. (w slocie ${quantity})`**
  - **`<text>`** — unchanged label: "Fizyczna poj.: {binMaxCapacityPieces[key]} szt."

Lines in the tooltip are joined with `\n` so each product appears on its own line.

### 4. Behaviour

- **Hover** over "Fizyczna poj.: X szt." → browser shows the `<title>` as tooltip.
- **Single product in slot:** e.g. `Produkt A: max 6 szt. (w slocie 4)`.
- **Multiple products:** e.g.  
  `Produkt A: max 6 szt. (w slocie 4)`  
  `Produkt B: max 3 szt. (w slocie 2)`.
- If **binCapacityDetails** is missing or empty for that bin, the tooltip still shows "Fizyczna pojemność:" (and no product lines). The main label and `binMaxCapacityPieces` are unchanged.

## Verification

- Slots with one product: tooltip shows one line (name, max capacity, quantity in slot).
- Slots with several products: tooltip lists each product with its own max capacity and quantity.
- Capacity logic is unchanged: 3D packing when dimensions exist, volume fallback otherwise; same as in `binMaxCapacityPieces`.
