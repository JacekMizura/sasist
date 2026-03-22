# Analysis: "Inne lokalizacje" (Other Locations) in Magazyn Sidebar

**Goal:** Add a button "Inne lokalizacje" on each product card that expands to show all other locations (with quantities) where that product exists. Analysis and implementation guidance only; no code changes.

---

## 1. Where product–location assignments are stored

**Primary source:** **WarehouseProduct.assignedLocations** (frontend type in `frontend/src/types/warehouse.ts`).

- **AssignedLocation** = `{ locationUUID: string; quantity: number; locationAddress?: string; storageType?: "primary" | "reserve" }`.
- Each product can have **multiple** entries: one per location, with **quantity** at that location.
- **product → location → quantity** is therefore already represented: for a given product `p`, **p.assignedLocations** is the list of `{ locationUUID, quantity, locationAddress? }`.

**Legacy:** **WarehouseProduct.location_id** is a single string (e.g. one bin label) and **p.quantity** is the total; used when **assignedLocations** is not set. For "other locations" we only need the **assignedLocations** path; products that only have **location_id** have a single location (no "other" list to show).

**Layout data:** **layout.racks** (in WarehouseDesigner) contains all racks; each rack has **bins** with **label**, **location_id**, **locationUUID**. So **locationUUID → human-readable label** can be resolved by scanning **layout.racks** and all **rack.bins**.

**Conclusion:** Assignments are stored on the product as **p.assignedLocations**. Resolving **locationUUID** to a display label (e.g. "C-1") requires either **locationAddress** on each assignment (if the API returns it) or a **uuid → label** map built from **layout.racks** and all bins.

---

## 2. How to retrieve all locations for a product

**Data is already on the product:** For each **WarehouseProduct** `p`, **p.assignedLocations** is the list of all locations where that product exists and the quantity at each. No extra API call or hook is required to "retrieve" the list.

**What we need to derive:**

- **"Other" locations:** Filter **p.assignedLocations** to exclude the **current** location. "Current" is:
  - When **filterToSingleBin** is true: the selected bin (**selectedBinUUID** or **selectedBinLabel**). Exclude the entry whose **locationUUID** matches **selectedBinUUID** (or whose label matches **selectedBinLabel** when using legacy **location_id**).
  - When **filterToSingleBin** is false (showing all products in the rack): "current" can be defined per card as the first location shown on the card, or we can show **all** locations in the expanded list and not exclude any. Simpler: when a single bin is selected, exclude that bin from "other"; when showing whole rack, show all locations in the expanded list (no exclusion).
- **Display label per location:** Use **a.locationAddress** when present; otherwise resolve **a.locationUUID** to a label. To resolve UUID we need a **uuid → label** map that covers **all** bins in the layout (not only the selected rack), because the product can be in other racks. So the sidebar needs either:
  - **layout** (all racks and bins) passed as a prop and build a map from each **bin.locationUUID** to **bin.label ?? bin.location_id**, or
  - A prop **getLocationLabel: (locationUUID: string) => string** that the parent computes from **layout.racks** (e.g. walk all racks and bins, return label for the given UUID, or the UUID if not found).

**Recommended:** Pass **layout** (or **allRacks**) into **MagazynProductsSidebar** and, inside the sidebar, build once (e.g. in useMemo) a **Map<string, string>**: for each rack and each bin, set **map.set(bin.locationUUID, bin.label ?? bin.location_id ?? bin.locationUUID)**. Then for each **a** in **p.assignedLocations**, **locationLabel = a.locationAddress ?? uuidToLabel.get(a.locationUUID) ?? a.locationUUID**.

**Resulting structure per product for "other locations":**

```ts
{ locationLabel: string; quantity: number }[]
```

- Filter **p.assignedLocations** to exclude the current bin (when in single-bin mode).
- Map each to **{ locationLabel: getLabel(a), quantity: a.quantity }**.
- Sort by **quantity** descending (or by **locationLabel** alphabetically), then render.

---

## 3. Whether MagazynProductsSidebar already has access to that data

**Currently the sidebar receives:**

- **products** (WarehouseProduct[])
- **selectedRackForMagazyn** (one rack)
- **selectedLocationForProducts** (level_index, segment_index)
- **selectedRackBinUUIDs**, **selectedRackBinLabels** (only for the **selected rack**)
- Helpers: safeQuantity, safeVolumeDm3, getProductImageUrl, formatVolume

So the sidebar **has** each product’s **p.assignedLocations** (all locations for that product). It **does not** have:

- The full **layout** (all racks/bins) to resolve **locationUUID** to a label for bins in **other** racks.
- Only **selectedRackForMagazyn** is passed, so we can resolve UUID → label only for bins in the current rack. For bins in other racks we get no label unless **assignedLocations[].locationAddress** is populated from the API.

**Conclusion:** The sidebar **already has** the list of locations per product (**p.assignedLocations**). To show human-readable labels for **all** locations (including other racks), the sidebar needs one of:

- **layout** (or **allRacks**) as a new prop and build **uuid → label** from all bins, or
- A **getLocationLabel(uuid)** prop provided by the parent (parent walks **layout.racks** and all bins).

Then the sidebar can derive **otherLocations: { locationLabel: string; quantity: number }[]** per product and render the expanded list.

---

## 4. State changes required to support card expansion

**Current structure:** Each product is rendered as a **Link** (whole card) to `/products/${p.id}`. There is no per-card expand/collapse state.

**Required state:**

- **expandedProductId: string | null** — which product card is expanded. When the user clicks "Inne lokalizacje" on product A, set **expandedProductId = p.id**; when clicking again or on another product, set to that product’s id (or null). So only one card is expanded at a time (collapse others when one expands).
- This state can live in **MagazynProductsSidebar** as **useState**. No need to lift it to the parent unless the parent needs to know.

**Structure per card:**

- **Outer wrapper:** Change from a single **Link** to a **div** (or fragment) so the card can contain both a link (to product page) and a button (Inne lokalizacje) that does not navigate. Recommended: keep a **Link** that wraps only the "main" content (image + name + SKU + quantity + volume), and place the button **outside** the **Link** but inside the same card container, so clicking the button does not trigger navigation. Alternatively: whole card remains a **div**, product name (or a dedicated "open product" area) is a **Link**, and "Inne lokalizacje" is a **button** with **e.stopPropagation()** and **onClick** toggling **expandedProductId**. The second approach avoids nested links and gives clear separation: link = go to product, button = expand.
- **expandedLocationsList:** When **expandedProductId === p.id**, render below the button a list of **otherLocations** (locationLabel + quantity). When **expandedProductId !== p.id**, do not render that list (or render collapsed).

**Conclusion:** Add **useState** for **expandedProductId** in the sidebar. Restructure each card so that (a) the part that navigates to the product is a **Link** (e.g. product name or top block), and (b) the "Inne lokalizacje" button and the expanded list are **outside** that **Link**, with the button toggling **expandedProductId**. No parent state change needed unless the parent wants to control expansion.

---

## 5. Recommended data structure for rendering other locations

**Per product, for the expanded section:**

```ts
type OtherLocationRow = {
  locationLabel: string;
  quantity: number;
};
```

**Derivation (inside the sidebar):**

1. **uuidToLabel:** `Map<string, string>` from **layout.racks** + all bins (or from **getLocationLabel**), or use **a.locationAddress** when present.
2. **currentLocationUUID** = **selectedBinUUID** when **filterToSingleBin**; else **null** (no exclusion).
3. For product **p**:  
   **otherLocations = (p.assignedLocations ?? [])**  
     **.filter(a => currentLocationUUID == null || a.locationUUID !== currentLocationUUID)**  
     **.map(a => ({ locationLabel: a.locationAddress ?? uuidToLabel.get(a.locationUUID) ?? a.locationUUID, quantity: safeQuantity(a.quantity) }))**  
     **.sort((a, b) => b.quantity - a.quantity)** (or sort by **a.locationLabel** if preferred).
4. When **otherLocations.length === 0**, hide the "Inne lokalizacje" button or show it disabled with a tooltip "Brak innych lokalizacji".
5. Render: **otherLocations.map(row => <div key={row.locationLabel}>{row.locationLabel} ({row.quantity} szt.)</div>)**.

**Edge cases:** If **p.assignedLocations** is missing but **p.location_id** is set (legacy), the product has only one location; "other" list is empty. If the API does not return **locationAddress** and we do not pass layout/uuidToLabel, show **locationUUID** (or a short suffix) as the label.

---

## 6. Interaction and UX summary

**Conflicts:**

- **Card click vs navigation:** The card is currently a **Link**. Put "Inne lokalizacje" in a **button** with **onClick** that calls **e.preventDefault()** and **e.stopPropagation()** and toggles expansion. Do **not** wrap the button in the **Link**; place the button next to or below the link area so the link and button are siblings. That way: click on name/content → navigate; click on button → expand/collapse only.
- **Search and "Pokaż wszystkie produkty":** These only change which products are in **list** and whether we filter to one bin. Expansion state (**expandedProductId**) is independent. When the list is re-filtered, the expanded card can stay expanded (same product id) or you can collapse when **list** changes; both are acceptable. Prefer: leave expanded until the user collapses or expands another card.

**UX:**

- **Do not show the current location in the expanded list:** When **filterToSingleBin** is true, exclude the entry for **selectedBinUUID** (or selected bin label) from **otherLocations**. When showing the whole rack, "current" is ambiguous; show all locations in the expanded list without exclusion.
- **Sort:** By quantity descending (e.g. "B-3 (25 szt.)" before "A-1 (10 szt.)") or by location label A–Z. Recommend quantity descending.
- **Collapse others when one expands:** Use a single **expandedProductId**; toggling "Inne lokalizacje" on product A sets **expandedProductId = p.id**, so any previously expanded card (another id) collapses.

---

## 7. Implementation summary

| Item | Conclusion |
|------|------------|
| **Where assignments are stored** | **WarehouseProduct.assignedLocations** (and legacy **location_id** + **quantity** for single location). |
| **How to get all locations for a product** | Use **p.assignedLocations**; filter out the current bin when in single-bin mode; map each entry to **{ locationLabel, quantity }** using **locationAddress** or a **uuid → label** map. |
| **Sidebar access** | Sidebar already has **products** (with **assignedLocations**). It needs **layout** (or **getLocationLabel**) to resolve UUID to label for bins in other racks. |
| **State for expansion** | **expandedProductId: string \| null** in the sidebar (useState). One card expanded at a time. |
| **Rendering structure** | **OtherLocationRow[]** per product; sort by quantity desc (or by label); render under "Inne lokalizacje" when **expandedProductId === p.id**. |
| **Card vs Link vs button** | Keep product name (or main block) as **Link** to `/products/${p.id}`; add a **button** "Inne lokalizacje" outside the Link; on button click, **stopPropagation** and toggle **expandedProductId**. |

**Concrete steps (no code applied):**

1. Add a prop to **MagazynProductsSidebar**: **layout: LayoutState \| null** (or **getLocationLabel: (uuid: string) => string**). Parent (WarehouseDesigner) already has **layout**; pass it in.
2. In the sidebar, build **uuidToLabel** from **layout.racks** and all bins (useMemo).
3. For each product **p**, compute **otherLocations** (filter + map + sort) using **uuidToLabel** and **selectedBinUUID** when **filterToSingleBin**.
4. Add **expandedProductId** state; add a **button** "Inne lokalizacje" with **onClick** that stops propagation and sets **expandedProductId** to **p.id** (or toggles off if already expanded).
5. When **expandedProductId === p.id**, render the list of **otherLocations** below the button. When **otherLocations.length === 0**, hide or disable the button.
6. Restructure the card so the **Link** does not wrap the button (e.g. card = **div**, first part = **Link** to product, then button, then conditional expanded list).

No code was modified in this analysis.
