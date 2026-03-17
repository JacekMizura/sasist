# Rack dashboard product list sidebar – analysis

**Goal:** When the user selects a rack on the **Magazyn dashboard** (full map with A1, A2, B1, …), show a product list on the right. **Analysis only** – no code changes.

---

## SECTION 1 — Rack selection state on the dashboard

**Current behavior:**  
In Magazyn view, when **selectedRackIdForSideView** is **null**, the app shows **WarehouseFullMap**. The map receives **selectedRackId={null}** and **onSelectRack={(id) => { setSelectedRackIdForSideView(id); … }}**. So **a single click on a rack** sets **selectedRackIdForSideView** and **immediately switches to the rack side view** (RackSideViewGrid + MagazynProductsSidebar). There is **no** “rack selected on map while staying on map” state.

**Variables:**

| Variable | Where | Meaning |
|----------|--------|--------|
| **selectedRackIdForSideView** | `WarehouseDesigner` (state) | Which rack is “open” in side view. When non-null, map is hidden and rack detail + current sidebar are shown. |
| **selectedRackId** | `WarehouseDesigner` | Used in **layout** (Projektant) view for selection; in Magazyn map branch it is passed as **null** to `WarehouseFullMap`. |
| **selectedRackIds** | `WarehouseDesigner` | Multi-selection in layout view; not used for Magazyn map. |

So today the UI does **not** “select a rack on the dashboard” and keep the user on the map; it “opens” the rack (navigates into it).

**What’s needed for the new feature:**  
A separate state that means “this rack is selected on the **map**” while we **stay on the map**, e.g.:

- **selectedRackIdOnMap**: `number | string | null`.

Then:

- When the user clicks a rack on the map, set **selectedRackIdOnMap = id** (and **do not** set **selectedRackIdForSideView**, so we remain on the full map).
- Optionally: “Open rack” (e.g. double-click or a button in the new sidebar) sets **selectedRackIdForSideView = selectedRackIdOnMap** and clears **selectedRackIdOnMap** so the existing rack-detail flow takes over.

So: **no variable currently stores “selected rack on dashboard”**; the variable that identifies the “active” rack in Magazyn is **selectedRackIdForSideView**, and it is used to **leave** the dashboard. The new behavior requires a **new** state (e.g. **selectedRackIdOnMap**) and a change of map click handler so that one click selects for the sidebar and keeps the user on the map.

---

## SECTION 2 — Detecting products in a rack

**Data:**

- **WarehouseProduct.assignedLocations**: array of `{ locationUUID, quantity, locationAddress?, storageType? }`.
- **layout.racks[].bins**: each bin has **locationUUID**, **label**, **location_id**, **storage_type**.

**Mapping:**

- Each **rack** has a set of bins; each **bin** has a **locationUUID**.
- **Product belongs to a rack** if at least one of its **assignedLocations** has **locationUUID** equal to some **bin.locationUUID** in that rack.

**Algorithm:**

1. For the chosen rack (e.g. `layout.racks.find(r => (r.id ?? r.rack_index) === selectedRackIdOnMap)`), build **rackBinUUIDs** = `Set` of all `bin.locationUUID` (and optionally **rackBinLabels** = set of `bin.label ?? bin.location_id`) for bins in that rack.
2. Filter products:
   - If **p.assignedLocations?.length**: product is in rack if **p.assignedLocations.some(a => rackBinUUIDs.has(a.locationUUID))**.
   - Else (legacy): **p.location_id != null && rackBinLabels.has(p.location_id)**.

This is the same logic already used in **MagazynProductsSidebar** for “whole rack” when **filterToSingleBin** is false (see **selectedRackBinUUIDs** / **selectedRackBinLabels** from **useDesignerMagazynState**). So **product → rack** is: **product.assignedLocations.locationUUID ∈ rack’s bin UUIDs** (or legacy **location_id** in rack’s bin labels). No need to resolve “rack id” or “rack label” for the filter; we only need the set of bin UUIDs (and optionally labels) for the selected rack.

---

## SECTION 3 — Aggregating product quantities

**Total quantity (whole warehouse):**

- **totalQuantity** = sum of **quantity** over all **p.assignedLocations** (or, if no **assignedLocations**, use **p.quantity** once).
- Already available: **WarehouseProduct.quantity** is the total when using **assignedLocations** (see product load in `WarehouseDesigner` where `quantity: totalQty || safeQuantity(p.quantity)`). So **totalQuantity = p.quantity** is correct when the API/frontend keeps it in sync. If we need to recompute: `(p.assignedLocations ?? []).reduce((s, a) => s + safeQuantity(a.quantity), 0)` (and fallback to **p.quantity** for legacy).

**Primary vs reserve:**

- **AssignedLocation** has optional **storageType?: "primary" | "reserve"** (`frontend/src/types/warehouse.ts`). The type is there; whether it is populated depends on the API and the save flow. Backend stores **assigned_locations** as JSON and returns it as-is, so if the client sends **storageType** it will be persisted and returned.
- **primaryQuantity** = sum of **a.quantity** where **a.storageType === "primary"** or not set (treat missing as primary).
- **reserveQuantity** = sum of **a.quantity** where **a.storageType === "reserve"**.

So:

- **totalQuantity**: use **p.quantity** (or sum of **assignedLocations[].quantity**).
- **primaryQuantity** / **reserveQuantity**: iterate **p.assignedLocations**, split by **a.storageType**. If **storageType** is often missing, we can fall back to resolving **a.locationUUID** to a bin and use **bin.storage_type** (layout bins have **storage_type**), so **effectiveType = a.storageType ?? bin?.storage_type ?? "primary"**.

**Conclusion:** **assignedLocations** can contain **storageType**; if not set, **bin.storage_type** from layout can be used as fallback. Aggregation (total / primary / reserve) can be implemented in one place (e.g. a small helper or inside the hook/component that builds the list).

---

## SECTION 4 — Sorting products

Products should be ranked by **total quantity in the warehouse** (totalQuantity).

- **totalQuantity** is available per product as **p.quantity** (or derived from **assignedLocations**). So we have enough data to sort by **totalQuantity**.
- **Where to compute:**  
  - **Option A (hook):** In **useDesignerMagazynState** (or a new hook like **useRackProductsForMap**) compute the list of products in the selected rack and sort by **totalQuantity** descending. The hook already has **layout**, **products**, and could take **selectedRackIdOnMap**; it can return **rackProductsSortedByTotalQuantity**.  
  - **Option B (component):** In the sidebar component, receive **products** and **selectedRack** (or rack’s bin UUID set), filter to “products in this rack”, then sort by **p.quantity** before slicing (top 5) and rendering.  
  Recommendation: **filter + sort in a hook** (or in the parent that has **layout** and **products**) so the sidebar stays presentational and we can reuse the same sorted list for “top 5” and for search. If the sidebar is reused (see Section 6), it already receives a **list**; the parent would pass the **pre-filtered and sorted** list for the selected rack when on the map.

---

## SECTION 5 — Limiting initial list and search

**Initial list:** Show **top 5 products** by **totalQuantity** (desc). If the rack has more than 5 products, show a search input.

**Search fields:** **name**, **sku**, **ean** – all exist on **WarehouseProduct** (`frontend/src/types/warehouse.ts`: **name**, **sku**, **ean**). Current **MagazynProductsSidebar** already filters by **productSearchQuery** on name, SKU, and EAN (lowercase). So the same search logic applies.

**Flow:**  
1. Compute **rackProducts** = products in selected rack, sorted by **totalQuantity** desc.  
2. **initialList** = first 5 of **rackProducts**.  
3. If **rackProducts.length > 5**, show search; when user types, filter **rackProducts** by name/sku/ean and show filtered list (e.g. still capped or scrollable).  
All data is on **WarehouseProduct**; no extra fields needed.

---

## SECTION 6 — Reusing existing sidebar vs new component

**MagazynProductsSidebar** today:

- Rendered only when **selectedRackIdForSideView != null** (we are in rack **side view**).
- Receives: **layout**, **products**, **productSearchQuery**, **selectedLocationForProducts** (slot), **showAllProductsInSidebar**, **selectedRackForMagazyn**, **selectedRackBinUUIDs**, **selectedRackBinLabels**, plus helpers.
- When **selectedLocationForProducts** is null, it still filters by **selectedRackForMagazyn** and **selectedRackBinUUIDs**/ **selectedRackBinLabels** (whole rack). The “Pokaż wszystkie produkty” checkbox is shown only when **selectedLocationForProducts != null && selectedRackForMagazyn** – i.e. only in slot context.

**Dashboard case:**

- We have a **rack** (from **selectedRackIdOnMap**) but **no slot** and we stay on the **map**.
- We need: same product list for “this rack” (all products in rack), search, “Inne lokalizacje”, and optionally total/primary/reserve quantities.

**Reuse:**

- We can reuse **MagazynProductsSidebar** by passing:
  - **selectedRackForMagazyn** = the rack for **selectedRackIdOnMap** (same as today when “in” that rack).
  - **selectedLocationForProducts** = **null** (no slot selected).
  - **showAllProductsInSidebar** = **true** (so “whole rack” filter is used; the checkbox is hidden because **selectedLocationForProducts** is null).
  - Same **layout**, **products**, **productSearchQuery**, helpers.
- Then the existing filter logic yields “all products in this rack”. The only behavioral difference is slot-specific UI (checkbox, “current location” in card) which is already conditional on **selectedLocationForProducts != null**.

**Alternative:** A dedicated **RackProductsSidebar** (or **MagazynRackMapSidebar**) that only receives **rack**, **products**, **layout**, and helpers, and implements “products in this rack”, top 5, search, and “Inne lokalizacje” without slot-related props. That would avoid passing “fake” **selectedLocationForProducts = null** and **showAllProductsInSidebar = true** and would make the “map selection” contract explicit.

**Recommendation:** **Reuse MagazynProductsSidebar** with **selectedRackForMagazyn** = rack for **selectedRackIdOnMap**, **selectedLocationForProducts = null**, **showAllProductsInSidebar = true**. Minimal code, same UX for list and “Inne lokalizacje”. If we later want different layout or copy (e.g. “Produkty w regalu X” instead of “PRODUKTY W REGALE”) we can add an optional prop (e.g. **title** or **mode: "rackDetail" | "mapRack"**). A separate **RackProductsSidebar** is cleaner only if we expect the map sidebar to diverge (e.g. different columns, no slot UI at all); for “same list, different entry point” reuse is simpler.

---

## SECTION 7 — “Inne lokalizacje” behavior

Each product card should still support **“Inne lokalizacje”** expansion.

- **assignedLocations** already contains **all** locations for the product (locationUUID, quantity, optional locationAddress, optional storageType). The current sidebar builds **otherLocations** by filtering out the “current” location (when in slot view) and mapping to **{ locationLabel, quantity }** using **layout** (uuidToLabel from all racks’ bins).  
- On the **map** sidebar there is **no** “current slot”, so “other locations” can mean either (a) all **assignedLocations** for that product, or (b) all except those in the **selected rack** (so we show “other racks/bins”). Option (b) is more consistent with “this rack” context: show locations **outside this rack** with quantities. That is the same as today’s “other” list when we treat the whole rack as context: we’d exclude any **locationUUID** that belongs to the selected rack’s bins. So **otherLocations** = entries in **p.assignedLocations** whose **locationUUID** is **not** in **selectedRackBinUUIDs**. **assignedLocations** plus **layout** (for labels) is enough; no extra API or data needed.

---

## SECTION 8 — Warehouse occupancy (primary vs reserve)

**Current occupancy:**  
“Łączna zajętość” in **WarehouseLegend** comes from **stats.usedDm3** and **stats.totalDm3** passed from **WarehouseDesigner**: **usedDm3: totalUsed**, **totalDm3: totalCapacity**.  
**totalUsed** = **productsAssignedVolumeDm3**, computed in **WarehouseDesigner** with a **useMemo** that loops over **products** and, for each, sums **quantity × volume_dm3** over **assignedLocations** (or uses **location_id** + **quantity** for legacy). So it does **not** split by **storageType** or **storage_type**.

**Bins and storage type:**  
- **BinState** has **storage_type?: "primary" | "reserve"**.  
- Layout bins get **storage_type** when loading layout (e.g. from template **reserve_bin_keys** or API). So **storage_type** exists for bins in **layout.racks[].bins**.

**Computing primaryVolume and reserveVolume:**

- Build a map **locationUUID → bin** (or at least **bin.storage_type**) by scanning **layout.racks** and all **bins**.
- For each product **p** and each **a** in **p.assignedLocations** (or legacy single location):
  - **effectiveType** = **a.storageType** (if present) else **bin.storage_type** for **a.locationUUID** else **"primary"**.
  - **vol** = **safeQuantity(a.quantity) * safeVolumeDm3(p.volume_dm3)**.
  - Add **vol** to **primaryVolume** or **reserveVolume** according to **effectiveType**.
- **primaryVolume** + **reserveVolume** should equal current **totalUsed** (if every location is either primary or reserve).

Same iteration as **productsAssignedVolumeDm3** but with a branch on type. Can be one **useMemo** returning **{ totalUsed, primaryUsedDm3, reserveUsedDm3 }** so the legend can show “Podstawowa: X dm³ | Rezerwa: Y dm³” in addition to “Łączna zajętość”.

---

## SECTION 9 — Performance

**Scale:** 2000+ products, 5000+ locations (bins across racks).

- **Filtering “products in this rack”:** For each product we do **assignedLocations.some(a => rackBinUUIDs.has(a.locationUUID))**. So O(products × assignedLocations per product). With 2000 products and a few locations per product this is acceptable in the main thread if done once per selection change.
- **Sorting:** O(n log n) on the filtered list (at most number of products in that rack). Negligible.
- **Building uuidToLabel (or locationUUID → bin):** One pass over **layout.racks** and all bins: O(racks × bins). With 5000 locations, one pass is fine.
- **Primary/reserve volume:** One pass over all products and all **assignedLocations**, with a lookup in the UUID→bin map. Same order as current **productsAssignedVolumeDm3** plus a map lookup per assignment.

**Where to put the logic:**

- **useDesignerMagazynState** (or a similar hook) already receives **layout** and **products** and returns derived state. It runs when **layout** or **products** change. Adding **selectedRackIdOnMap** and returning **rackProductsForMap** (filtered + sorted for that rack) would recompute only when **selectedRackIdOnMap**, **layout.racks**, or **products** change. That keeps heavy work in a **useMemo**/hook and avoids re-running in the sidebar on every keystroke (search can stay in the sidebar as a filter on the precomputed list).
- **Alternative:** Compute in the **parent** (WarehouseDesigner) in a **useMemo** that depends on **selectedRackIdOnMap**, **layout.racks**, **products**, and pass the result as a **list** into the sidebar. Then the sidebar only filters that list by search query (client-side).  
Recommendation: **compute filtered + sorted “products in rack” in the parent or in a hook** (e.g. **useDesignerMagazynState** extended with **selectedRackIdOnMap**), and pass the result down. Search (name/SKU/EAN) can remain in the sidebar over that list so we don’t refilter the whole **products** array on every keypress. For 2000 products, even a single filter pass per rack selection in the parent is acceptable; the expensive part is “all products × all assignedLocations” which we already do today for **productsAssignedVolumeDm3** and **rackOccupancyPct**.

---

## SECTION 10 — Structured report (summary)

1. **Detecting products in a rack**  
   Build **rackBinUUIDs** (and **rackBinLabels**) from the selected rack’s **bins**. A product belongs to the rack if **p.assignedLocations.some(a => rackBinUUIDs.has(a.locationUUID))** (or legacy **p.location_id** in **rackBinLabels**). Same logic as **MagazynProductsSidebar** with **selectedRackBinUUIDs** / **selectedRackBinLabels**.

2. **Total and primary/reserve quantities**  
   - **totalQuantity**: **p.quantity** (or sum of **assignedLocations[].quantity**).  
   - **primaryQuantity** / **reserveQuantity**: sum **a.quantity** where **a.storageType === "primary"** or **"reserve"** (with fallback to **bin.storage_type** from layout when **storageType** is missing). **AssignedLocation** and layout bins support this.

3. **Where to implement aggregation**  
   - **Rack product list (filter + sort):** In the parent or in **useDesignerMagazynState** (or a small hook) when **selectedRackIdOnMap** is set: filter products to the rack, sort by **totalQuantity** desc, pass list to sidebar.  
   - **Primary/reserve volume:** In **WarehouseDesigner** (or same place as **productsAssignedVolumeDm3**), one **useMemo** that iterates products and **assignedLocations** and splits volume by **storageType** / **bin.storage_type**, then pass **primaryUsedDm3** and **reserveUsedDm3** to the legend.

4. **Reusing the existing sidebar**  
   **Yes.** Use **MagazynProductsSidebar** with **selectedRackForMagazyn** = rack for **selectedRackIdOnMap**, **selectedLocationForProducts = null**, **showAllProductsInSidebar = true**. Slot-only UI is already conditional and stays hidden. Optional: add a prop for title/mode if copy or layout should differ on the map.

5. **Performance**  
   Filtering and sorting for “products in this rack” is O(products × locations per product) once per rack selection; do it in the parent or hook and pass the result. Search can stay in the sidebar on that list. Primary/reserve volume is one pass over products and assignments, similar to existing **productsAssignedVolumeDm3**. For 2000 products and 5000 locations, doing this in **useMemo** in the parent or **useDesignerMagazynState** is acceptable; avoid re-running the full product list filter on every search keystroke by filtering a precomputed list in the sidebar.

---

**Implementation outline (no code):**

- Add **selectedRackIdOnMap** state; on map rack click set it (and do not set **selectedRackIdForSideView** so we stay on the map). Optionally provide a way to “open” the rack (set **selectedRackIdForSideView**, clear **selectedRackIdOnMap**).
- When **selectedRackIdOnMap** is set, derive the rack and **rackBinUUIDs**/ **selectedRackBinLabels** (same as for that rack in **useDesignerMagazynState**), compute filtered list of products in that rack sorted by **totalQuantity** desc; optionally limit to top 5 for initial display and show search when there are more than 5.
- Render **MagazynProductsSidebar** with that rack, **selectedLocationForProducts = null**, **showAllProductsInSidebar = true**, and the same **layout**, **products**, search state, and helpers. Ensure “Inne lokalizacje” uses “other” = locations outside the selected rack (exclude **rackBinUUIDs**).
- For occupancy: extend occupancy computation to **primaryUsedDm3** and **reserveUsedDm3** using **storageType** / **bin.storage_type**; pass to **WarehouseLegend** and show primary/reserve in the legend.

No code was modified in this analysis.
