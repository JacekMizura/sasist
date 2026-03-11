# Warehouse Slotting Data Audit

**Purpose:** Audit the current system and collect the data required for slotting optimization (placing fast-moving products closer to packing/picking start). No code changes; analysis and documentation only.

---

## 1. PRODUCT DATA

### Product model and table schema

**Table:** `products`  
**Model:** `backend/models/product.py` (class `Product`)

| Field required for slotting | Exists | Column / notes |
|-----------------------------|--------|----------------|
| product.id                  | Yes    | `id` (Integer, primary key) |
| product.name                | Yes    | `name` (String) |
| product.weight              | Yes    | `weight` (Float) |
| product.width               | Yes    | `width` (Float) |
| product.depth               | No     | Product has no `depth`. Use **length** for one horizontal dimension. |
| product.height              | Yes    | `height` (Float) |
| product.volume              | Yes    | `volume` (Float), stored in dm³ |

**Full Product schema (relevant to slotting):**

- **id** — Integer, PK  
- **tenant_id** — Integer, FK tenants  
- **name** — String  
- **sku**, **ean**, **symbol**, **barcode** — identifiers  
- **length** — Float (cm)  
- **width** — Float (cm)  
- **height** — Float (cm)  
- **weight** — Float  
- **volume** — Float (dm³; can be computed as L×W×H/1000)  
- **location** — String (legacy text)  
- **assigned_locations** — Text (JSON: list of location assignments)  
- **purchase_price**, **sale_price**, **manufacturer**, **unit**, **image_url**, **label_template_id**

**Conclusion:** For slotting we have **id, name, weight, width, height, volume**. There is no **depth** on Product; **length** is the third dimension. Volume and dimensions are available for slot sizing.

---

## 2. SALES DATA

### Where sales history is stored

Sales are derived from:

- **orders** — order header (date, warehouse, tenant)  
- **order_items** — line items (product, quantity per order)

### Orders table (`orders`)

Relevant columns:

| Column       | Type    | Description |
|-------------|---------|-------------|
| id          | Integer | PK |
| tenant_id   | Integer | FK |
| warehouse_id | Integer | FK |
| number      | String  | External order number |
| order_date  | DateTime| Order date (nullable; used for sales window) |
| created_at  | DateTime| Record creation (fallback when order_date is NULL) |

### Order_items table (`order_items`)

Relevant columns:

| Column    | Type   | Description |
|-----------|--------|-------------|
| order_id  | Integer| FK orders.id |
| product_id| Integer| FK products.id |
| quantity  | Integer| Units ordered |

Other columns (unit_price, total_price, unit, total_volume) are not required for slotting aggregates.

### How to compute sales metrics

The analytics service (`analytics_service.py`, dead_stock / dead_stock_space) uses:

- **Order date expression:** `COALESCE(order_date, created_at)` for the sales window.
- **sales_last_30_days:**  
  Join `order_items` → `orders`, filter `COALESCE(orders.order_date, orders.created_at) >= (now - 30 days)`, `GROUP BY product_id`, `SUM(quantity)`.
- **sales_last_90_days:**  
  Same join and expression with `>= (now - 90 days)`.
- **sales_per_day:**  
  e.g. `sales_last_30_days / 30` or `sales_last_90_days / 90`, or daily aggregates by `DATE(COALESCE(order_date, created_at))` and `GROUP BY product_id, date` for more accurate averages.

**Conclusion:** All required sales metrics can be computed from `orders` and `order_items` using `order_id`, `product_id`, `quantity`, and `COALESCE(order_date, created_at)`.

---

## 3. INVENTORY DATA

### Inventory table (`inventory`)

**Model:** `backend/models/inventory.py` (class `Inventory`)

| Field          | Type   | Description |
|----------------|--------|-------------|
| id             | Integer| PK (from BaseModelMixin) |
| created_at     | DateTime | |
| updated_at     | DateTime | |
| tenant_id      | Integer| FK tenants, NOT NULL |
| product_id     | Integer| FK products, NOT NULL |
| warehouse_id   | Integer| FK warehouses, NOT NULL |
| location_id    | Integer| FK locations, NOT NULL |
| quantity       | Float  | NOT NULL, default 0 |

**Unique constraint:** `(tenant_id, product_id, location_id)` — one row per product per location per tenant.

**Can the same product exist in multiple locations?**  
Yes. Different rows with the same `product_id` and `tenant_id` but different `location_id` are allowed. So a product can have stock in multiple locations (e.g. Import + storage, or several bins).

**Conclusion:** Inventory stores **product_id**, **location_id**, **warehouse_id**, and **quantity**. Multi-location per product is supported.

---

## 4. LOCATION DATA

### Location model (`locations`)

**Model:** `backend/models/location.py` (class `Location`)

| Field          | Type   | Exists | Description |
|----------------|--------|--------|-------------|
| id             | Integer| Yes    | PK (BaseModelMixin) |
| created_at     | DateTime | Yes  | |
| updated_at     | DateTime | Yes  | |
| warehouse_id   | Integer| Yes    | FK warehouses |
| name           | String | Yes    | NOT NULL (e.g. "A1-01-01", "Import", "START") |
| type           | String(20) | Yes | Default "pick" (pick \| reserve \| floor) |
| width          | Float  | Yes    | Nullable (cm) |
| depth          | Float  | Yes    | Nullable (cm) |
| height         | Float  | Yes    | Nullable (cm) |
| x              | Float  | Yes    | Nullable; physical position (cm) |
| y              | Float  | Yes    | Nullable; physical position (cm) |
| z              | Float  | Yes    | Nullable; physical position (cm) |
| location_type  | String(20) | Yes | NORMAL \| PICK_START \| PACKING \| DOCK, default NORMAL |
| graph_node_id  | Integer| Yes    | FK warehouse_nodes (nearest graph node) |

**Coordinates:** **x**, **y**, **z** all exist and are in centimeters. Used for walking cost, route simulation, and heatmaps.

**Conclusion:** Location has **id**, **name**, **x**, **y**, **z**, **width**, **depth**, **height**, **type**, and **location_type**. Coordinates and dimensions are available where populated.

---

## 5. WAREHOUSE GRAPH

### Warehouse nodes (`warehouse_nodes`)

**Model:** `backend/models/warehouse_graph.py` (class `WarehouseNode`)

| Field        | Type   | Description |
|-------------|--------|-------------|
| id          | Integer| PK (node_id in API) |
| created_at  | DateTime | |
| updated_at  | DateTime | |
| warehouse_id| Integer| FK warehouses |
| x           | Float  | NOT NULL (cm) |
| y           | Float  | NOT NULL (cm) |
| type        | String(32) | intersection \| aisle_entry \| packing \| charging \| other |

**API shape (GET /warehouse-graph/{warehouse_id}/nodes):**  
Each node is returned with **id**, **warehouse_id**, **x**, **y**, **type**, **locations_count**, **location_ids**.

### How locations are mapped to graph nodes

- **LocationNode** table (`location_nodes`): columns **location_id**, **node_id**. Each location is linked to one graph node (nearest node when graph is built).
- **Location** has optional **graph_node_id** (FK to warehouse_nodes); graph build/assign services also maintain **location_nodes**.
- **location_ids** in the API: for each node, the service collects all `Location.id` where `Location.graph_node_id = node.id` (or equivalent via location_nodes). So **location_ids** is the list of storage location IDs attached to that node.

**Conclusion:** Nodes have **node_id** (id), **x**, **y**, **type**. **location_ids** is derived from Location → graph_node_id / location_nodes, not stored on the node table itself.

---

## 6. PACKING / START LOCATION

### How packing and picker start are stored

- Stored as **Location** rows with **location_type** in `PICK_START`, `PACKING`, `DOCK` (not the generic `type` "pick").
- **Location.type** remains e.g. "pick"; **Location.location_type** is the enum: **NORMAL**, **PICK_START**, **PACKING**, **DOCK**.
- API: **POST /warehouse/special-location** creates/updates these; **GET /warehouse/{warehouse_id}/special-locations** returns `pick_start`, `packing`, `dock` (each with **id**, **x**, **y**).
- Only one **PICK_START** per warehouse (creating a new one replaces the previous).

### Coordinates

- **PICK_START**, **PACKING**, **DOCK** locations have **Location.x** and **Location.y** (cm), set when the special location is created.
- Returned as `{"id": loc.id, "x": float(loc.x or 0), "y": float(loc.y or 0)}` per type.

**Conclusion:** Packing and start points are **Location** rows with **location_type** in **PICK_START**, **PACKING**, **DOCK**. Their coordinates are in **Location.x**, **Location.y**.

---

## 7. DISTANCE CALCULATION

### How distance is calculated today

**Service:** `backend/services/analytics_service.py` — pick route and related logic.

- **Pick route (get_pick_route):**
  - Locations are mapped to graph nodes via **location_nodes** / **Location.graph_node_id** to get (node_id, x, y).
  - Visit order is built by **nearest-neighbor in Euclidean distance** between nodes (start → pick nodes → end).
  - **Total distance** is the **sum of Euclidean segments** between consecutive nodes in that visit order (in meters; coordinates converted from cm to m in `_euclidean_m`).
- **Walking cost (other analytics):** Uses graph edges and **Dijkstra** on **warehouse_edges** (distance_m) for path length when needed.

**Conclusion:** In the **pick-route** simulation, distance is **Euclidean** (straight-line) between consecutive nodes along the route, not graph-based (Dijkstra) along edges. So slotting that uses “distance to packing” can use either Euclidean from node (x,y) to packing (x,y) or the same graph/Euclidean convention for consistency.

---

## 8. CURRENT PRODUCT LOCATIONS (SAMPLE)

### Query to generate the list

Use this pattern (limit 20) to get **product_id**, **product_name**, **location_name**, **inventory_quantity**:

```sql
SELECT
  p.id AS product_id,
  p.name AS product_name,
  loc.name AS location_name,
  inv.quantity AS inventory_quantity
FROM inventory inv
JOIN products p ON p.id = inv.product_id
JOIN locations loc ON loc.id = inv.location_id
WHERE inv.quantity > 0
ORDER BY inv.warehouse_id, p.id, loc.name
LIMIT 20;
```

### Example structure (illustrative)

| product_id | product_name   | location_name | inventory_quantity |
|------------|----------------|---------------|--------------------|
| 1          | Product A      | A1-01-01      | 50.0               |
| 1          | Product A      | Import        | 10.0               |
| 2          | Product B      | A1-01-02      | 24.0               |
| 3          | Product C      | A2-02-01      | 100.0              |
| …          | …              | …             | …                  |

Run the query against the live database to get actual 20-row samples.

---

## 9. SALES VS LOCATION SAMPLE

### Query to generate the dataset

Sales from `order_items` + `orders` (date from `COALESCE(order_date, created_at)`), joined to inventory and location:

```sql
SELECT
  p.id AS product_id,
  p.name AS product_name,
  COALESCE(sales_30.sales, 0) AS sales_last_30_days,
  COALESCE(inv_qty.qty, 0) AS inventory_quantity,
  loc.name AS location_name
FROM products p
LEFT JOIN (
  SELECT oi.product_id, SUM(oi.quantity) AS sales
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE COALESCE(o.order_date, o.created_at) >= date('now', '-30 days')
  GROUP BY oi.product_id
) sales_30 ON sales_30.product_id = p.id
LEFT JOIN (
  SELECT inv.product_id, inv.location_id, SUM(inv.quantity) AS qty
  FROM inventory inv
  GROUP BY inv.product_id, inv.location_id
) inv_qty ON inv_qty.product_id = p.id
LEFT JOIN locations loc ON loc.id = inv_qty.location_id
WHERE p.tenant_id = 1  -- adjust tenant
ORDER BY sales_last_30_days DESC NULLS LAST, p.id
LIMIT 20;
```

(If one product has multiple locations, the join will produce one row per product–location; for a single “primary” location per product you may need to restrict to one location per product, e.g. by picking the location with the most inventory.)

### Example structure (illustrative)

| product_id | product_name | sales_last_30_days | inventory_quantity | location_name |
|------------|--------------|--------------------|--------------------|---------------|
| 5          | Fast mover   | 120                | 200.0              | A1-01-01      |
| 3          | Medium       | 45                 | 80.0               | A1-02-02      |
| 7          | Slow         | 8                  | 50.0               | A2-03-01      |
| …          | …            | …                  | …                  | …             |

Run against the live DB for real samples.

---

## 10. WAREHOUSE CAPACITY

### Do locations store capacity?

**Location model (`locations` table):**  
No capacity fields. It has **width**, **depth**, **height** (dimensions in cm) but **no**:

- max_volume  
- max_weight  
- bin_capacity  

So per-slot capacity is **not** on the main Location used for inventory.

**Elsewhere in the system:**

- **PickingZone** (picking_zone): **capacity_volume**, **max_weight_kg** — zone-level, not per bin.
- **Warehouse Bin** (warehouse_bins): **volume_dm3**, **current_load_dm3** — bin-level volume; used in layout/editor, not the same as `locations` used for inventory.
- **StorageBin** (warehouse_map / map elements): **max_volume_dm3** — map/editor bin capacity.
- **Cart**: **total_volume** / **max_volume_dm3** — cart capacity, not location.

**Conclusion:** The **Location** rows that back **inventory** and pick routes do **not** have max_volume, max_weight, or bin_capacity. Capacity exists on other entities (zones, layout bins, map bins, carts) but would need to be linked or duplicated to locations if slotting must respect per-location capacity.

---

## 11. SUMMARY

### What is already available for slotting

- **Products:** id, name, weight, dimensions (length, width, height), volume. Enough to rank by size/volume and to check fit if location capacity is added later.
- **Sales:** orders + order_items with order_date/created_at support **sales_last_30_days**, **sales_last_90_days**, and **sales_per_day** by product (and by warehouse/tenant if filtered).
- **Inventory:** product_id, location_id, warehouse_id, quantity; same product can be in multiple locations.
- **Locations:** id, name, x, y, z, width, depth, height, type, location_type. Coordinates and dimensions available where set.
- **Warehouse graph:** nodes (id, x, y, type) and **location_ids** per node (via Location.graph_node_id / location_nodes). Enough to compute distance from any storage location to start/packing.
- **Packing / start:** PICK_START, PACKING, DOCK stored as Location with x, y. Clear reference points for “distance to packing” or “distance to start”.
- **Distance:** Pick route uses Euclidean distance between nodes; same convention can be used for slotting (e.g. distance from location/node to packing node).
- **Sales vs location:** Join products → order_items/orders (sales) and products → inventory → locations gives product-level sales and current location(s) for a “sales vs location” dataset.

### What is missing or weak

- **Per-location capacity:** Locations do not have max_volume, max_weight, or bin_capacity. Slotting that respects slot capacity would need:
  - New fields on Location (e.g. max_volume_dm3, max_weight_kg), or  
  - A stable link from Location to a capacity source (e.g. warehouse_bins or map bins) and use of that capacity in the algorithm.
- **Product depth:** Product has no “depth”; length/width/height are used. For slotting this is usually enough if we treat dimensions as L/W/H.
- **Single “primary” location per product:** If the system allows one product in many locations, slotting may need a rule or flag for “primary” picking location (e.g. by max quantity or by assigned_locations) so that “current location” in reports is unambiguous.

### What additional tables or fields might be required

- **Location capacity (recommended):** Add to `locations` e.g. **max_volume_dm3**, **max_weight_kg** (nullable), and optionally **bin_capacity** (units) if slotting must enforce capacity.
- **Slotting result storage (optional):** Table or cache to store recommended product → location assignments (e.g. slotting_run_id, product_id, location_id, warehouse_id, score, suggested_quantity) for comparison and rollback.
- **Distance cache (optional):** If many locations, precompute and store distance from each location (or node) to PICK_START/PACKING to speed up scoring; currently distance can be computed on the fly from graph/node coordinates.
- **Sales aggregation cache (optional):** Materialized view or table (product_id, warehouse_id, sales_30, sales_90, sales_per_day, last_updated) to avoid recomputing sales on every slotting run.

No slotting algorithm or code has been implemented; this document only analyses and documents existing data and gaps.
