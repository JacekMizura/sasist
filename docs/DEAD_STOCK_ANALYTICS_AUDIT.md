# Dead Stock / Zalegający towar — Analytics Audit

**Date:** 2026-03-08  
**Scope:** Analysis of "Zalegający towar" and (from redesign) full inventory aging implementation.

---

## Redesign Implemented (Inventory Aging)

The dead-stock endpoint has been **extended** (not replaced) to support a full **inventory aging** report. The same endpoint `GET /analysis/dead-stock/` now returns the structure below.

### New response shape

- **`items`** — Array of product rows (see below). Sorted by `days_since_last_sale` DESC, then `inventory_value` DESC (expensive dead stock first).
- **`summary`** — Aggregated inventory value by category:
  - `fast_moving_value`, `slow_moving_value`, `dead_stock_value`, `total_inventory_value` — Same as before.
  - **`fast_percentage`**, **`slow_percentage`**, **`dead_percentage`** — Share of total inventory value per category (0–100). Formula: `category_value / total_inventory_value × 100`. If `total_inventory_value` is 0, all are 0.

### New metrics (per item)

| Field | Description | Source |
|--------|-------------|--------|
| **last_sale_date** | Date of last sale (ISO string or null if never sold). | `MAX(COALESCE(orders.order_date, orders.created_at))` from orders + order_items, grouped by product_id. |
| **days_since_last_sale** | Integer days from last_sale_date to now. | `current_date - last_sale_date`. Null if never sold. |
| **inventory_value** | Monetary value of stock. | `inventory_quantity * products.purchase_price`; if `purchase_price` is NULL, treated as 0. |
| **sales_last_30_days** | Quantity sold in last 30 days. | `SUM(order_items.quantity)` where order date (COALESCE(order_date, created_at)) &gt;= today − 30. |
| **sales_last_90_days** | Quantity sold in last 90 days. | Same with 90-day window. |
| **rotation_rate** | Sales vs stock. | `sales_last_90_days / inventory_quantity`; 0 if quantity = 0. |
| **category** | Aging bucket. | **FAST_MOVING** — days_since_last_sale &lt; 30. **SLOW_MOVING** — 30–90. **DEAD_STOCK** — &gt; 90 or never sold. |
| **product_value_share** | Product’s share of total inventory value (0–1). | `inventory_value / total_inventory_value`. If total is 0, 0. Used for “% magazynu” (display as × 100). |

### Category value percentages (summary)

- **fast_percentage** = `fast_moving_value / total_inventory_value × 100` (0 if total is 0).
- **slow_percentage** = `slow_moving_value / total_inventory_value × 100`.
- **dead_percentage** = `dead_stock_value / total_inventory_value × 100`.

Frontend shows these next to category totals (e.g. “5533 zł (31%)”).

### Backward compatibility

- Each item still includes **`days_without_sales`**: it is the **actual** `days_since_last_sale` when known, or the request parameter `days` when the product never sold (so legacy consumers still get a number).
- Tables used unchanged: **orders**, **order_items**, **products**, **inventory**. No schema changes.

### Example response (after redesign)

```json
{
  "items": [
    {
      "product_id": 42,
      "product_name": "Produkt ABC",
      "inventory_quantity": 150.0,
      "inventory_value": 1575.00,
      "product_value_share": 0.5122,
      "last_sale_date": "2025-11-20T10:00:00",
      "days_since_last_sale": 108,
      "days_without_sales": 108,
      "sales_last_30_days": 0,
      "sales_last_90_days": 0,
      "rotation_rate": 0.0,
      "category": "DEAD_STOCK"
    }
  ],
  "summary": {
    "fast_moving_value": 1000.00,
    "slow_moving_value": 500.00,
    "dead_stock_value": 1575.00,
    "total_inventory_value": 3075.00,
    "fast_percentage": 32.52,
    "slow_percentage": 16.26,
    "dead_percentage": 51.22
  }
}
```

Each item also includes **product_value_share** (decimal 0–1), e.g. `0.0134` for 1.34% of total warehouse value.

---

## Original Audit (Pre-Redesign) — STEP 1 — Current Implementation

### Location

| Component | Path |
|-----------|------|
| **API endpoint** | `backend/api/analysis.py` |
| **Service** | `backend/services/analytics_service.py` |
| **Frontend page** | `frontend/src/pages/Analysis/DeadStockPage.tsx` |
| **API client** | `frontend/src/api/analysisApi.ts` (`getDeadStock`, `DeadStockItem`) |

### API

- **Method/URL:** `GET /analysis/dead-stock/`
- **Query parameters:**
  - `tenant_id` (required)
  - `days` (optional, default 90, range 1–365) — "Days without sales" window
- **Handler:** `get_dead_stock(warehouse_id, db)` → calls `dead_stock(db, tenant_id, days=days)`

### Keywords

- **dead_stock** — present in `analytics_service.py` and `analysis.py`.
- **slow_moving**, **aging_inventory**, **stock_rotation** — not used anywhere in this module.

---

## STEP 2 — Current Query Logic

### Exact logic (SQLAlchemy)

**1. Set of product IDs that had at least one sale in the last `days` days**

```python
since = datetime.utcnow() - timedelta(days=days)
sold_ids_subq = (
    db.query(OrderItem.product_id)
    .join(Order, OrderItem.order_id == Order.id)
    .filter(
        Order.tenant_id == tenant_id,
        Order.order_date.isnot(None),   # ← orders with NULL order_date excluded
        Order.order_date >= since,
    )
    .distinct()
)
sold_ids = {r[0] for r in sold_ids_subq.all()}
```

**2. Products with total inventory quantity > 0 (per tenant)**

```python
inv_totals = (
    db.query(Inventory.product_id, func.sum(Inventory.quantity).label("qty"))
    .filter(Inventory.tenant_id == tenant_id)
    .group_by(Inventory.product_id)
    .having(func.sum(Inventory.quantity) > 0)
    .all()
)
```

**3. Dead stock = products in inventory (with qty > 0) that are NOT in `sold_ids`**

```python
dead_product_ids = [p for p, _ in inv_totals if p not in sold_ids]
```

**4. Enrich with product names and quantities**

- Product names from `Product.id`, `Product.name` for `dead_product_ids`.
- Quantities from `inv_totals` for those same IDs.

### Fields used

| Source | Field | Purpose |
|--------|--------|--------|
| **Order** | `tenant_id` | Filter by tenant |
| **Order** | `order_date` | Only orders with `order_date IS NOT NULL` and `order_date >= since` count as "sold" |
| **OrderItem** | `product_id` | Which product was sold |
| **Inventory** | `tenant_id` | Filter by tenant |
| **Inventory** | `product_id` | Group by product |
| **Inventory** | `quantity` | Sum per product; keep only `SUM(quantity) > 0` |
| **Product** | `id` | Join |
| **Product** | `name` | Display as `product_name` |

### Important behavior

- **Last sale date is not computed.** The code only answers: "Did this product have any sale in the last N days?" (yes/no). So:
  - There is no `last_sale_date` per product.
  - There is no real `days_since_last_sale`; the API returns the **parameter** `days` as `days_without_sales` for every row (e.g. 90 for all).
- **Date source:** Only `Order.order_date` is used. Orders with `order_date = NULL` are excluded. The rest of the codebase (e.g. sales forecast, daily volume) uses `COALESCE(order_date, created_at)`; dead stock does not, so orders with a null `order_date` but valid `created_at` are not considered as sales.

---

## STEP 3 — Data Sources

### Tables used by dead stock

| Table | Fields used | Role |
|-------|-------------|------|
| **orders** | `id`, `tenant_id`, `order_date` | Filter orders in "last N days"; only non-null `order_date`. |
| **order_items** | `order_id`, `product_id` | Link orders to products sold. |
| **inventory** | `tenant_id`, `product_id`, `quantity` | Total stock per product per tenant; only products with sum(quantity) > 0. |
| **products** | `id`, `name` | Resolve product_id to name. |

### Tables not used (but exist and could be relevant)

| Table | Relevant fields | Note |
|-------|------------------|------|
| **products** | `purchase_price`, `sale_price` | Not used; would allow inventory value and value-based aging. |
| **inventory_units** | quantity, product, etc. | Not used; analytics_service is designed to work with `inventory` only when picks/inventory_units are empty. |
| **stock** | quantity, product_id | Not used. |
| **stock_movement** / **inventory_movement** | — | Not used; could support movement-based aging. |

---

## STEP 4 — Product Sales History (Last Sale Date)

### How it is done today

- **Last sale date is not calculated.** The implementation only builds the set of product IDs that had **any** sale in the last `days` days.
- So there is no:
  - `MAX(order_date)` per product
  - `last_sale_date`
  - True `days_since_last_sale` (only the input `days` is returned for every dead-stock row).

### How it could be done (for redesign)

Using the same source (orders + order_items), last sale per product could be:

```sql
-- Concept (date from COALESCE(order_date, created_at) for consistency)
SELECT
  oi.product_id,
  MAX(COALESCE(o.order_date, o.created_at)) AS last_sale_date,
  (julianday('now') - julianday(MAX(COALESCE(o.order_date, o.created_at)))) AS days_since_last_sale
FROM order_items oi
JOIN orders o ON oi.order_id = o.id
WHERE o.tenant_id = ?
GROUP BY oi.product_id
```

Equivalent in SQLAlchemy: group by `OrderItem.product_id`, take `func.max(func.coalesce(Order.order_date, Order.created_at))`, then compute days since that date.

### Sample output shape (if implemented)

| product_id | last_sale_date | days_since_last_sale |
|------------|----------------|----------------------|
| 101 | 2025-11-20 10:00:00 | 108 |
| 102 | 2025-12-01 14:30:00 | 97 |

---

## STEP 5 — Inventory Value

### Current state

- **Dead stock does not compute or return inventory value.**
- It returns only: `product_id`, `product_name`, `inventory_quantity`, `days_without_sales`.

### Data available for value

- **products.purchase_price** — `Numeric(10,2)`, nullable. Present and used elsewhere (tenant/warehouse inventory value, import).
- **inventory.quantity** — used by dead_stock; sum per product is already computed.

So **inventory_value = SUM(inventory.quantity) × product.purchase_price** (or sum over locations: sum of `quantity * purchase_price` per row) can be computed without new tables. If `purchase_price` is NULL, value can be reported as 0 or NULL.

### Existing pattern in codebase

- `backend/api/warehouses.py`: `_warehouse_inventory_value` uses `Inventory.quantity * Product.purchase_price` (when inventory_units path is not used).
- `backend/api/tenant.py`: `_tenant_inventory_value` uses the same for the legacy inventory path.

Dead stock could reuse the same formula (quantity × purchase_price) per product.

---

## STEP 6 — Rotation Metrics

### sales_last_30_days / sales_last_90_days

- **Not implemented** in the dead stock module.
- No aggregation of quantity sold in last 30 or 90 days per product.

### Data available

- **order_items.quantity** + **orders** (with date) allow:
  - `SUM(OrderItem.quantity)` per product where `COALESCE(Order.order_date, Order.created_at)` in last 30 / 90 days.
- So **sales_last_30_days** and **sales_last_90_days** can be added without new tables.

### Rotation rate (concept)

- Could be defined e.g. as `sales_last_90_days / average_inventory` or similar. Average inventory would require either snapshot data or current inventory as a proxy; current **inventory.quantity** (sum per product) is available.

---

## STEP 7 — Output Format (Legacy vs Current)

### Current response (after redesign)

The API now returns an **object** with `items` and `summary`; see the "Redesign Implemented" section at the top for the full shape and metrics.

### Legacy example (pre-redesign; list-only)

```json
[
  {
    "product_id": 42,
    "product_name": "Produkt ABC",
    "inventory_quantity": 150.0,
    "days_without_sales": 90
  },
  {
    "product_id": 88,
    "product_name": "Produkt XYZ",
    "inventory_quantity": 25.5,
    "days_without_sales": 90
  }
]
```

### Frontend type (`DeadStockItem`)

```ts
{
  product_id: number;
  product_name?: string;
  inventory_quantity: number;
  days_without_sales: number;
}
```

### Note (legacy)

- Previously, `days_without_sales` was always equal to the request parameter `days`. After the redesign, it is the **actual** days since last sale when known, or the request parameter when the product never sold.

---

## STEP 8 — Missing Metrics

| Metric | Status | Data available? | Notes |
|--------|--------|------------------|-------|
| **last_sale_date** | Missing | Yes | From `MAX(COALESCE(order_date, created_at))` per product via orders + order_items. |
| **days_since_last_sale** | Not real | Yes | Derive from last_sale_date. |
| **inventory_value** | Missing | Yes | `inventory.quantity`, `products.purchase_price`. |
| **sales_last_30_days** | Missing | Yes | Sum order_items.quantity for orders in last 30 days per product. |
| **sales_last_90_days** | Missing | Yes | Same for 90 days. |
| **rotation_rate** | Missing | Partially | Can use sales_last_90_days and current inventory; "average inventory" would need snapshots or approximation. |
| **days_of_stock** | Missing | Partially | Could be inventory / (sales per day), using sales_last_30_days or 90_days; need to define period and formula. |

All of the above can be supported with existing tables: **orders**, **order_items**, **inventory**, **products**.

---

## STEP 9 — Database Sample (Structure)

Actual sample rows depend on database content. Below is the **structure** that the current implementation and a possible extended query would produce.

### Current API (conceptual 10 rows)

| product_id | product_name | inventory_quantity | days_without_sales |
|------------|--------------|--------------------|--------------------|
| 101 | Produkt A | 120.0 | 90 |
| 102 | Produkt B | 45.5 | 90 |
| 103 | Produkt C | 200.0 | 90 |
| … | … | … | 90 |

(All `days_without_sales` values are the same as the `days` parameter.)

### Extended sample (after redesign; example shape)

| product_id | product_name | inventory_quantity | purchase_price | last_sale_date | days_since_last_sale | inventory_value | sales_last_30_days | sales_last_90_days |
|------------|--------------|--------------------|----------------|----------------|----------------------|----------------|--------------------|---------------------|
| 101 | Produkt A | 120.0 | 10.50 | 2025-11-20 10:00 | 108 | 1260.00 | 0 | 0 |
| 102 | Produkt B | 45.5 | 25.00 | 2025-12-01 14:30 | 97 | 1137.50 | 0 | 0 |

To get **real** sample data from your DB you can:

1. Call `GET /analysis/dead-stock/?tenant_id=1&days=90` and take the first 10 items.
2. Or run a SQL query joining products, inventory (sum quantity), and optionally orders/order_items for last_sale_date and sales counts.

---

## STEP 10 — Final Summary

### 1. What the current dead stock analysis does

- **Input:** `tenant_id`, `days` (e.g. 90).
- **Logic:**
  - Builds the set of product IDs that had at least one order line in an order with **non-null** `order_date` and `order_date >= (now - days)`.
  - Finds products with **total inventory quantity > 0** for that tenant.
  - Returns products that are in the second set but not in the first ("inventory but no sales in last N days").
- **Output:** List of `product_id`, `product_name`, `inventory_quantity`, and `days_without_sales` (always equal to the requested `days`).
- **Limitations:**
  - No per-product last sale date or true days since last sale.
  - Uses only `order_date`; orders with NULL `order_date` are ignored (inconsistency with COALESCE(order_date, created_at) elsewhere).
  - No inventory value, no sales in 30/90 days, no rotation or days-of-stock metrics.

### 2. Important metrics that are missing

- **last_sale_date** and **days_since_last_sale** (actual).
- **inventory_value** (quantity × purchase_price).
- **sales_last_30_days**, **sales_last_90_days**.
- **rotation_rate** and **days_of_stock** (with clear definitions).

### 3. Data that already exists to improve it

- **orders**: `order_date`, `created_at`, `tenant_id` — for sale date and filtering.
- **order_items**: `product_id`, `quantity` — for sales volume and last sale.
- **inventory**: `tenant_id`, `product_id`, `quantity` — for stock level and value (with price).
- **products**: `id`, `name`, `purchase_price` — for naming and inventory value.

No new tables are required to add the above metrics; only query logic and possibly response shape need to be extended.

### 4. What would be needed for a proper inventory aging analysis

- **Unified sale date:** Use `COALESCE(order_date, created_at)` for "sale date" so all orders with a date are considered.
- **Per-product last sale:** `MAX(sale_date)` per product from orders + order_items; then **days_since_last_sale** from that to today.
- **Inventory value:** For each product in scope, sum `inventory.quantity * product.purchase_price` (with NULL-safe handling).
- **Sales in windows:** `SUM(order_items.quantity)` per product for last 30 and 90 days (using the same sale date).
- **Optional:** Rotation rate (e.g. sales_last_90_days / avg_or_current_inventory), days of stock (e.g. inventory / daily_sales_rate), and filters (e.g. min inventory value, min days without sales).
- **Optional:** Warehouse-level breakdown (inventory and sales per warehouse) if dead stock should be analyzed per warehouse; current logic is tenant-level only.
- **Backward compatibility:** If the API keeps returning `days_without_sales`, consider making it the **actual** days since last sale (or document that it is the filter parameter).

---

## STEP 11 — Output

This report is saved as **`docs/DEAD_STOCK_ANALYTICS_AUDIT.md`**.

No code has been modified; this is analysis only.
