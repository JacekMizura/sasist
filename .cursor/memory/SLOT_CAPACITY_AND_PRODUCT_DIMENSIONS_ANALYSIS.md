# Analysis: Slot Capacity and Product Dimensions (Magazyn View)

**Goal:** Prepare the codebase for a feature that displays **"Fizyczna poj.: X szt."** under the slot progress bar when at least one product is assigned to the slot, representing the maximum number of items that physically fit in the slot.

**Scope:** Analysis only. No code changes.

---

## SECTION 1 — Slot rendering component

### Primary component: `RackSideViewGrid`

- **File:** `frontend/src/components/warehouse/RackSideViewGrid.tsx`
- **Role:** Renders the pallet-rack style **side view** of a single rack: uprights, beams, and **bins** (storage slots) with labels and occupancy.

### Where the slot (bin) is drawn

- Each **bin** is an SVG `<g>` containing:
  - A `<rect>` (slot box) with fill/stroke (normal / reserve / selected).
  - **Text lines:** "Różnych produktów: {uniqueCount}", "Łącznie: {quantity} szt.", "{usedDm3} dm³".
  - **Progress bar:** Two `<rect>`s — background (#e2e8f0) and filled part (green/amber/red by occupancy).
  - **Percentage text** below the bar: `{pct.toFixed(0)}%`.

### Exact location of progress bar and percentage

- **Lines 356–368** in `RackSideViewGrid.tsx`:
  - Bar background: `<rect x={barX} y={barY} width={barW} height={barHPx} fill="#e2e8f0" ... />`
  - Bar fill: `<rect ... width={barW * Math.min(1, pct/100)} ... fill={green|amber|red} />`
  - Percentage: `<text ... y={pctY} ...>{pct.toFixed(0)}%</text>`

### Other slot-related UI

- **ElevationPanel** (`ElevationPanel.tsx`): Used in the **Layout** tab (side panel with ElevationPanel), not in the Magazyn canvas. It shows per-bin buttons with a small progress bar and "X.XX%". The **Magazyn** tab uses **RackSideViewGrid** in the main canvas, not ElevationPanel.
- **MagazynRackDetailHeader**: Shows **rack-level** occupancy (one bar for the whole rack), not per-slot.

**Conclusion:** The component that renders **per-slot** progress bar and percentage in the **Magazyn** view is **`RackSideViewGrid`**. The hint "Fizyczna poj.: X szt." should be added in that component, under the existing percentage line (e.g. after `pctY`).

---

## SECTION 2 — Slot dimension source

### Bin (slot) dimensions

- **Type:** `BinState` in `frontend/src/types/warehouse.ts`
  - **`volume_dm3`** (number): Total capacity in dm³. When dimensions are set, this is effectively `(width_cm * depth_cm * height_cm) / 1000`.
  - **`width_cm`**, **`depth_cm`**, **`height_cm`** (optional): Physical dimensions in cm. When present, volume is derived from them.

### How slot volume is computed

- **File:** `frontend/src/components/warehouse/warehouseUtils.ts`
  - **`binVolumeDm3(b, rack)`** (lines 756–760):
    - If `b.width_cm`, `b.depth_cm`, `b.height_cm` are all set → `binVolumeFromDimensions(b.width_cm, b.depth_cm, b.height_cm)`.
    - Else → `b.volume_dm3 ?? 0`.
  - **`binVolumeFromDimensions(width_cm, depth_cm, height_cm)`** (lines 739–741): `(width_cm * depth_cm * height_cm) / 1000` (dm³).

### Where dimensions come from

- **Rack:** `RackState` has **`width_cm`**, **`length_cm`** (or **`depth_cm`** in some paths), **`height_cm`**.
- **Bins** are created in **`createBinsForRack`** (warehouseUtils.ts): per-level and per-segment dimensions can be set from rack dimensions (e.g. `width_cm = rackWidthCm / locs`, `height_cm` from level heights, `depth_cm` from rack depth). Resulting bins may have **`width_cm`**, **`depth_cm`**, **`height_cm`**, **`volume_dm3`**.
- In **RackSideViewGrid**, slot volume is obtained via **`binVolumeDm3(binState, rack)`**; the **rack** is passed in as the second argument (used only when bin dimensions are missing; currently the function does not fall back to rack dimensions in the signature, but bins are often created with explicit dimensions).

**Conclusion:** Slot dimensions are **BinState.width_cm, depth_cm, height_cm** when set; otherwise **BinState.volume_dm3**. They are passed into the slot indirectly: **RackSideViewGrid** receives **`rack`** (with **`rack.bins`**) and uses **`binVolumeDm3(binState, rack)`** and **`binUsedVolumeDm3(binState)`** for each bin. For a **physical capacity in pieces**, both slot dimensions (or at least slot volume) and product dimensions (or product volume) are needed.

---

## SECTION 3 — Product dimension source

### Frontend: `WarehouseProduct`

- **Type:** `frontend/src/types/warehouse.ts`
  - **`volume_dm3`** (number): Unit volume in dm³. Used for occupancy (quantity × volume_dm3).
  - **No `width_cm`, `height_cm`, `depth_cm`** (or `length_cm`) on the type today.

### How products are loaded in Magazyn

- **WarehouseDesigner** loads products (e.g. in **loadLayout** / **fetchProductsForMap**) from the products API and maps them to **WarehouseProduct** (around lines 522–543 in `WarehouseDesigner.tsx`). Only **`volume_dm3`**, **`quantity`**, **`location_id`**, **`assignedLocations`**, **`weight_kg`** / **`weight`**, **`image_url`** are mapped; **product dimensions (L×W×H) are not** mapped from the API response.

### Backend / API

- **`backend/api/product.py`**: Schema accepts **`length_cm`, `width_cm`, `height_cm`** (and **`volume_dm3`**). Volume can be computed from dimensions when all three are set.
- **`backend/models/product.py`**: Product model has **`volume`**; length/width/height may exist in API/schema only or in a different model. The API is the source of truth for what the frontend can receive.

**Conclusion:** **Product dimensions are not currently available on the frontend** in the Magazyn flow. The API supports **length_cm, width_cm, height_cm**; to support **physical capacity in pieces** (how many items fit), the frontend should:
- Either extend **WarehouseProduct** with **`width_cm`, `depth_cm` (or `length_cm`), `height_cm`** and populate them from the products API when loading for Magazyn,
- Or use a **volume-only** approximation: **max pieces = floor(slot_volume_dm3 / product_volume_dm3)** when product dimensions are missing (conservative and does not account for packing/orientation).

---

## SECTION 4 — Assigned product detection

### How assignments are known

- **Products** are linked to slots by:
  - **Legacy:** **`product.location_id`** matching **`bin.label`** or **`bin.location_id`**.
  - **Preferred:** **`product.assignedLocations`** with **`locationUUID`** matching **`bin.locationUUID`** and **`quantity`** per position.

### Where this is computed (Magazyn)

- **File:** `frontend/src/pages/WarehouseDesigner/useDesignerMagazynState.ts`
  - **`binItemCounts`**: Per-bin total quantity (szt.): key `${level_index}-${segment_index}`, value = sum of quantities of products assigned to that bin (via `locationUUID` or `location_id`).
  - **`binUniqueProductCounts`**: Per-bin count of distinct products (same key).

### In RackSideViewGrid

- **Props:** **`binItemCounts`**, **`binUniqueProductCounts`** (optional).
- For each bin: **`quantity = binItemCounts?.[\`${lev}-${bin}\`] ?? 0`**, **`uniqueCount = binUniqueProductCounts?.[\`${lev}-${bin}\`] ?? 0`**.

**Conclusion:** **"At least one product assigned"** is equivalent to **`quantity > 0`** (i.e. **`binItemCounts?.[key] > 0`**). No extra API or state is needed; the component already has this. To show **physical capacity in pieces**, we also need either (a) the list of **products** (or their dimensions) assigned to that bin, or (b) a precomputed **maxCapacityPieces** per bin (e.g. from a parent hook) so the slot only needs to display it when **quantity > 0**.

---

## SECTION 5 — Occupancy UI location

### Occupancy calculation

- **In RackSideViewGrid** (per bin), lines 300–302:
  - **`vol = binVolumeDm3(binState, rack)`**
  - **`used = binUsedVolumeDm3(binState)`**
  - **`pct = vol > 0 ? (used / vol) * 100 : 0`**
- **Helpers** in **warehouseUtils.ts**:
  - **`binUsedVolumeDm3(b)`**: `b.used_volume_dm3 ?? b.current_load_dm3 ?? 0`
  - **`binOccupancyPct(b)`**: `(binUsedVolumeDm3(b) / binVolumeDm3(b)) * 100` (capped at 100).

### Where "94%" and the bar are rendered

- **RackSideViewGrid.tsx**, inside the per-bin `<g>` (lines 328–370):
  - **Line 351:** "Łącznie: {quantity} szt."
  - **Lines 353–354:** "{usedDm3} dm³"
  - **Lines 356–364:** Progress bar (background + fill).
  - **Lines 365–367:** **`{pct.toFixed(0)}%`** (e.g. "94%").

The hint **"Fizyczna poj.: X szt."** should appear **under** this percentage line (e.g. a new `<text>` or small block below `pctY`), and only when **`quantity > 0`** (and optionally when a max-capacity value can be computed).

---

## SECTION 6 — Magazyn view detection

### How the app knows we are in the "Magazyn" tab

- **State:** In **`WarehouseDesigner.tsx`**, **`mainView`** is **`"magazyn" | "layout"`** (e.g. line 246).
  - **`const isLiveView = mainView === "magazyn"`** (line 250).
- **UI:** **DesignerToolbar** has a tab that sets **`mainView`** to **"magazyn"** or **"layout"** (e.g. **DesignerToolbar.tsx** line 55–56). Label comes from **`UI_STRINGS.warehouse.designerSubTabs.magazyn`** ("Magazyn").
- **RackSideViewGrid** is only rendered when a rack is selected and the right pane shows the side view; that pane is shown for **both** Magazyn and Layout when a rack is selected. The **same** **RackSideViewGrid** is used in the branch **`mainView === "magazyn"`** (see WarehouseDesigner around 1581–1641: when **mainView === "magazyn"**, the header is **MagazynRackDetailHeader** and the grid is **RackSideViewGrid** with **displayRack**, **binItemCounts**, **binUniqueProductCounts**). So the slot grid with **binItemCounts** (and thus "at least one product") is the **Magazyn** rack-detail view.

**Conclusion:** The feature should be visible **only in the Magazyn tab**. Detection options:
- **Option A:** Pass a prop **`showPhysicalCapacity?: boolean`** (or **`isMagazynView`**) from **WarehouseDesigner** into **RackSideViewGrid**; set it to **true** when **`mainView === "magazyn"`**. Then in RackSideViewGrid show "Fizyczna poj.: X szt." only when **showPhysicalCapacity && quantity > 0**.
- **Option B:** Infer from data: **binItemCounts** is only passed in the Magazyn flow (Layout uses ElevationPanel elsewhere). To keep the component reusable and the rule explicit, **Option A** is clearer.

---

## SECTION 7 — Recommended implementation location

### Where to add the hint

- **Component:** **`RackSideViewGrid`** — add a new line under the existing **`{pct.toFixed(0)}%`** text, e.g. **"Fizyczna poj.: X szt."** when **quantity > 0** and **X** is computed (see below).

### Where to compute max capacity (X)

- **Option 1 — In the slot component:**  
  **RackSideViewGrid** would need, per bin:
  - Slot dimensions (or volume): already available via **`binState`** and **`binVolumeDm3(binState, rack)`**.
  - List of **products in that bin** (or their dimensions/volume). Currently the grid does **not** receive per-bin product lists; it only receives **binItemCounts** and **binUniqueProductCounts**. So we’d need a new prop, e.g. **`binProducts?: Record<string, WarehouseProduct[]>`** (key = `${level_index}-${segment_index}`), and each product would need **volume_dm3** and ideally **width_cm, depth_cm, height_cm**.
- **Option 2 — In the parent / hook:**  
  **useDesignerMagazynState** (or a small helper in **WarehouseDesigner**) could compute **binMaxCapacityPieces: Record<string, number>**: for each bin, get assigned products, then for each product compute max pieces that fit (from dimensions or volume), take the **minimum** over products (conservative: capacity limited by the product that fits the least). Pass **binMaxCapacityPieces** into **RackSideViewGrid**. The grid then only renders **"Fizyczna poj.: X szt."** when **quantity > 0** and **X = binMaxCapacityPieces[key]**.

### Helper `calculateMaxCapacity(productDims, slotDims)`

- **Purpose:** Given one product’s dimensions (or volume) and slot dimensions (or volume), return the maximum number of units that physically fit.
- **Options:**
  - **Volume-only:** `Math.floor(slotVolumeDm3 / productVolumeDm3)` (no orientation; can overestimate if packing is not perfect).
  - **3D fit (L×W×H):** For each of the 6 orientations of the product box in the slot, compute how many fit along each axis and take the maximum; return the best orientation’s count. Requires product and slot **width_cm, depth_cm, height_cm**.
- **Recommended file:** **`frontend/src/components/warehouse/warehouseUtils.ts`**
  - **Reason:** Same module already has **binVolumeDm3**, **binVolumeFromDimensions**, and other bin/volume helpers. Keeps capacity logic next to volume logic and reusable (e.g. for ElevationPanel or future reports).
- **Signature idea:**
  - **Volume-only:**  
    `calculateMaxCapacityByVolume(slotVolumeDm3: number, productVolumeDm3: number): number`  
    → `Math.max(0, Math.floor(slotVolumeDm3 / productVolumeDm3))`.
  - **With dimensions (when available):**  
    `calculateMaxCapacityByDimensions(slotW: number, slotD: number, slotH: number, productW: number, productD: number, productH: number): number`  
    → best count over orientations; fallback to volume-based if dimensions missing.

### Summary

| Item | Recommendation |
|------|----------------|
| **Slot rendering** | **RackSideViewGrid** — add one line under the "X%" text. |
| **Condition** | Show hint only when **quantity > 0** and (optional) **mainView === "magazyn"** via a prop. |
| **Capacity calculation** | Helper in **warehouseUtils.ts**: e.g. **calculateMaxCapacityByVolume** and optionally **calculateMaxCapacityByDimensions**; use volume-only if product dimensions are not available. |
| **Where to compute X per bin** | In parent/hook (**useDesignerMagazynState** or WarehouseDesigner): build **binMaxCapacityPieces** using products assigned to each bin and the new util; pass as prop to **RackSideViewGrid**. |
| **Product dimensions** | Extend **WarehouseProduct** and product-load mapping to include **width_cm, depth_cm, height_cm** from API when implementing physical-capacity-by-dimensions. |

No code was modified; this document is analysis only.
