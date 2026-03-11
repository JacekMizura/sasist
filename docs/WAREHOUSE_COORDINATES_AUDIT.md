# Warehouse Coordinates & Layout — Technical Audit

**Purpose:** Full technical audit of where warehouse coordinates and layout data exist in the project, for walking-cost analytics and route simulation.  
**Scope:** Analysis only; no code was modified.

---

## STEP 1 — Location Model

**File:** `backend/models/location.py`

| Item | Value |
|------|--------|
| **Model** | Location |
| **Table** | `locations` |

**Columns:**

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | Integer (PK) | No | From BaseModelMixin |
| created_at | DateTime | Yes | From BaseModelMixin |
| updated_at | DateTime | Yes | From BaseModelMixin |
| warehouse_id | Integer (FK → warehouses.id) | No | CASCADE on delete |
| name | String | No | e.g. "A1-1-1", "Import" |
| type | String(20) | No | Default "pick" — pick \| reserve \| floor |
| width | Float | Yes | Slot width (e.g. cm) |
| depth | Float | Yes | Slot depth |
| height | Float | Yes | Slot height |
| **x** | Float | Yes | Physical X position (e.g. cm) |
| **y** | Float | Yes | Physical Y position |
| **z** | Float | Yes | Physical Z / level height |

**Contains coordinates (x, y, z)?** Yes. The model defines `x`, `y`, `z` (Float, nullable) for physical position (walking-cost, route simulation, heatmaps).

**Contains aisle/row/level fields?** No. There are no dedicated columns for aisle, row, or level; only `name`, `type`, and dimensions/coordinates.

---

## STEP 2 — Map / Layout Models

All models related to warehouse layout or visual map:

---

### WarehouseMap  
**File:** `backend/models/warehouse_map.py`  
**Table:** `warehouse_maps`

| Column | Type | Notes |
|--------|------|--------|
| id | Integer (PK) | |
| tenant_id | Integer (FK) | |
| warehouse_id | Integer (FK) | |
| name | String | Default "Layout 1" |
| grid_cols | Integer | Default 20 |
| grid_rows | Integer | Default 15 |

**Coordinates:** No. Grid definition only.

---

### MapElement  
**File:** `backend/models/warehouse_map.py`  
**Table:** `map_elements`

| Column | Type | Notes |
|--------|------|--------|
| id | Integer (PK) | |
| map_id | Integer (FK → warehouse_maps.id) | |
| type | String | rack \| zone \| aisle \| workstation |
| **x** | Integer | Grid X position |
| **y** | Integer | Grid Y position |
| **width** | Integer | Default 1 (grid cells) |
| **height** | Integer | Default 1 (grid cells) |
| props | Text | JSON: levels, bins_per_level, dimensions, etc. |

**Coordinates:** Yes — `x`, `y` (grid units), plus `width`, `height`.

---

### StorageBin  
**File:** `backend/models/warehouse_map.py`  
**Table:** `storage_bins`

| Column | Type | Notes |
|--------|------|--------|
| id | Integer (PK) | |
| element_id | Integer (FK → map_elements.id) | |
| level_index | Integer | |
| bin_index | Integer | |
| address | String | e.g. "A-01-04" |
| max_volume_dm3 | Float | |
| current_volume_dm3 | Float | |
| **pos_x** | Float | Physical center X for pathfinding |
| **pos_y** | Float | Physical center Y |

**Coordinates:** Yes — `pos_x`, `pos_y` (physical center).

---

### WarehouseLayout  
**File:** `backend/models/warehouse.py`  
**Table:** `warehouse_layouts`

| Column | Type | Notes |
|--------|------|--------|
| id | Integer (PK) | From BaseModelMixin |
| created_at, updated_at | DateTime | |
| warehouse_id | Integer (FK) | |
| name | String | Default "Layout 1" |
| width_m | Float | Hall width (m) |
| length_m | Float | Hall length (m) |
| grid_cols | Integer | |
| grid_rows | Integer | |
| row_containers_json | Text | JSON |

**Coordinates:** No. Hall dimensions and grid only.

---

### Rack (layout racks)  
**File:** `backend/models/warehouse.py`  
**Table:** `warehouse_layout_racks`

| Column | Type | Notes |
|--------|------|--------|
| id | Integer (PK) | From BaseModelMixin |
| created_at, updated_at | DateTime | |
| layout_id | Integer (FK → warehouse_layouts.id) | |
| name | String | |
| **x** | Integer | Position in 10 cm units |
| **y** | Integer | Position in 10 cm units |
| width | Integer | Grid cells (10 cm each) |
| height | Integer | Grid cells |
| orientation | String | "horizontal" \| "vertical" |
| levels | Integer | |
| bins_per_level | Integer | |
| length_cm | Float | |
| width_cm | Float | |
| height_cm | Float | |
| aisle_letter | String | e.g. "A" |
| rack_index | Integer | |
| internal_structure | Text | JSON: levels, locations (width_cm) |
| color | String | |
| template_id | String | |

**Coordinates:** Yes — `x`, `y` (grid units, 1 unit = 10 cm).

---

### Aisle  
**File:** `backend/models/warehouse.py`  
**Table:** `warehouse_aisles`

| Column | Type | Notes |
|--------|------|--------|
| id | Integer (PK) | From BaseModelMixin |
| created_at, updated_at | DateTime | |
| layout_id | Integer (FK) | |
| name | String | |
| **x** | Integer | |
| **y** | Integer | |
| width | Integer | |
| height | Integer | |
| two_way | Integer | 1 = two-way |

**Coordinates:** Yes — `x`, `y` (grid).

---

### Bin (layout bins)  
**File:** `backend/models/warehouse.py`  
**Table:** `warehouse_bins`

| Column | Type | Notes |
|--------|------|--------|
| id | Integer (PK) | From BaseModelMixin |
| created_at, updated_at | DateTime | |
| rack_id | Integer (FK → warehouse_layout_racks.id) | |
| label | String | e.g. "A1-1-1" |
| barcode | String | Unique |
| level_index | Integer | |
| segment_index | Integer | |
| volume_dm3 | Float | |
| current_load_dm3 | Float | |
| storage_type | String | "primary" \| "reserve" |

**Coordinates:** No. Position is derived from Rack (x, y) + level/segment + internal_structure.

---

### StorageLocation  
**File:** `backend/models/warehouse.py`  
**Table:** `storage_locations`

| Column | Type | Notes |
|--------|------|--------|
| id | Integer (PK) | From BaseModelMixin |
| created_at, updated_at | DateTime | |
| warehouse_id | Integer (FK) | |
| rack_id | Integer (FK) | |
| bin_id | Integer (FK → warehouse_bins.id) | |
| **x_cm** | Float | Warehouse space (cm) |
| **y_cm** | Float | |
| **z_cm** | Float | |

**Coordinates:** Yes — `x_cm`, `y_cm`, `z_cm` in warehouse space (cm).

---

### ConsolidationRack / RackLevel / RackSegment  
**File:** `backend/models/consolidation_rack.py`  
**Tables:** `consolidation_racks`, `consolidation_rack_levels`, `rack_segments`

No coordinate columns. Used for consolidation/picking zones, not physical layout positions.

---

### RackLevel (storage unit)  
**File:** `backend/models/rack_level.py`  
**Table:** `rack_levels`

Links to `storage_units`; columns: length, width, height, volume. No x/y coordinates.

---

## STEP 3 — How Locations Are Created

### 3.1 Warehouse layout service (designer using WarehouseLayout)

**File:** `backend/services/warehouse_layout_service.py`  
**Function:** `_sync_locations_from_bins(warehouse_id, rack, internal_structure, bin_rows)`

- **When:** Called from `save_layout()` after each rack and its bins are created/updated.
- **Logic:** For each bin in `bin_rows`, looks up `Location` by `warehouse_id` and `name == bin.label`. If none exists, **creates** a new `Location` with:
  - `warehouse_id`, `name=b.label`, `type="pick"`
  - `width`, `depth`, `height` (from `_bin_center_and_dimensions_cm`)
  - **`x`, `y`, `z`** (center of slot from `_bin_center_and_dimensions_cm`)
- **Coordinates assigned:** Yes. New locations get `x`, `y`, `z` (and width, depth, height). Existing locations are not updated.

**Creation snippet (conceptual):**

```python
self.db.add(Location(
    warehouse_id=warehouse_id,
    name=b.label,
    type="pick",
    width=float(width_cm),
    depth=float(depth_cm),
    height=float(height_cm),
    x=float(center_x),
    y=float(center_y),
    z=float(z_cm),
))
```

---

### 3.2 Import service (CSV)

**File:** `backend/services/import_service.py`  
**Function:** `_get_or_create_location(db, warehouse_id, name)`

- **When:** During product or order CSV import when a location name is provided.
- **Creation:** `Location(warehouse_id=warehouse_id, name=loc_name, type="pick")` — **no** `x`, `y`, `z`, or width/depth/height.
- **Coordinates assigned:** No.

---

### 3.3 Product API (default “Import” location)

**File:** `backend/api/product.py`

- **When:** Creating default inventory for a product when no location is specified.
- **Creation:** `Location(warehouse_id=default_warehouse_id, name="Import", type="pick")` — **no** coordinates or dimensions.
- **Coordinates assigned:** No.

---

### 3.4 Other services

- **`backend/services/location_service.py`:** Not present in the project.
- **`backend/services/storage_bin_service.py`:** Not present.
- **`backend/services/warehouse_map_service.py`:** Creates `MapElement` and `StorageBin` (with `pos_x`, `pos_y`). Does **not** create or update `Location`.
- **`backend/services/consolidation_rack_service.py`:** No references to `Location`; does not create locations.

**Summary:**  
- **Only** `warehouse_layout_service._sync_locations_from_bins` creates `Location` **with** coordinates (and dimensions).  
- Import and product default location create `Location` **without** coordinates.

---

## STEP 4 — Database State

The project uses SQLite (`backend/database.py`: `DATABASE_URL = "sqlite:///./test.db"`). Table existence and row counts depend on whether the app has been run and migrations/tables have been created.

**Suggested verification queries (run when DB is initialized):**

```sql
SELECT COUNT(*) FROM locations;
SELECT COUNT(*) FROM locations WHERE x IS NOT NULL AND y IS NOT NULL;
SELECT COUNT(*) FROM locations WHERE x IS NULL OR y IS NULL;
SELECT COUNT(*) FROM map_elements;
SELECT COUNT(*) FROM storage_bins;
SELECT COUNT(*) FROM inventory;
SELECT COUNT(*) FROM warehouse_layout_racks;
SELECT COUNT(*) FROM warehouse_bins;
SELECT COUNT(*) FROM storage_locations;
```

**Example interpretation:**

- `locations`: total number of locations.
- `locations with x,y set`: locations usable for walking-cost (have coordinates).
- `locations with NULL x or y`: locations without coordinates (e.g. from import or created before coordinate sync).

If the database has not been initialized, these tables may not exist; in that case, run the application (or create tables) first, then re-run the queries.

---

## STEP 5 — Location ↔ Map Relation

**Is there a direct relationship between Location and MapElement or StorageBin?**

- **No.** The `Location` model has no foreign key to `map_elements`, `storage_bins`, or `warehouse_maps`.
- **Location** is linked only to **Warehouse** (`warehouse_id`). It is identified by `(warehouse_id, name)` (e.g. "A1-1-1").
- **MapElement** and **StorageBin** belong to the **WarehouseMap** system (tables `warehouse_maps`, `map_elements`, `storage_bins`). They are not linked to the `locations` table.
- **WarehouseLayout** system (tables `warehouse_layouts`, `warehouse_layout_racks`, `warehouse_bins`, `storage_locations`) is separate. Layout bins have **labels** (e.g. "A1-1-1"). The layout service **syncs** to `locations` by creating a `Location` with the same `name` as the bin label and the same `warehouse_id`; the link is by **name + warehouse**, not by FK.

**Conclusion:** Locations are **not** linked to map elements by foreign key. The only “link” is logical: when using the **WarehouseLayout** designer, bin labels are used as location names and the same service that writes layout bins also creates/updates `Location` rows with coordinates. The **WarehouseMap** designer (MapElement/StorageBin) does not create or update `Location` at all.

---

## STEP 6 — Designer Output

There are **two** designer/layout systems:

### 6.1 Warehouse layout designer (WarehouseLayout)

**API:** `GET/POST /warehouse/layout` (e.g. `backend/api/warehouse_layout.py`).  
**Service:** `WarehouseLayoutService.save_layout()` in `backend/services/warehouse_layout_service.py`.

**When the user saves the layout (e.g. after creating/editing racks):**

1. **WarehouseLayout** — created or updated (grid, name, dimensions).
2. **Rack** (`warehouse_layout_racks`) — one row per rack; includes `x`, `y`, orientation, levels, bins_per_level, dimensions, `internal_structure`.
3. **Bin** (`warehouse_bins`) — one row per bin per rack; `label` (e.g. "A1-1-1"), level_index, segment_index.
4. **StorageLocation** (`storage_locations`) — one row per bin; `x_cm`, `y_cm`, `z_cm` from `_bin_coords_cm()`.
5. **Location** (`locations`) — for each bin **without** an existing location with same `warehouse_id` + `name`, a new `Location` is created with `name=bin.label`, `width`, `depth`, `height`, and **`x`, `y`, `z`** (center from `_bin_center_and_dimensions_cm()`).

**Flow:** Designer save → WarehouseLayout, Rack, Bin, StorageLocation, Location (only for missing names, with coordinates).

### 6.2 Warehouse map designer (WarehouseMap)

**API:** Warehouse map endpoints (e.g. map CRUD, add element).  
**Service:** `WarehouseMapService` in `backend/services/warehouse_map_service.py`.

**When the user adds a rack element:**

1. **MapElement** (`map_elements`) — one row; `x`, `y`, `width`, `height`, `type="rack"`, `props` (JSON).
2. **StorageBin** (`storage_bins`) — one row per bin; `element_id`, `level_index`, `bin_index`, `address`, `pos_x`, `pos_y` (set to element center: `el.x + el.width/2`, `el.y + el.height/2`).

**Location:** **Not** created. The map designer does not touch the `locations` table.

**Flow:** Designer add rack → MapElement, StorageBin (with pos_x, pos_y). No Location.

---

## STEP 7 — Final Summary

1. **Where coordinates currently exist**
   - **Location** (`locations`): columns `x`, `y`, `z` (Float, nullable). Populated only when locations are created from the **WarehouseLayout** designer (`_sync_locations_from_bins`).
   - **MapElement** (`map_elements`): `x`, `y` (grid), `width`, `height`.
   - **StorageBin** (`storage_bins`): `pos_x`, `pos_y` (physical center).
   - **Rack** (`warehouse_layout_racks`): `x`, `y` (10 cm units).
   - **StorageLocation** (`storage_locations`): `x_cm`, `y_cm`, `z_cm` (warehouse space, cm).
   - **Warehouse**: `start_x`, `start_y` (picker start for walking-cost).

2. **Whether locations have coordinates**
   - **Layout-generated locations:** Yes — when created via `save_layout` → `_sync_locations_from_bins`, they get `x`, `y`, `z` (and width, depth, height).
   - **Import / default “Import” location:** No — created without `x`, `y`, `z`. So in practice, only a subset of locations (those created from the layout designer) have coordinates.

3. **Whether locations are linked to map layout**
   - **No FK link.** Location has no reference to MapElement or StorageBin.
   - **Logical link only** for the **WarehouseLayout** path: same `warehouse_id` and location `name` = bin `label`. The **WarehouseMap** system (MapElement/StorageBin) does not create or update Location.

4. **What must be changed so analytics can calculate walking distance**
   - **If using only WarehouseLayout designer:** Ensure every layout save runs `_sync_locations_from_bins` so all bins have a corresponding Location with coordinates. Optionally, backfill coordinates for existing locations whose names match current layout bins (if product inventory uses those names).
   - **If using WarehouseMap designer:** Either (a) add a sync from MapElement/StorageBin to Location (create/update Location by address/label and set `x`, `y` from `pos_x`, `pos_y`), or (b) use a different path for walking-cost that reads positions from `storage_bins`/`map_elements` and joins to inventory via a matching key (e.g. location name ↔ bin address).
   - **Import / “Import” location:** Decide whether to set fixed coordinates for default/import locations or exclude them from distance calculations.
   - **Data quality:** Run the STEP 4 queries on the real DB to see how many locations have NULL coordinates and fix creation paths or run a one-time backfill so walking-cost has enough located positions.

---

*End of audit. No code was modified.*
