# Project Full Context — Warehouse Management & Analytics

This document describes the entire application architecture and data model so another AI session (or developer) can continue development without reading the whole repository.

---

## SECTION 1 — WHAT THIS APPLICATION IS

### Purpose

The application is a **warehouse management system (WMS)** and **warehouse analytics platform**. It supports multi-tenant operations, inventory and order management, picking workflows (carts, waves, tasks), and a rich set of analytics (dead stock, sales forecast, walking cost, pick route simulation, slotting).

### Who uses it

- **Warehouse operators** — Receive stock, manage locations, run picking (carts, waves), scan and fulfill orders.
- **Managers / analysts** — View analytics (inventory value, dead stock, product rotation, sales forecast, walking cost, pick route simulation, slotting), optimize layout and slotting.
- **Administrators** — Configure tenants, warehouses, products, locations, label templates, and import data (CSV: products, orders).

### Main workflows

1. **Inventory** — Products and stock are stored in `inventory` (product_id, warehouse_id, location_id, quantity). Locations have physical coordinates (x, y, z) and optional link to the warehouse graph. Product-level `assigned_locations` is configuration only; analytics use `inventory.location_id` (see `docs/ASSIGNED_LOCATIONS_VS_INVENTORY.md`).
2. **Orders** — Orders (header) and order_items (lines) are imported or created. Orders have external `number`, `order_date`, `warehouse_id`, `tenant_id`. Picking can be organized by waves and assigned to carts/baskets.
3. **Picking** — Carts (BULK / MULTI), baskets, waves, pick tasks. Pick tasks link order + product + location + quantity; picks link to inventory_units when executed. Route simulation uses the warehouse graph and inventory locations to compute a suggested path (START → pick locations → PACKING).
4. **Analytics** — All analytics read from orders, order_items, products, inventory, and locations (no dependency on picks for most reports). Features: product rotation, hot products, dead stock, dead stock space, pick density, product pairs, hot locations, batch picking, walking cost, sales forecast, pick route simulation, slotting.

---

## SECTION 2 — TECH STACK

### Backend

- **FastAPI** — REST API, dependency injection, CORS.
- **SQLAlchemy** — ORM, declarative models, sessions.
- **SQLite** — Current database (`sqlite:///./test.db`). Can be switched to PostgreSQL by changing `DATABASE_URL` in `backend/database.py`.
- **Pydantic** — Request/response schemas (in `schemas/` and inline in API).
- **Other:** reportlab, qrcode, pdf2image, pyzbar, Pillow (barcodes, labels, PDF import).

### Frontend

- **React 19** — UI components and pages.
- **TypeScript** — Typed JavaScript.
- **Vite 7** — Build and dev server.
- **React Router** — Client-side routing.
- **Axios** — HTTP client to backend.
- **Recharts** — Charts (forecast, slotting, analytics).
- **Tailwind CSS** — Styling.
- **Lucide React** — Icons.
- **jsbarcode, jspdf, qrcode, html2canvas** — Barcodes and PDFs in the browser.

### Communication

- Frontend runs on a dev port (e.g. 5173); backend runs separately (e.g. 8000).
- Frontend uses **Axios** with a base URL pointing to the backend. All API calls are REST (GET/POST/PUT/DELETE). CORS is enabled on the backend (`allow_origins=["*"]`).

---

## SECTION 3 — PROJECT STRUCTURE

### Backend (`backend/`)

| Directory / file   | Purpose |
|--------------------|--------|
| `api/`             | FastAPI route modules (analysis, cart, import_api, order, product, warehouse, warehouse_layout, warehouse_graph, wave, scan, inventory_api, picks, labels, etc.). One file per domain. |
| `models/`          | SQLAlchemy models (Tenant, Warehouse, Product, Location, Inventory, Order, OrderItem, Cart, Wave, Pick, PickTask, WarehouseNode, StorageBin, etc.). `base.py` adds id, created_at, updated_at. |
| `services/`        | Business logic: analytics_service, slotting_service, import_service, cart_service, wave_service, warehouse_graph_service, sales_forecast_service, etc. |
| `schemas/`         | Pydantic schemas for request/response (cart, order, warehouse, wave, pick, etc.). |
| `database.py`      | Engine, SessionLocal, Base, get_db. |
| `main.py`          | FastAPI app, CORS, middleware, router includes, DB create_all and migration helpers. |
| `middleware/`      | Request metrics, error recording. |
| `domain/`          | Domain logic (planning_engine, simulation_engine, cart_allocation_engine, order_volume_engine). |

### Frontend (`frontend/`)

| Directory / file   | Purpose |
|-------------------|--------|
| `src/pages/`      | Page components (Analysis with sub-pages: pick path simulation, forecast, dead stock, etc.; Warehouse map; Products; Orders; Carts; etc.). |
| `src/components/` | Reusable UI components. |
| `src/api/`        | Axios instance and API helpers (warehouseGraphApi, etc.). |
| `src/`            | App entry, router, global styles. |

### Docs (`docs/`)

- `ASSIGNED_LOCATIONS_VS_INVENTORY.md` — assigned_locations (config) vs inventory (actual stock).
- `SLOTTING_DATA_AUDIT.md` — Data audit for slotting.
- `WAREHOUSE_GRAPH_ARCHITECTURE.md`, `WAREHOUSE_SPECIAL_NODES.md`, `PICK_ROUTE_SIMULATION.md`, etc.

---

## SECTION 4 — CORE DATABASE MODELS

Base mixin (most models): `id`, `created_at`, `updated_at`.

| Model | Table | Main columns | Relationships |
|-------|--------|--------------|----------------|
| **Tenant** | tenants | name, default_*_template_id (cart, basket, location) | tenant_warehouses, products, inventory, carts, pick_waves, etc. |
| **Warehouse** | warehouses | name, address, type, tenant_id (optional), start_x, start_y | tenant_warehouses, locations, inventory, carts, layouts, pick_waves |
| **Product** | products | tenant_id, name, sku, ean, symbol, barcode, length, width, height, weight, volume, assigned_locations (JSON text), purchase_price, sale_price, label_template_id | order_items, inventory, inventory_units |
| **Location** | locations | warehouse_id, name, type (pick/reserve/floor), width, depth, height, x, y, z, location_type (NORMAL/PICK_START/PACKING/DOCK), graph_node_id | inventory, inventory_units, picks, pick_tasks, stock |
| **Inventory** | inventory | tenant_id, product_id, warehouse_id, location_id, quantity | product, location, warehouse, tenant |
| **Order** | orders | tenant_id, warehouse_id, number, order_date, created_at, status, cart_id, basket_id, wave_id, total_volume_dm3 | items (OrderItem), wave, cart, basket |
| **OrderItem** | order_items | order_id, product_id, quantity, unit_price, total_price, unit, total_volume | order, product |
| **WarehouseNode** | warehouse_nodes | warehouse_id, x, y, type (intersection/aisle_entry/packing/charging/other) | edges_from, edges_to, location_nodes |
| **WarehouseEdge** | warehouse_edges | warehouse_id, node_from_id, node_to_id, distance_m | node_from, node_to |
| **LocationNode** | location_nodes | location_id, node_id | location, node (links Location to WarehouseNode) |
| **Cart** | carts | tenant_id, warehouse_id, name, barcode, type (BULK/MULTI), total_volume, used_volume, capacity_mode, max_orders, status | baskets, assigned_orders |
| **CartBasket** | cart_baskets | cart_id, order_id (for MULTI), ... | cart, order |
| **Wave** | waves | tenant_id, warehouse_id, status, orders_count, created_at | orders, pick_wave |
| **PickTask** | pick_tasks | tenant_id, order_id, product_id, location_id, quantity, cart_id, status (waiting/picking/picked) | order, product, location, cart |
| **Pick** | picks | tenant_id, order_id, product_id, location_id, inventory_unit_id, quantity, status | order, product, location, inventory_unit |
| **StorageBin** | storage_bins | element_id (MapElement), level_index, bin_index, address, max_volume_dm3, current_volume_dm3, pos_x, pos_y | element (MapElement) |
| **WarehouseLayout** | warehouse_layouts | warehouse_id, name, width_m, length_m, grid_cols, grid_rows, row_containers_json | warehouse, racks, aisles |
| **WarehouseMap** | warehouse_maps | tenant_id, warehouse_id, name, grid_cols, grid_rows | elements (MapElement) |
| **MapElement** | map_elements | map_id, type (rack/zone/aisle/workstation), x, y, width, height, props (JSON) | map, bins (StorageBin) |

**What each represents:** Tenant = top-level SaaS tenant. Warehouse = physical warehouse. Product = sellable item. Location = bin/position in warehouse (with coordinates and optional graph link). Inventory = actual stock at (product, warehouse, location). Order/OrderItem = customer order and lines. WarehouseNode/Edge/LocationNode = walking graph for routes. Cart/CartBasket = picking cart and baskets. Wave = grouping of orders for batch picking. PickTask/Pick = picking task and executed pick. StorageBin = bin in designer map (capacity); WarehouseLayout = legacy grid layout; WarehouseMap/MapElement = designer map (racks, zones, aisles).

---

## SECTION 5 — INVENTORY LOGIC

Stock is stored in the **inventory** table:

- **product_id** — which product
- **warehouse_id** — which warehouse
- **location_id** — which location (FK to locations)
- **quantity** — amount (float)
- **tenant_id** — tenant (required)

Unique constraint: `(tenant_id, product_id, location_id)`. The same product can have multiple rows in different locations (or warehouses).

- **inventory** = **actual stock position**. All analytics (pick route, slotting, walking cost, hot locations, etc.) read product locations only from **inventory** joined with **location**. They do **not** use product.assigned_locations for where stock is.
- **product.assigned_locations** = **configured** (planned or default) storage. Used for: product configuration in the UI (and sync to inventory on save), putaway suggestion, default storage (e.g. import moving from "Import" to assigned). See `docs/ASSIGNED_LOCATIONS_VS_INVENTORY.md`.

---

## SECTION 6 — LOCATION SYSTEM

**Location** (`locations` table):

- **id**, **created_at**, **updated_at**
- **warehouse_id** — FK to warehouses
- **name** — e.g. "A1-01-01", "Import", "START", "PACK"
- **type** — "pick" | "reserve" | "floor"
- **width**, **depth**, **height** — optional (cm)
- **x**, **y**, **z** — physical position (cm)
- **location_type** — **NORMAL** | **PICK_START** | **PACKING** | **DOCK**
- **graph_node_id** — FK to warehouse_nodes (nearest node for pathfinding)

**Types:**

- **PICK_START** — Picker start point (one per warehouse in practice).
- **PACKING** — Packing station; used as end of pick route and for slotting distance.
- **DOCK** — Shipping dock.
- **NORMAL** — Regular storage (can be referred to as STORAGE in docs). Standard picking locations.

Coordinates (x, y, z) are used for distance and route simulation when locations are mapped to graph nodes.

---

## SECTION 7 — WAREHOUSE GRAPH

Navigation is modeled as a graph:

- **warehouse_nodes** — Vertices: id, warehouse_id, x, y, type (intersection | aisle_entry | packing | charging | other).
- **warehouse_edges** — Edges: warehouse_id, node_from_id, node_to_id, distance_m (meters).
- **location_nodes** — Links each **Location** to one **WarehouseNode** (location_id, node_id). One row per location; the location’s bin is considered at that node for pathfinding.

Locations are mapped to graph nodes via **Location.graph_node_id** and/or **location_nodes**. The API returns nodes with **location_ids** (list of location IDs attached to that node). Graph can be generated from location coordinates (grid + nearest node assignment) via `warehouse_graph_service`.

---

## SECTION 8 — ORDER SYSTEM

- **orders** — id, tenant_id, warehouse_id, number (external), order_date, created_at, status, cart_id, basket_id, wave_id, total_volume_dm3, value, source, shipping_method, city, country, barcode.
- **order_items** — id, order_id, product_id, quantity, unit_price, total_price, unit, total_volume.

Orders are imported (CSV) or created via API. Picking: orders can be assigned to a **wave**; waves are broken into **pick tasks** (order line + product + location + quantity). Tasks can be assigned to **carts** (BULK = one order per cart, MULTI = basket per order). **Picks** record actual execution (link to inventory_unit). Analytics typically use order_items + inventory (no picks) for simulation and reporting.

---

## SECTION 9 — ANALYTICS MODULE

Implemented analysis features:

| Feature | Endpoint / usage | What it calculates |
|--------|-------------------|---------------------|
| **Product rotation** | GET /analysis/product-rotation | Total quantity sold per product (from order_items). |
| **Hot products** | GET /analysis/hot-products | Top products by quantity ordered. |
| **Dead stock** | GET /analysis/dead-stock | Products with inventory, last sale date, days without sales, inventory value, sales_last_30/90_days, rotation rate, category (FAST_MOVING/SLOW_MOVING/DEAD_STOCK). |
| **Dead stock space** | GET /analysis/dead-stock-space | Physical space (dm³) by category and top products by occupied volume. |
| **Pick density** | GET /analysis/pick-density | Order quantity grouped by location (order_items → inventory → location). |
| **Product pairs** | GET /analysis/product-pairs | Products bought together (same order). |
| **Hot locations** | GET /analysis/hot-locations | SUM(quantity) per location from order_items via inventory. |
| **Batch picking** | GET /analysis/batch-picking | Total picks per product from order_items. |
| **Walking cost** | GET /analysis/walking-cost | Estimated travel per order (graph-based distance, distinct locations, total items). |
| **Sales forecast** | GET /analysis/sales-forecast/{warehouse_id}, /analysis/product-forecast/{product_id} | History + forecast (e.g. 14-day MA, weekday seasonality). |
| **Pick route simulation** | GET /analysis/pick-route/{order_number} | Shortest route for one order: START → pick locations → PACKING; uses inventory locations and graph nodes; distance = Euclidean between consecutive nodes. |
| **Batch pick route** | POST /analysis/pick-route/batch/, POST /analysis/pick-route/batch | Batch simulation (by order numbers or order_ids); returns debug/counts. |
| **Slotting** | GET /analysis/slotting | Products ranked by velocity / (distance_to_packing + 1); identifies products to move closer to packing. |
| **Warehouse map** | Warehouse graph + locations | Visualization of nodes, edges, locations (frontend). |

Slotting is implemented; “planned” in the list below refers to further optimization (e.g. auto-suggest moves). Heatmap can be built from hot locations and map.

---

## SECTION 10 — PICK ROUTE SIMULATION

How it works:

1. **Load order** — By external `order_number` (orders.number).
2. **Load order_items** — For that order (product_id, quantity).
3. **Find product locations** — From **inventory** only (warehouse + tenant + product_ids, quantity > 0). Build product_id → location_id. No use of product.assigned_locations.
4. **Map locations to graph nodes** — Via location_nodes / Location.graph_node_id; get (node_id, x, y) per location.
5. **Get START and PACKING** — From special locations (PICK_START, PACKING); coordinates for start/end.
6. **Calculate route** — Visit order: START → pick nodes (nearest-neighbor by Euclidean distance) → PACKING.
7. **Distance** — Sum of **Euclidean** distances between consecutive nodes (in meters; coordinates in cm converted to m). Not graph pathfinding (Dijkstra) along edges for this route.
8. **Response** — route, pick_locations, total_distance, estimated_time, order_number, order_id, order_found, inventory_locations, mapped_nodes_count, warnings (e.g. "product {id} has assigned location but no inventory record").

---

## SECTION 11 — CURRENT KNOWN LIMITATIONS

- **assigned_locations vs inventory** — Resolved: analytics use only inventory; product update can sync assigned_locations to inventory. If a product has assigned_locations but no inventory, pick route returns a warning.
- **Capacity** — Location table has no max_volume, max_weight, or bin_capacity. Capacity exists on PickingZone, StorageBin (map), Cart; not on the main Location used for inventory.
- **Distance** — Pick route uses **Euclidean** distance between nodes, not shortest path along graph edges (Dijkstra). Walking-cost uses graph edges.
- **Stock moves** — Putaway and internal moves (e.g. location-to-location) are not fully implemented as a dedicated workflow; import and product sync update inventory.
- **Batch pick route** — POST /analysis/pick-route/batch/ returns debug (orders_found, order_items, order_numbers); full route aggregation per order can be extended.

---

## SECTION 12 — FUTURE FEATURES

- **Slotting optimization** — Algorithm to suggest or apply product moves (already have slotting analysis; automation/apply moves is future).
- **Batch picking simulation** — Full multi-order route and timing (batch endpoint exists; extend with routes and distance).
- **Warehouse heatmap** — Visual heatmap of pick frequency by location (data exists: hot locations).
- **Distance optimization** — Use graph pathfinding (Dijkstra) for pick route instead of Euclidean, or hybrid.
- **Putaway recommendations** — Use assigned_locations and slotting to suggest putaway location on receive.

---

## SECTION 13 — SAMPLE DATA

### Product (API response shape)

```json
{
  "id": 1,
  "tenant_id": 1,
  "name": "Product A",
  "ean": "5901234123457",
  "symbol": "PRD-A",
  "length": 20.0,
  "width": 15.0,
  "height": 10.0,
  "weight": 1.5,
  "volume": 3.0,
  "assigned_locations": [{"locationAddress": "A1-01-01", "quantity": 10}],
  "purchase_price": 5.99,
  "sale_price": 12.99
}
```

### Inventory (conceptual)

```json
{
  "product_id": 1,
  "warehouse_id": 1,
  "location_id": 5,
  "quantity": 10.0
}
```

(API may return inventory as list or nested; structure is product_id, warehouse_id, location_id, quantity.)

### Order (conceptual)

```json
{
  "id": 1,
  "tenant_id": 1,
  "warehouse_id": 1,
  "number": "4992",
  "order_date": "2025-03-01T10:00:00",
  "status": "NEW",
  "items": [
    { "order_id": 1, "product_id": 1, "quantity": 2 }
  ]
}
```

### Location (conceptual)

```json
{
  "id": 5,
  "warehouse_id": 1,
  "name": "A1-01-01",
  "type": "pick",
  "location_type": "NORMAL",
  "x": 150.0,
  "y": 200.0,
  "z": 0.0,
  "width": 40.0,
  "depth": 60.0,
  "height": 50.0
}
```

### Pick route simulation (GET /analysis/pick-route/4992)

```json
{
  "warehouse_id": 1,
  "route": [
    {"node_id": 1, "x": 0, "y": 0},
    {"node_id": 2, "x": 500, "y": 200},
    {"node_id": 3, "x": 1000, "y": 300}
  ],
  "start": {"x": 0, "y": 0},
  "end": {"x": 1000, "y": 300},
  "pick_locations": [
    {
      "location_id": 5,
      "location_name": "A1-01-01",
      "x": 150,
      "y": 200,
      "inventory_location": "A1-01-01",
      "inventory_location_coordinates": [150, 200]
    }
  ],
  "total_distance": 12.5,
  "estimated_time": 8.9,
  "order_number": "4992",
  "order_id": 1,
  "order_found": true,
  "order_items": 1,
  "inventory_locations": 1,
  "mapped_nodes_count": 1,
  "warnings": []
}
```

---

## SECTION 14 — SUMMARY

- **Goal:** Scalable warehouse management and optimization platform: multi-tenant, inventory and orders, picking (carts, waves, tasks), and analytics (value, dead stock, forecast, walking cost, pick route, slotting).
- **Backend:** FastAPI + SQLAlchemy + SQLite; routers per domain; services for business logic; analytics use only inventory + location (no assigned_locations).
- **Frontend:** React + TypeScript + Vite; pages for analysis, warehouse map, products, orders, carts, waves; Axios to backend.
- **Data:** Tenant → Warehouses, Products, Locations, Inventory (actual stock), Orders/OrderItems; warehouse graph (nodes, edges, location_nodes) for routes; carts/waves/pick tasks for execution.
- **Conventions:** assigned_locations = configuration; inventory = actual stock position. All analytics read from inventory joined with location. Pick route: order by number → inventory locations → graph nodes → Euclidean route START → picks → PACKING.

This context should be enough for another AI or developer to continue feature work, fix bugs, or add new analytics without re-reading the entire repo.
