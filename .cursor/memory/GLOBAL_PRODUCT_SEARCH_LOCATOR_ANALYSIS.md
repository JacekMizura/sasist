# Global product search and locator – analysis

**Goal:** In the Magazyn dashboard map view (before clicking any rack), the user can search for a product. When a product is selected: racks containing that product are highlighted, a sidebar shows all locations of the product, and clicking a location highlights the rack containing it. **Analysis only** – no code changes.

---

## SECTION 1 — Product data source

**Where products come from:**  
In **WarehouseDesigner.tsx**, the **products** array is held in component state (`useState<WarehouseProduct[]>`). It is initially set to a small default list and then refreshed when the user is in Magazyn view via **fetchProductsForMap** (called when `isLiveView && layout.racks.length > 0`). **fetchProductsForMap**:

- Calls `/warehouse/layout` and `/products/` (tenant_id, warehouse_id; products limit 5000).
- Maps API response to **WarehouseProduct**: **id**, **name**, **sku** (from `p.symbol ?? p.sku`), **ean**, **quantity**, **volume_dm3**, **location_id**, **assignedLocations** (from `p.assigned_locations` or `p.assignedLocations`), plus dimensions and other fields.

**assignedLocations:**  
Yes. Each item is normalized to at least `{ locationUUID, quantity }`; the API can return more (e.g. **locationAddress**, **storageType**). The frontend keeps the array as-is, so **assignedLocations** is present and available for the locator.

**name / sku / ean:**  
Yes. **name** = `String(p.name ?? "")`, **sku** = `String(p.symbol ?? p.sku ?? "")`, **ean** = `String(p.ean ?? "")`. They are on every **WarehouseProduct** and are already used for search in **MagazynProductsSidebar** (name, SKU, EAN).

**Summary:** Product data for the map view comes from **WarehouseDesigner** state, filled by **fetchProductsForMap**. It already includes **assignedLocations** and **name** / **sku** / **ean**, so no new data source is required for global product search.

---

## SECTION 2 — Location mapping (locationUUID → bin → rack)

**Existing structures:**  
- **layout.racks**: array of **RackState**; each rack has **id** or **rack_index** and **bins** (array of **BinState**).  
- Each **BinState** has **locationUUID**, **label**, **location_id**, **storage_type**, etc.  
- **WarehouseDesigner** already builds **uuidToBin**: `Map<string, BinState>` from `layout.racks` by iterating each rack and each `rack.bins` and doing `map.set(bin.locationUUID, bin)`.

**Deriving rackId for each locationUUID:**  
- **uuidToBin** gives **bin** for a **locationUUID**. The bin is found by iterating **layout.racks** and **rack.bins**; at the time we set the map we know the **rack**. So we can build in the same pass (or a similar one):  
  **uuidToRackId**: `Map<string, string>` (or `Map<string, number | string>`) where for each bin we store **rackId** = `String(rack.id ?? rack.rack_index)`.  
- Construction: for each rack in **layout.racks**, for each bin in **rack.bins**, if **bin.locationUUID** is set, then `uuidToRackId.set(bin.locationUUID, String(rack.id ?? rack.rack_index))`.  
- So: **locationUUID → bin** = **uuidToBin.get(locationUUID)**; **locationUUID → rackId** = **uuidToRackId.get(locationUUID)**. No need for a separate “binToRack” structure if we store rack id in the same loop we use for **uuidToBin**.

**Summary:** Use **layout.racks** and each **rack.bins** to build **uuidToRackId** (and keep **uuidToBin** for storage_type/labels). Then for any **assignedLocation.locationUUID** we get **rackId** from **uuidToRackId.get(locationUUID)**.

---

## SECTION 3 — Rack highlighting on the map

**How racks are rendered:**  
**WarehouseFullMap** receives **layout**, **selectedRackId**, **onSelectRack**, **onOpenRack**, **rackOccupancyPct**, and optionally **showRackLabels**. It renders an SVG and, for each rack in **layout.racks**:

- **rid** = `r.id ?? r.rack_index`, **ridStr** = `String(rid)`.
- **isSelected** = `selectedRackId != null && String(selectedRackId) === ridStr`.
- **occupancyPct** = `rackOccupancyPct?.[ridStr]`.
- **fill** = `isSelected ? RACK_SELECTED_FILL : rackFillByOccupancy(occupancyPct)` (so selected overrides occupancy color).
- Each rack is a **<g>** with **onClick** → **onSelectRack(rid)** and **onDoubleClick** → **onOpenRack?.(rid)**.

**Adding “rack contains selected product” highlight:**  
We need an extra visual state without breaking existing behavior. Options:

- Add a prop **rackIdsContainingSelectedProduct?: Set<string>** (or **string[]**). In the map, for each rack:  
  **hasSelectedProduct** = **rackIdsContainingSelectedProduct?.has(ridStr)**.  
  Then compute **fill** with a clear priority, e.g.:  
  1. If **isSelected** (user-selected rack) → **RACK_SELECTED_FILL**.  
  2. Else if **hasSelectedProduct** → new constant, e.g. **RACK_PRODUCT_HIGHLIGHT_FILL** (e.g. a distinct cyan/purple).  
  3. Else → **rackFillByOccupancy(occupancyPct)**.  
- So existing occupancy and “selected rack” logic stay; we only add a second highlight when **selectedProductOnMap** is set and the rack is in the set derived from that product’s **assignedLocations**.

**Summary:** Rack colors are set in **WarehouseFullMap** from **selectedRackId** and **rackOccupancyPct**. Add a prop **rackIdsContainingSelectedProduct** and use it in the **fill** logic with priority: selected rack > product-highlight > occupancy. No change to existing color logic beyond adding this branch.

---

## SECTION 4 — New UI state: selectedProductOnMap

**Purpose:**  
Represent “user has chosen a product from global search on the map”; drive rack highlighting and the product-locator sidebar.

**Suggested shape:**  
- **selectedProductOnMap**: `WarehouseProduct | null` (or a small object like `{ product: WarehouseProduct }`).  
- Storing the full **product** is enough: it has **id**, **assignedLocations**, **name**, **sku**, **ean**, **quantity**, and we can compute total/primary/reserve from **assignedLocations** (and **uuidToBin** for storage_type fallback). So we don’t need a separate “productId” or “assignedLocations” state; they are on the product.  
- If we want to avoid holding a stale product reference when **products** is refreshed, we could store **selectedProductIdOnMap: string | null** and derive **selectedProduct** = **products.find(p => p.id === selectedProductIdOnMap)**. Then “product object” and “assignedLocations” are always from the current **products** array.

**Where it should live:**  
In **WarehouseDesigner.tsx**, next to **selectedRackIdOnMap**, **productSearchQuery**, etc. It’s map-view UI state, same as rack selection. A dedicated hook (e.g. **useDesignerMagazynState**) could be extended to accept **selectedProductIdOnMap** and return derived values (e.g. set of rack IDs to highlight), but the **state** itself is best in the page that owns the map and the sidebar so that:  
- The map receives **rackIdsContainingSelectedProduct**.  
- The product-locator sidebar receives **selectedProductOnMap** (or the resolved product) and callbacks to clear selection or to “highlight rack for location”.

**Summary:** Add **selectedProductIdOnMap: string | null** (or **selectedProductOnMap: WarehouseProduct | null**) in **WarehouseDesigner**. Prefer **selectedProductIdOnMap** and deriving the product from **products** so the selection stays in sync with data. All other behavior (rack IDs, sidebar content) can be derived from that plus **layout** and **products**.

---

## SECTION 5 — Rack highlighting logic (which racks to highlight)

For the selected product we need the set of **rackIds** that contain at least one of its locations.

**Algorithm:**  
- **product** = selected product (from **selectedProductIdOnMap** + **products**).  
- For each **a** in **product.assignedLocations** (or legacy **product.location_id** with one rack lookup if needed):  
  **rackId** = **uuidToRackId.get(a.locationUUID)**. If defined, add **rackId** to a **Set<string>**.  
- **rackIdsContainingSelectedProduct** = that set. Pass it to **WarehouseFullMap** as **rackIdsContainingSelectedProduct**.

**Where to compute:**  
In **WarehouseDesigner**, in a **useMemo** that depends on **selectedProductIdOnMap**, **products**, and **uuidToRackId** (or **layout.racks** if we build the set inline). So when the user selects a product we have **uuidToRackId** already (built from **layout.racks**); we iterate the product’s **assignedLocations** and collect rack IDs. No need to put this inside **useDesignerMagazynState** unless we move all map-related derived state there; it’s a small derivation and can sit next to **mapRackState** and **uuidToBin**.

**Summary:** From **selectedProductOnMap.assignedLocations** (and **uuidToRackId**) compute **rackIdsContainingSelectedProduct** in a **useMemo** in **WarehouseDesigner** and pass it to the map. The map uses it only for the fill color of racks that contain the selected product.

---

## SECTION 6 — Sidebar when a product is selected from search

When the user selects a product from global search, the sidebar should show:

- Product image, name, SKU / EAN.  
- Total quantity, primary quantity, reserve quantity.  
- List of all locations (with label, quantity, and optionally primary/reserve).

**Can we reuse MagazynProductsSidebar?**  
**MagazynProductsSidebar** is built for “list of products in a **rack** (and optionally a slot)”. It expects **selectedRackForMagazyn**, **selectedRackBinUUIDs**, **selectedRackBinLabels**, and filters **products** to those in that rack; it renders many product cards. For **global product search** we have:

- No rack selected (or rack selection is independent).  
- **One** product selected.  
- We need a **single-product** view: one header (image, name, SKU, EAN, total/primary/reserve) and one list of **all** locations for that product.

So the **data shape** is different: one product vs many; “all locations” vs “products in this rack”. We could force-reuse by passing **products={[selectedProduct]}**, **selectedRackForMagazyn=null**, but then **baseList** becomes empty (because the sidebar filters by rack). So the current sidebar would show “Brak produktów”. To reuse we’d have to add a special mode like **productLocatorMode** where it ignores rack and shows a single product with all locations—possible but awkward.

**Recommendation:** Use a **new component** (e.g. **ProductLocatorSidebar** or **MagazynProductLocatorSidebar**) that:

- Receives **product: WarehouseProduct | null**, **layout** (for uuidToLabel), **uuidToRackId** (for “which rack is this location in”), helpers (**safeQuantity**, **safeVolumeDm3**, **getProductImageUrl**, **formatVolume**).  
- When **product** is non-null: shows image, name, SKU, EAN; computes and shows total/primary/reserve from **product.assignedLocations** (and **uuidToBin** for storage_type); renders the list of locations (label, quantity, primary/reserve).  
- Each location row can be **clickable**; on click call **onSelectLocation(locationUUID)** so the parent can set “highlight this rack” (and optionally **selectedRackIdOnMap** for that rack).  
- When **product** is null, show empty state or search prompt.

This keeps the “product in rack” sidebar focused on rack context and the “locate one product” flow clear. If we later unify, we could have **MagazynProductsSidebar** accept an optional **singleProductLocatorMode** and render the single-product layout when that prop is set.

---

## SECTION 7 — Clicking a location (highlight rack, optional scroll/center)

**Requirement:** Clicking a location in the sidebar should highlight the rack containing that location and optionally scroll or center the rack on screen.

**Mapping locationUUID → rack:**  
**rackId** = **uuidToRackId.get(locationUUID)**. We already have (or will have) **uuidToRackId** in **WarehouseDesigner**. So when the sidebar calls e.g. **onLocationClick(locationUUID)**, the parent can:

- **rackId** = **uuidToRackId.get(locationUUID)**.  
- Set **selectedRackIdOnMap** = **rackId** so the rack is “selected” on the map (it already gets **RACK_SELECTED_FILL** when **selectedRackIdOnMap** matches). That gives “highlight the rack containing this location”.  
- Optionally: if the map/SVG is in a scrollable container, we can pass a ref to the rack **<g>** or the rack rect and call **scrollIntoView** when **selectedRackIdOnMap** changes; or we could pass **highlightedRackIdForScroll** and let the map component scroll that element into view. Implementation detail: the map would need to attach a ref to each rack group or use a data attribute and **querySelector** to find the rack by id, then **element.scrollIntoView({ behavior: 'smooth', block: 'center' })**. So “click location → set selectedRackIdOnMap → map highlights rack” is straightforward; “center on screen” requires the map to expose or use refs and run scroll when the highlighted rack changes.

**Summary:** Use **uuidToRackId.get(locationUUID)** to get **rackId** and set **selectedRackIdOnMap** to that value. Rack highlighting follows. Optional scroll/center can be done in the map component when **selectedRackIdOnMap** (or a dedicated “scroll to rack” trigger) changes.

---

## SECTION 8 — Search behavior

**Fields:** name, SKU, EAN (all on **WarehouseProduct**).

**Requirement:** Search filters only the **product list** (the list from which the user picks a product), not the map. The map stays as-is; only the set of products offered in the search dropdown or list is filtered.

**Where to implement:**  
- **Filtering** can live in **WarehouseDesigner** or in the component that renders the search UI (e.g. a small “Global product search” bar above the map, or inside the product-locator sidebar when no product is selected).  
- If the search input and the “list of matching products” are in **WarehouseDesigner** (e.g. a dropdown or list above the map), then the filter runs there: **filteredProducts** = **products.filter(p => (p.name + p.sku + p.ean).toLowerCase().includes(globalProductSearchQuery.trim().toLowerCase())** (or separate checks for name/sku/ean). Then we pass **filteredProducts** to the dropdown/list; when the user picks one we set **selectedProductIdOnMap**.  
- If the search input and list are inside a **ProductLocatorSidebar** (or a dedicated **ProductSearchPanel**), then that component receives **products** and **searchQuery** and does the filter internally; on select it calls **onSelectProduct(product)** so the parent sets **selectedProductIdOnMap**.  
- In both cases the **map** never receives the search query; it only receives **rackIdsContainingSelectedProduct** and **selectedRackIdOnMap**. So “search filters only the product list” is satisfied by implementing the filter wherever the product list is rendered (parent or sidebar), and not passing the query to the map.

**Summary:** Implement search in the same place that renders the product list (WarehouseDesigner for a top bar, or the sidebar/panel that shows “search and pick a product”). Filter **products** by name/sku/ean; do not pass the search query to the map. Map only reacts to **selectedProductIdOnMap** and **selectedRackIdOnMap**.

---

## SECTION 9 — Performance (precomputing maps)

**Scale:** 2000+ products, 5000+ locations (bins).

- **uuidToRackId:** Build once from **layout.racks** and all bins: O(racks × bins). With 5000 bins this is one pass and cheap. **WarehouseDesigner** already has **uuidToBin** in a **useMemo**; we can build **uuidToRackId** in the same **useMemo** (or a second one that runs after **layout.racks** is available). No need to look up rack per location at click time.  
- **product → rackIds:** When the user selects a product we need the set of rack IDs for that product. Option A: compute on demand when **selectedProductIdOnMap** changes: iterate **product.assignedLocations** and **uuidToRackId.get(uuid)**. Option B: precompute **productToRackIds: Map<string, Set<string>>** in a **useMemo** over **products** and **uuidToRackId**: for each product and each **a.locationUUID**, add **uuidToRackId.get(a.locationUUID)** to the product’s set. Then **rackIdsContainingSelectedProduct** = **productToRackIds.get(selectedProductIdOnMap)**. Option B avoids re-iterating the selected product’s locations on every render and keeps the “which racks have this product” lookup O(1). For 2000 products with a few locations each, building **productToRackIds** is one pass and acceptable.  
- So: **Precompute uuidToRackId** (with or next to **uuidToBin**). **Precompute productToRackIds** so that when a product is selected we only do **productToRackIds.get(productId)** to get the set of rack IDs to highlight. No expensive per-interaction lookups.

**Summary:** Precompute **uuidToRackId** from **layout.racks** (e.g. in the same **useMemo** as **uuidToBin** or a sibling). Precompute **productToRackIds: Map<productId, Set<rackId>>** from **products** and **uuidToRackId** so **rackIdsContainingSelectedProduct** is a single map lookup. This scales to 2000+ products and 5000+ locations.

---

## SECTION 10 — Structured report (summary)

1. **Where product data comes from**  
   **WarehouseDesigner** state, filled by **fetchProductsForMap** (API: layout + products). **products** already include **assignedLocations**, **name**, **sku**, **ean**. No new data source needed.

2. **How to map product locations to racks**  
   Build **uuidToRackId: Map<locationUUID, rackId>** from **layout.racks** and each **rack.bins** (same loop as **uuidToBin**). For each **assignedLocation.locationUUID**, **rackId** = **uuidToRackId.get(locationUUID)**. For a selected product, collect all such **rackId**s into **rackIdsContainingSelectedProduct**.

3. **How rack highlighting should be implemented**  
   Add **rackIdsContainingSelectedProduct** prop to **WarehouseFullMap**. In the rack loop, add **hasSelectedProduct** = **rackIdsContainingSelectedProduct?.has(ridStr)**. Set **fill** with priority: selected rack → product-highlight color → occupancy. Existing occupancy and selected-rack logic stay; only the new branch is added.

4. **Where selectedProductOnMap state should live**  
   In **WarehouseDesigner.tsx**: **selectedProductIdOnMap: string | null** (or **selectedProductOnMap: WarehouseProduct | null**). Prefer **selectedProductIdOnMap** and deriving the product from **products** so the selection stays up to date. Use it to derive **rackIdsContainingSelectedProduct** (from **productToRackIds** or on the fly) and to drive the product-locator sidebar.

5. **Whether the existing sidebar can be reused**  
   **MagazynProductsSidebar** is built for “list of products in a rack/slot”, not “single product + all locations”. Reusing it would require a special mode and passing a single product while bypassing rack filtering. **Recommendation:** add a **ProductLocatorSidebar** (or equivalent) that shows one product (image, name, SKU, EAN, total/primary/reserve) and a clickable list of all locations; on location click call **onSelectLocation(locationUUID)** so the parent can set **selectedRackIdOnMap** and highlight the rack.

**Additional points:**  
- **uuidToRackId** and **productToRackIds** should be precomputed for performance.  
- Search (name/sku/ean) filters only the product list used for selection; implement it where that list is rendered (parent or sidebar).  
- Clicking a location uses **uuidToRackId.get(locationUUID)** to get **rackId** and set **selectedRackIdOnMap**; optional scroll/center can be implemented in the map when the highlighted rack changes.

No code was modified in this analysis.
