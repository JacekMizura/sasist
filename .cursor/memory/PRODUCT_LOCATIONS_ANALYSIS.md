# Product locations – data model and warehouse view (analysis)

Analysis of how product locations are represented and used in the Magazyn (warehouse) view. **No code changes** – architecture and data only.

---

## SECTION 1 — Product location model

**Source:** `frontend/src/types/warehouse.ts`

### WarehouseProduct

- **location_id** (string | null)  
  Legacy single bin: human-readable label (e.g. from `bin.label` or `bin.location_id`). Used when there is no `assignedLocations`. Comment: "Kept for backward compat; prefer assignedLocations."

- **quantity** (number)  
  Total quantity across all locations when using `assignedLocations`; when using legacy only, quantity at the single `location_id`.

- **assignedLocations** (AssignedLocation[] | undefined)  
  List of **all** storage positions where this product is assigned, with quantity per position.

### AssignedLocation

- **locationUUID** (string) – Stable id for the storage position (bin).
- **quantity** (number) – Quantity at that position.
- **locationAddress?** (string) – Optional human-readable address (e.g. "A1-4-1"), "set when saving from location picker".
- **storageType?** ("primary" | "reserve") – Optional; "When true, location is reserve (zapasowa). Optional, set when saving from picker."

### What assignedLocations represents

- **assignedLocations** is the list of **all** positions where the product is stored in the warehouse.
- Each entry is one (locationUUID, quantity) pair; the same product can appear in many locations with different quantities.
- There is **no** single “primary location” field. **storageType** is a **type of location**:
  - **primary** = normal picking location.
  - **reserve** = zapasowa (overstock / reserve), can be excluded from picking.
- Order of entries is not defined as “first = main”. If the UI needs a “main” location (e.g. for legacy `location_id`), the code currently uses the first entry’s UUID to resolve a label (e.g. in `WarehouseDesigner` when building `location_id` for display).

### Summary

- **assignedLocations** = **all** product locations; each has locationUUID, quantity, and optionally locationAddress and storageType.
- **Primary vs reserve** is expressed per location via **storageType**, not by “primary location” vs “other locations”. There is no separate “primary location” concept beyond storageType.

---

## SECTION 2 — Current selected slot

**Sources:** `WarehouseDesigner.tsx`, `useDesignerMagazynState.ts`, `RackSideViewGrid.tsx`

### Variables

| Variable | Where | Meaning |
|----------|--------|---------|
| **selectedRackIdForSideView** | WarehouseDesigner (state) | Which rack is open in Magazyn view (id or rack_index). |
| **selectedRackForMagazyn** | useDesignerMagazynState | The rack object: `layout.racks.find(r => id matches selectedRackIdForSideView)`. |
| **selectedLocationForProducts** | WarehouseDesigner (state) | The selected **slot** inside that rack: `{ level_index: number; segment_index: number } \| null`. |
| **selectedBin** | MagazynProductsSidebar (derived) | The bin in the selected slot: `selectedRackForMagazyn.bins.find(b => b.level_index === selectedLocationForProducts.level_index && b.segment_index === selectedLocationForProducts.segment_index)`. |
| **selectedBinUUID** | MagazynProductsSidebar (derived) | `selectedBin?.locationUUID ?? null` – **the id that ties products to this slot**. |
| **selectedBinLabel** | MagazynProductsSidebar (derived) | `selectedBin.label ?? selectedBin.location_id` – display label for the slot. |
| **selectedRackBinUUIDs** | useDesignerMagazynState | Set of all locationUUIDs of bins in the selected rack (for “whole rack” filtering). |
| **selectedRackBinLabels** | useDesignerMagazynState | Set of all labels in the selected rack. |

There is **no** variable named **selectedSlotKey** in the codebase. The slot is identified by:

- **selectedLocationForProducts** = `{ level_index, segment_index }`.
- From that, **selectedBin** and then **selectedBinUUID** (and **selectedBinLabel**) are derived.

For product–slot matching, **selectedBinUUID** is the canonical id: a product is “in the selected slot” if it has an `assignedLocations` entry with that **locationUUID**.

**RackSideViewGrid** receives `selectedLocation` (same shape as selectedLocationForProducts) and `onBinClick(level_index, segment_index)`. Selection is done by comparing `selectedLocation?.level_index` and `selectedLocation?.segment_index` to each cell’s level/segment. The key used in logic like `binItemCounts` is the string **`${level_index}-${segment_index}`** (e.g. `"1-2"`), but that is not stored in a variable named selectedSlotKey; it’s just the key format for maps keyed by slot.

---

## SECTION 3 — Mapping product → current slot

**Source:** `MagazynProductsSidebar.tsx` (filtering), `useDesignerMagazynState.ts` (bin-level aggregates)

### When a single slot is selected (“filter to single bin”)

- **filterToSingleBin** = `selectedBinLabel != null && !showAllProductsInSidebar`.
- A product is shown if:
  - If **p.assignedLocations** exists and **selectedBinUUID** is set:  
    `p.assignedLocations.some(a => a.locationUUID === selectedBinUUID)`.
  - Else (legacy):  
    `p.location_id === selectedBinLabel`.

So the selected slot is identified by **selectedBinUUID**; product belongs to that slot if it has an **assignedLocations** entry with that **locationUUID** (or, in legacy mode, **location_id** equals the bin label).

### When “Pokaż wszystkie produkty” is on (whole rack)

- **filterToSingleBin** is false.
- A product is shown if it is in **any** bin of the selected rack:
  - If **p.assignedLocations** exists:  
    `p.assignedLocations.some(a => selectedRackBinUUIDs.has(a.locationUUID))`.
  - Else (legacy):  
    `p.location_id != null && selectedRackBinLabels.has(p.location_id)`.

So:

- **Current slot** = the bin corresponding to **selectedLocationForProducts** → **selectedBin** → **selectedBinUUID** (and **selectedBinLabel**).
- **Product is in current slot** = has an entry in **assignedLocations** with **locationUUID === selectedBinUUID** (or legacy **location_id === selectedBinLabel**).

---

## SECTION 4 — Multiple locations per product

The system **does** support:

- **Multiple locations** for the same product: **assignedLocations** is an array; each element is one (locationUUID, quantity).
- **Quantities split across locations**: each element has its own **quantity**; total product quantity is the sum of these (and the sidebar/designer use that when **assignedLocations** is present).

Example:

```ts
assignedLocations = [
  { locationUUID: "uuid-A", quantity: 10 },
  { locationUUID: "uuid-B", quantity: 60 },
]
```

This is the real data model. Backend stores **assigned_locations** as JSON and returns it as a list; frontend types it as **AssignedLocation[]**. The same product can have many entries with different locationUUIDs and quantities.

---

## SECTION 5 — Reserve locations

The system **does** have a concept of **reserve** (zapasowa) location.

### Where it appears

| Place | Type / field | Meaning |
|-------|----------------|--------|
| **BinState** (types/warehouse) | **storage_type?: "primary" \| "reserve"** | Comment: "Primary = picking; Reserve = overstock, excluded from picking list." |
| **AssignedLocation** | **storageType?: "primary" \| "reserve"** | Comment: "When true, location is reserve (zapasowa). Optional, set when saving from picker." |
| **RackPosition** | **storage_type?: "primary" \| "reserve"** | Comment: "primary = picking; reserve = zapasowa (overstock)." |
| **CustomRackTemplate** | **reserve_bin_keys?: string[]** | Bin keys (e.g. "level_index-segment_index") marked as reserve; preserved when placing racks from template. |
| **Layout / bins** | **bin.storage_type** | When loading layout or building bins from template, bins can have **storage_type: "reserve"**. |

### Behaviour

- **RackSideViewGrid** and **MagazynProductsSidebar** use **selectedBin?.storage_type === "reserve"** to style and label (e.g. “Lokalizacja zapasowa (Rezerwa)”).
- **reserve_bin_keys** on the template defines which bins are reserve when creating racks; that is then reflected in **bin.storage_type** on layout bins.
- There is **no** separate “backup location” or “overflow location” type in the types or layout model – only **primary** and **reserve**.

---

## SECTION 6 — Current location vs other locations

Based on the actual code and data:

- **Current location** = the storage position (slot) selected in the warehouse view:
  - Identified by **selectedLocationForProducts** → **selectedBin** → **selectedBinUUID** (and **selectedBinLabel**).
  - When **filterToSingleBin** is true, the sidebar shows only products that have an **assignedLocations** entry with **locationUUID === selectedBinUUID** (or legacy **location_id === selectedBinLabel**).
- **Other locations** (for the same product) = all other entries in **p.assignedLocations**:
  - In the sidebar, **otherLocations** is computed as entries in **p.assignedLocations** with **locationUUID !== selectedBinUUID** (so the current slot is excluded from “other”).
  - When no slot is selected (**selectedLocationForProducts** null), **selectedBinUUID** is null; then “other” is not excluding any entry (all assigned locations are listed).

So:

- **Current** = the one bin identified by the current slot selection (selectedBinUUID / selectedBinLabel).
- **Other** = every other (locationUUID, quantity) in **assignedLocations** for that product.

---

## SECTION 7 — Short report (summary)

1. **What assignedLocations represents**  
   The full list of storage positions where the product is assigned. Each entry has **locationUUID**, **quantity**, and optionally **locationAddress** and **storageType** ("primary" | "reserve"). It contains **all** such locations; there is no separate “primary location” field, only per-location **storageType**.

2. **How the selected slot is identified**  
   By **selectedRackIdForSideView** (which rack) and **selectedLocationForProducts** (which slot: **level_index**, **segment_index**). From that, **selectedBin** and **selectedBinUUID** are derived. **selectedBinUUID** is the id used to match products to the current slot.

3. **How to detect that a product is in the selected slot**  
   Product is in the selected slot if **p.assignedLocations** has an entry with **a.locationUUID === selectedBinUUID**. Legacy path: **p.location_id === selectedBinLabel**.

4. **Whether “reserve location” exists**  
   Yes. **BinState**, **AssignedLocation**, and **RackPosition** have **storage_type** / **storageType** with values **"primary"** and **"reserve"**. Templates have **reserve_bin_keys**. The UI shows “Lokalizacja zapasowa (Rezerwa)” when **selectedBin?.storage_type === "reserve"**. There is no separate “backup” or “overflow” type.

5. **Terminology for UI**  
   - **Lokalizacja** – a single storage position (bin/slot).  
   - **Wybrana lokalizacja** / **Aktualna lokalizacja** – the slot selected in the grid (current location).  
   - **Inne lokalizacje** – other positions where the same product exists (rest of **assignedLocations**).  
   - **Lokalizacja zapasowa (Rezerwa)** – reserve slot (already used in sidebar).  
   - **Primary** – normal picking location; can be left unlabeled or labeled as “podstawowa” if needed.

No UI changes are proposed in this document; it only describes the architecture and data.
