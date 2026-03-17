# Analysis: Tooltip for Slot Physical Capacity (Per-Product Details)

**Goal:** Determine if the system has enough data to show detailed capacity per product in a tooltip when hovering over "Fizyczna poj.: X szt."

---

## 1. How to retrieve all products in a slot

### Current data in useDesignerMagazynState

The hook does **not** expose a "products per bin" list by name. It does expose:

- **products** — full list of `WarehouseProduct[]` (from layout/products API).
- **selectedRackForMagazyn** — the selected rack with **bins** (each bin has `label`, `location_id`, `locationUUID`).
- **binItemCounts** — `Record<string, number>`: total quantity per bin key `${level_index}-${segment_index}`.
- **binUniqueProductCounts** — `Record<string, number>`: number of distinct products per bin.
- **binMaxCapacityPieces** — `Record<string, number>`: one capacity value per bin (currently from the **first** assigned product only).

Assignment is determined by the same logic everywhere: for a given bin, a product is "in" that bin if:

- **Preferred:** `bin.locationUUID` is set and `product.assignedLocations` contains an entry with `locationUUID === bin.locationUUID`.
- **Legacy:** `product.location_id === (bin.label ?? bin.location_id)`.

So **all products in a slot** can be retrieved by iterating `products` and, for a given bin, collecting every product that matches that bin (same logic as in `binItemCounts` / `binUniqueProductCounts` / `binMaxCapacityPieces`). There is no `binProducts` or `inventoryByBin` today; it would be a new derived value.

**Proposed addition in useDesignerMagazynState:**

- **binProducts** — `Record<string, { product: WarehouseProduct; quantity: number }[]>`:
  - Key: `${bin.level_index}-${bin.segment_index}`.
  - Value: array of `{ product, quantity }` for each product assigned to that bin (quantity from `assignedLocations[].quantity` or `product.quantity` for legacy).

This reuses the same matching logic already used for `binItemCounts` and `binMaxCapacityPieces`; the only change is to collect the full product objects and per-product quantity instead of only totals.

---

## 2. Whether we can get products with dimensions (width_cm, depth_cm, height_cm)

**WarehouseProduct** (frontend type) includes optional:

- **width_cm**
- **depth_cm**
- **height_cm**

They are populated when loading products (e.g. from API `length`/`width`/`height` or `*_cm`). So **yes**: for each product in a slot we can read `product.width_cm`, `product.depth_cm`, `product.height_cm` when the API provides them. If any product has dimensions missing, capacity for that product can fall back to volume-based (same as current single-value logic).

**Conclusion:** The system **can** provide a list of products per slot with dimensions when those dimensions exist on `WarehouseProduct`.

---

## 3. Where "Fizyczna poj.: X szt." is rendered

**File:** `frontend/src/components/warehouse/RackSideViewGrid.tsx`

**Location:** Inside the per-bin `<g>` (around lines 375–379):

```tsx
{showPhysicalCapacity && quantity > 0 && binMaxCapacityPieces?.[`${lev}-${bin}`] != null && (
  <text x={cx} y={pctY + 12} textAnchor="middle" fontSize={10} fill="#6b7280" fontFamily="system-ui, sans-serif">
    Fizyczna poj.: {binMaxCapacityPieces[`${lev}-${bin}`]} szt.
  </text>
)}
```

So the capacity label is a single SVG `<text>` at `(cx, pctY + 12)` for each bin. The value comes from **binMaxCapacityPieces[`${lev}-${bin}`]** (one number per slot).

---

## 4. Whether RackSideViewGrid can receive a list of products per slot

**Currently:** RackSideViewGrid receives only:

- **binMaxCapacityPieces** — `Record<string, number>` (one capacity per slot).

It does **not** receive:

- The list of products per slot.
- Per-product capacity.

So **today the component cannot** render a tooltip with per-product capacity unless we add data.

**To support the tooltip we can either:**

- **Option A — Pass precomputed tooltip data:** Add a prop such as **binCapacityDetails**: `Record<string, { productNameOrSku: string; quantity: number; capacityPieces: number }[]>` computed in the hook (so the grid only renders, no product/capacity logic).
- **Option B — Pass products per bin:** Add **binProducts**: `Record<string, { product: WarehouseProduct; quantity: number }[]>` and have the grid (or a small helper) compute capacity per product using the same slotDims derivation and `calculateMaxCapacityByDimensions` / volume fallback. That requires passing **slotDims** (or rack + bin) into the grid as well so it can derive dimensions for each bin.

**Recommendation:** Precompute in the hook (**Option A**): add **binCapacityDetails** in **useDesignerMagazynState** (list of products per bin + quantity + capacity per product), and pass it into RackSideViewGrid. The grid then only renders the tooltip from that structure and does not need access to `WarehouseProduct` or capacity math.

---

## 5. Computing capacity per product

**Logic (already present for the “first product” in binMaxCapacityPieces):**

- **Slot dimensions:** Prefer `bin.width_cm`, `bin.depth_cm`, `bin.height_cm`; if missing, derive from rack:  
  `width_cm = rack.width_cm / bins_per_level`, `depth_cm = rack.length_cm` (or depth_cm), `height_cm = rack.height_cm / levels`.
- **Product dimensions:** `product.width_cm`, `product.depth_cm`, `product.height_cm`.
- If all six values are present: **calculateMaxCapacityByDimensions(slotDims, productDims)**.
- Else: **calculateMaxCapacityByVolume(slotVol, productVol)** with `binVolumeDm3(bin, rack)` and `product.volume_dm3`.

So **capacity can be calculated per product** using the same slot (and slotDims/slotVol) and each product’s dimensions/volume. The hook already has `selectedRackForMagazyn`, `products`, and the bin list; it can build **binProducts** and then, for each (bin, product), compute capacity and expose **binCapacityDetails** for the tooltip.

---

## 6. Tooltip UI structure (proposal)

### Content

- **Capacity summary (first line):**  
  Same as today: e.g. **"Fizyczna poj.: X szt."** where X is the displayed value (e.g. capacity for the first product, or min/primary product—consistent with current behavior).
- **Per-product section (in tooltip only):**  
  One line per product in the slot, e.g.:
  - **"SKU / nazwa: max Y szt. (obecnie Z szt.)"**  
  or shorter: **"SKU: Y szt. (w slotcie: Z)"**  
  where Y = capacity for that product, Z = quantity in slot.

Optional: indicate whether Y came from dimensions (3D) or volume ("wg obj.").

### Where to render the tooltip

- **Option 1 — SVG `<title>`:** Wrap the capacity `<text>` (or the whole capacity block) in a `<g>` and add a `<title>` child. Browser shows a native tooltip on hover. Content can be a single string (e.g. summary line + newline + per-product lines). Limitation: styling is limited, and long text may be truncated on some browsers.
- **Option 2 — Custom tooltip:** On mouse enter/leave of the capacity text (or a wrapper), set state (e.g. `tooltipBinKey`) and render a positioned div (or portal) with the same content. Allows richer formatting (e.g. bold summary, list of products); requires a bit of layout/positioning.

**Suggested structure for tooltip text (e.g. for `<title>`):**

```
Fizyczna pojemność (max szt.)
────────────────────────────
Produkt A (SKU-1): 3 szt. (w slotcie: 2)
Produkt B (SKU-2): 5 szt. (w slotcie: 1)
```

Or with capacity method:

```
Fizyczna pojemność
────────────────────────────
SKU-1: max 3 szt. (3D) — w slotcie: 2
SKU-2: max 5 szt. (obj.) — w slotcie: 1
```

---

## Summary

| Question | Answer |
|----------|--------|
| **1. Retrieve all products in a slot** | Use the same assignment logic as `binItemCounts` / `binMaxCapacityPieces`: iterate `products`, match by `bin.locationUUID` + `assignedLocations` or `bin.label`/`location_id`. Add a new value in the hook, e.g. **binProducts** or **binCapacityDetails**, that collects `{ product, quantity }` (and optionally capacity) per bin key `${level_index}-${segment_index}`. |
| **2. RackSideViewGrid access** | It currently does **not** have a list of products per slot. Add a new prop (e.g. **binCapacityDetails**) computed in **useDesignerMagazynState** and pass it from **WarehouseDesigner** so the grid can render the tooltip without holding full product list. |
| **3. Capacity per product** | Yes. For each (bin, product) use the same slotDims/slotVol derivation as in **binMaxCapacityPieces**, then **calculateMaxCapacityByDimensions(slotDims, productDims)** when all dimensions exist, else **calculateMaxCapacityByVolume(slotVol, productVol)**. |
| **4. Where to render the tooltip** | On the same capacity line in **RackSideViewGrid.tsx**: wrap the "Fizyczna poj.: X szt." `<text>` (or a group containing it) and attach either an SVG **`<title>`** (simple) or a custom tooltip (state + positioned div) that shows the summary plus per-product lines from **binCapacityDetails[`${lev}-${bin}`]** (or equivalent). |

The system **has enough data** to support the tooltip: products per bin can be derived in the hook, each product can carry dimensions, and capacity per product can be computed with the existing helpers. The missing piece is deriving and passing **per-bin list of products with quantity and capacity** into **RackSideViewGrid** and then rendering that in a tooltip on the capacity label.
