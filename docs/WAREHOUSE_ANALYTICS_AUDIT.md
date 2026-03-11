# Warehouse Analytics Audit — Walking Cost Simulation

Technical analysis of the WMS codebase and database structure to determine what data exists and what is missing for implementing an accurate **warehouse walking cost simulation**. No new logic has been implemented.

---

## STEP 1 — Database Models (backend/models/)

| Model | Table | Important columns | Relationships |
|-------|--------|-------------------|----------------|
| **Tenant** | tenants | id, name, default_*_template_id | tenant_warehouses, products, orders, inventory, carts, waves, picks, pick_tasks |
| **Warehouse** | warehouses | id, name, address, type, tenant_id, start_x, start_y | tenant_warehouses, carts, locations, inventory, orders, waves |
| **Location** | locations | id, warehouse_id, name, type, width, depth, height, x, y, z | warehouse, inventory, inventory_units, picks, stock, pick_tasks, stock_reservations |
| **Product** | products | id, tenant_id, name, sku, ean, symbol, barcode, length, width, height, weight, volume, purchase_price, sale_price, manufacturer, unit, assigned_locations | tenant, order_items, inventory, inventory_units, stock, picks, pick_tasks |
| **Order** | orders | id, tenant_id, warehouse_id, number, order_date, value, created_at, status, city, country, cart_id, basket_id, wave_id, total_volume_dm3 | tenant, warehouse, items, picks, pick_tasks, cart, basket, wave, stock_reservations, picking_zones |
| **OrderItem** | order_items | id, order_id, product_id, quantity, unit_price, total_price, unit, total_volume | order, product |
| **Inventory** | inventory | id, tenant_id, product_id, warehouse_id, location_id, quantity | tenant, product, warehouse, location |
| **InventoryUnit** | inventory_units | id, tenant_id, product_id, warehouse_id, location_id, quantity, reserved_quantity, batch, serial_number, expiration_date | tenant, product, warehouse, location, picks |
| **Stock** | stock | id, tenant_id, product_id, warehouse_id, location_id, quantity | tenant, product, warehouse, location |
| **Pick** | picks | id, tenant_id, order_id, product_id, location_id, inventory_unit_id, quantity, status (waiting\|picking\|done), created_at, updated_at | tenant, order, product, location, inventory_unit, pick_wave_items |
| **PickTask** | pick_tasks | id, tenant_id, order_id, product_id, location_id, quantity, cart_id, status (waiting\|picking\|picked) | tenant, order, product, location, cart, pick_wave_tasks |
| **Cart** | carts | id, tenant_id, warehouse_id, name, barcode, type, total_volume, used_volume, status | tenant, warehouse, baskets, assigned_orders, pick_tasks |
| **CartBasket** | cart_baskets | id, cart_id, name, row, column, inner_* dimensions, order_id | cart, order |
| **Wave** | waves | id, tenant_id, warehouse_id, status, orders_count, created_at | tenant, warehouse, orders, pick_wave |
| **WarehouseMap** | warehouse_maps | id, tenant_id, warehouse_id, name, grid_cols, grid_rows | elements |
| **MapElement** | map_elements | id, map_id, type (rack\|zone\|aisle\|workstation), x, y, width, height, props | map, bins |
| **StorageBin** | storage_bins | id, element_id, level_index, bin_index, address, max_volume_dm3, current_volume_dm3, pos_x, pos_y | element |
| **ImportLog** | import_logs | id, tenant_id, warehouse_id, type, total_rows, created, updated, skipped, warnings, errors, message, created_at | — |
| **ConsolidationRack** | consolidation_racks | id, tenant_id, warehouse_id, name | levels |
| **ConsolidationRackLevel** | consolidation_rack_levels | id, rack_id, level_index, name, is_segmented | rack, segments |
| **RackSegment** | rack_segments | id, level_id, segment_index | level |
| **PickingZone** | picking_zones | (zone definitions) | orders (M2M) |
| **StockReservation** | stock_reservations | order_id, product_id, location_id, quantity, status | order, product, location |
| **PickWave** / **PickWaveItem** / **PickWaveTask** | pick_waves, pick_wave_items, pick_wave_tasks | wave/order/pick/task linkage | wave, order, pick, pick_task |
| **Label / template / pack / size / group** | various | label/printing | — |

*Note: Models using BaseModelMixin also have `created_at`, `updated_at`. Order and Product use their own `id`; Location, Inventory, Pick, etc. use the mixin.*

---

## STEP 2 — Location Model: Coordinates

**File:** `backend/models/location.py`

**Exact structure:**

- **id** (from BaseModelMixin)
- **warehouse_id** (FK → warehouses)
- **name** (String)
- **type** (String(20), default `"pick"`) — values: pick | reserve | floor
- **width** (Float, nullable)
- **depth** (Float, nullable)
- **height** (Float, nullable)
- **created_at**, **updated_at** (from BaseModelMixin)

**Conclusion (historical):** The Location model originally had no x/y or aisle/row/level. **As of the coordinate architecture update**, Location has **x**, **y**, **z** (Float, nullable) for physical position. See section *Location coordinate architecture* below.

**Separate coordinate system:** `WarehouseMap` / `MapElement` / `StorageBin` (warehouse designer) do have coordinates:

- **MapElement:** `x`, `y`, `width`, `height` (grid units)
- **StorageBin:** `pos_x`, `pos_y` (physical center for pathfinding)

There is **no foreign key** from `Location` (locations table) to `MapElement` or `StorageBin`. The designer layout and the operational “Location” used by Inventory/Pick are **not linked**. So:

- Operational data: **product → location** via **Inventory** (location_id → Location).
- Layout data: **MapElement** / **StorageBin** have coordinates but are **not** tied to **Location**.

---

## Location coordinate architecture (post-implementation)

The data model has been updated so that **operational** locations and warehouse start position carry coordinates.

### Location (backend/models/location.py)

- **x** (Float, nullable=True) — physical X position in warehouse space
- **y** (Float, nullable=True) — physical Y position
- **z** (Float, nullable=True) — optional height/level

Existing locations default to NULL; new locations can set e.g. A1-1-1 → x=3, y=1.

### Warehouse (backend/models/warehouse.py)

- **start_x** (Float, nullable=True, default=0) — packing station / picker start X
- **start_y** (Float, nullable=True, default=0) — picker start Y

### Data flow for walking-cost

The chain is:

1. **orders** (tenant_id, warehouse_id)
2. → **order_items** (order_id, product_id, quantity)
3. → **products** (id)
4. → **inventory** (product_id, warehouse_id, location_id) — same tenant/warehouse as order
5. → **location** (id, x, y, z)

So for each order we can resolve: order → items → product_id → inventory → location_id → (x, y). Walking-cost simulation uses this chain only (no picks table): start at (warehouse.start_x, start_y), visit each product location (x, y) in the order, compute Manhattan distance, sum per order.

### Migration

- New SQLite DBs get the columns from `Base.metadata.create_all()`.
- Existing DBs get them via `_ensure_location_warehouse_columns()` in `backend/main.py`: `ALTER TABLE locations ADD COLUMN x/y/z REAL`, `ALTER TABLE warehouses ADD COLUMN start_x/start_y REAL`. Existing rows keep NULL (locations) or 0 (warehouses).

### Automatic coordinate calculation for warehouse locations

When locations are generated from the warehouse layout (save layout in the designer), each new **Location** receives:

- **Coordinates (x, y, z)** — the **center** of the storage slot in warehouse space (cm). Formula: base position from rack (MapElement/Rack x, y in 10 cm units), plus segment offset along the rack, plus half of slot width/depth so that (x, y) is the slot center. Each segment/level gets a unique position (e.g. A1-1-1 → (10.5, 5.5), A1-1-2 → (10.5, 6.5)).
- **Dimensions (width, depth, height)** — from the rack’s internal structure (per-segment width_cm, rack length_cm, level height_cm), stored on Location for slotting and analytics.

Implementation: `backend/services/warehouse_layout_service.py` — `_bin_center_and_dimensions_cm()` computes center and dimensions from Rack + internal_structure; `_sync_locations_from_bins()` creates Location records with these values when a bin has no matching Location (existing locations are not overwritten). Used for: walking-cost analysis, picking route simulation, warehouse heatmap, slotting optimization.

### WarehouseMap → Location synchronization

When racks or bins are created or updated in the **WarehouseMap** designer (map_elements / storage_bins), the system synchronizes to the **Location** table so that analytics (walking-cost, route simulation, heatmaps) have coordinates.

- **When:** After adding a rack element (`add_element` with type=rack) and after updating a rack element (`update_element` for a rack; bin positions are refreshed when x, y, width, or height change).
- **Logic:** For every **StorageBin** belonging to a rack **MapElement**, the service creates or updates a **Location** with:
  - **name:** Same pattern as the layout generator (e.g. A1-1-1, A1-1-2) via `_location_name(aisle_letter, rack_index, level_index, bin_index)`.
  - **x, y:** From `StorageBin.pos_x`, `StorageBin.pos_y` (physical center; grid or same units as map).
  - **z:** 0 (default).
  - **width, depth, height:** From the rack element’s `props` (width_cm, depth_cm, height_cm).
- **Implementation:** `backend/services/warehouse_map_service.py` — `_sync_locations_from_map(warehouse_id, map_id)` iterates rack elements and their bins, then get-or-create/update Location by (warehouse_id, name). No locations are deleted; only create or update when WarehouseMap elements change.
- **Result:** Locations created or updated from the map have non-NULL x, y so walking distance and other analytics can use them.

---

## STEP 3 — Product → Location Mapping

**Tables that link product to location:**

| Table | Columns (relevant) | Role |
|-------|--------------------|------|
| **inventory** | tenant_id, product_id, warehouse_id, **location_id**, quantity | Primary: product stock at a location. Unique (tenant_id, product_id, location_id). |
| **inventory_units** | tenant_id, product_id, warehouse_id, **location_id**, quantity, reserved_quantity | Same idea as inventory; used by **Pick** (inventory_unit_id). Often empty in current system. |
| **stock** | tenant_id, product_id, warehouse_id, **location_id**, quantity | Enterprise physical inventory. Often empty. |

**Example structure (inventory):**

- One row per (tenant, product, location): product X at location L with quantity Q.
- A product can have multiple rows (multiple locations).
- **Location** is the logical location (name, type, width, depth, height, x, y, z). Coordinates (center of slot) and dimensions are set automatically when locations are generated from the warehouse layout (see “Automatic coordinate calculation for warehouse locations”).

So: **product → location** is stored in **inventory** (and optionally inventory_units / stock). There is **no** table that stores **location_id → (x, y)** or aisle/row/level for the same Location entity used in Inventory.

---

## STEP 4 — Order Data

**orders**

- Columns: id, tenant_id, warehouse_id, number, order_date, value, created_at, source, shipping_method, currency, city, country, status, barcode, cart_id, basket_id, total_volume_dm3, wave_id.
- Relationships: items (OrderItem), picks, pick_tasks, tenant, warehouse, cart, basket, wave.

**order_items**

- Columns: id, order_id, product_id, quantity, unit_price, total_price, unit, total_volume.
- Relationships: order, product.

**Obtaining order → product → quantity:**

- **Order** has `items` (one-to-many **OrderItem**).
- Each **OrderItem** has: `order_id`, `product_id`, `quantity`.
- So: for each order we get a list of (product_id, quantity). No location or pick sequence is stored at order-item level; location comes from **Inventory** (product_id → location_id) or from **Pick** / **PickTask** when they exist.

---

## STEP 5 — Picking Data

**picks**

- Table: **picks**
- Columns: id, tenant_id, order_id, product_id, location_id, inventory_unit_id, quantity, status (waiting | picking | done), created_at, updated_at.
- Links: order line (conceptually) to **location** and **inventory_unit**. One pick = one order product at one location.
- **Record count logic:** Picks are created when the system generates pick lines (e.g. from order_items + inventory allocation). They are **not** auto-filled from imports; they depend on the picking module that uses **inventory_units**.
- **Conclusion:** In the current project, **picks = 0** because the picking module is not implemented. So **picking events are not recorded**.

**pick_tasks**

- Table: **pick_tasks**
- Columns: id, tenant_id, order_id, product_id, location_id, quantity, cart_id, status (waiting | picking | picked).
- Similar role: task per (order, product, location). No timestamp for “when picked” or visit order.
- **Conclusion:** Same as picks — **not populated** when picking is not implemented; no pick events.

**pick_events**

- There is **no** `pick_events` table in the codebase. No table records discrete “picker visited location at time T” events.

So: **Picking events are not currently recorded.** The schema supports **Pick** / **PickTask** for “what to pick and where,” but they are empty and there is no table for visit timestamps or sequence.

---

## STEP 6 — Current Analytics Endpoints

**File:** `backend/api/analysis.py`  
**Service:** `backend/services/analytics_service.py` (and `analysis_service.py` for POST /run)

| Endpoint | Data sources | Tables queried | Why it might return empty / limited data |
|----------|--------------|----------------|------------------------------------------|
| **GET /analysis/product-rotation** | order_items | order_items, orders, products | Empty only if no order_items for tenant. |
| **GET /analysis/hot-products** | order_items | order_items, orders, products | Same. |
| **GET /analysis/dead-stock** | inventory + order_items + orders | inventory, order_items, orders (order_date), products | Empty if inventory is empty or all products sold recently. |
| **GET /analysis/pick-density** | order_items + inventory | order_items, orders, inventory, locations | Empty if no inventory rows (no product→location), or no order_items. |
| **GET /analysis/product-pairs** | order_items | order_items, orders, products | Empty only if no orders with ≥2 products. |
| **GET /analysis/hot-locations** | order_items + inventory | order_items, orders, inventory, locations | Empty if inventory is empty (no product→location for ordered products). |
| **GET /analysis/batch-picking** | order_items | order_items, orders, products | Empty only if no order_items. |
| **GET /analysis/walking-cost** | order_items + inventory | order_items, orders, inventory | Returns distinct_locations_count, total_items per order. No distances: Location has no coordinates. Empty or zero locations if inventory has no rows for ordered products. |
| **POST /analysis/run** | CSV + simulation | analysis_engine (DataFrames), simulation_service (carts, orders from DB) | Depends on CSV and DB state; not the main analytics DB path. |

**Summary:** Analytics that use only **order_items** (and orders/products) can return data. Those that need **product → location** (pick-density, hot-locations, walking-cost) depend on **inventory**; if inventory is sparse or empty for ordered products, results are empty or weak. **Walking-cost** currently returns only counts (distinct locations, total items), not distances, because **Location has no coordinates**.

---

## STEP 7 — Data Checklist for Walking Cost

| Data | Status | Notes |
|------|--------|--------|
| **Warehouse layout coordinates** | **PARTIALLY AVAILABLE** | MapElement (x, y) and StorageBin (pos_x, pos_y) exist in warehouse_maps but are **not** linked to Location. So layout exists for the designer, not for the operational Location used by Inventory/Pick. |
| **Product locations** | **AVAILABLE** | **inventory** table: product_id, location_id, quantity. So we know “which product is at which Location.” Location itself has no coordinates. |
| **Order product lists** | **AVAILABLE** | **order_items**: order_id, product_id, quantity. Full order composition. |
| **Picking events** | **MISSING** | picks = 0; no pick_events table; no timestamps or visit sequence. |
| **Picker starting location** | **MISSING** | No table or column for “start position” or depot; no link from cart/picker to a location_id or (x,y). |

---

## STEP 8 — Proposed Data Model for Realistic Walking Simulation

To support a **realistic warehouse walking simulation**, the following (or equivalent) is needed.

### 8.1 Location with position

Either extend **Location** or add a mapping table so that every operational location has a position:

**Option A — Extend Location:**

- **Location**
  - id, warehouse_id, name, type, width, depth, height (existing)
  - **x** (Float), **y** (Float) — e.g. meters or grid units
  - Optional: **aisle**, **row**, **level** (String/Integer) for address-based distance heuristics

**Option B — New table (if Location must stay unchanged):**

- **location_positions**
  - location_id (FK → locations), warehouse_id (FK), **x**, **y**, optional aisle/row/level

So: **Every location used in Inventory/Pick must have (x, y) or equivalent.**

### 8.2 Product locations (existing, keep as is)

- **inventory** (or equivalent) remains the source of truth:
  - product_id, location_id, quantity
  - So: for each product we know which location(s) hold it.

### 8.3 Order → product → quantity (existing)

- **orders** + **order_items**: order_id, product_id, quantity. No change.

### 8.4 Pick / visit sequence (for simulation or future real picks)

For **simulation**, we can derive “pick list” from order_items + inventory (product → location). For **real** walking cost we need either:

- **Pick** (or **PickTask**) with **location_id** and optionally **sequence_number** or **created_at** to define visit order, or
- A dedicated **pick_events** table:
  - order_id, location_id, product_id, quantity, **visited_at** (DateTime), **sequence_number** (Integer)

So: **Pick** (or pick_events) with **order_id, location_id, (sequence or timestamp)**.

### 8.5 Picker start / depot

- **Warehouse** or **Location**: one designated “depot” or “staging” location (e.g. location_id or flag `is_depot`).
- Or **Cart** / worker: **start_location_id** (FK → locations) for the start of the route.

### 8.6 Summary: minimal additions

| Required | Table / column | Purpose |
|----------|----------------|---------|
| **Location position** | Location (x, y) or location_positions (location_id, x, y) | Distance and pathfinding. |
| **Product → location** | inventory (existing) | Already exists. |
| **Order composition** | orders + order_items (existing) | Already exists. |
| **Pick/visit sequence** | Pick with location_id (existing but empty) or pick_events (order_id, location_id, sequence/timestamp) | Visit order and “stops” for the route. |
| **Start position** | Warehouse.depot_location_id or Location.is_depot or Cart.start_location_id | Start point for walking simulation. |

With **Location (x, y)** (or equivalent), **inventory**, **order_items**, and a **depot**, we can simulate a route: start at depot → visit each location (from order_items + inventory) in some order → return to depot. Distance = sum of segment lengths (e.g. Euclidean or Manhattan). Without coordinates on Location (or a linked position table), only heuristic metrics (e.g. “number of distinct locations”) are possible, as in the current walking-cost endpoint.

---

## STEP 9 — No Implementation

This document is a **technical analysis only**. No new code or data migration has been implemented. The report is intended to guide the design of the correct walking-cost simulation and any schema changes (e.g. Location coordinates or location_positions, depot, pick events) before implementation.
