# Warehouse Space Analytics — Dead Stock Space Usage

This document describes the **Dead Stock Space Usage** analysis: how much physical warehouse space (volume) is occupied by fast-moving, slow-moving, and dead stock. No database schema changes are required; it uses existing tables only.

---

## Goal

- Calculate physical warehouse space (in **dm³**) occupied by inventory, split by rotation category (fast / slow / dead).
- Support later visualization: stacked bar chart of space usage and a list of the biggest space-consuming dead-stock products.

---

## API

- **Endpoint:** `GET /analysis/dead-stock-space`
- **Query parameters:**
  - `warehouse_id` (required) — Warehouse to analyze.
  - `tenant_id` (required) — Tenant (for inventory and last-sale logic).
  - `limit` (optional, default 50, max 200) — Number of top products by occupied volume returned.

- **Response shape:**

```json
{
  "totals": {
    "total_volume": 12500.5,
    "fast_volume": 3000.0,
    "slow_volume": 2500.0,
    "dead_volume": 7000.5,
    "fast_percentage": 24.0,
    "slow_percentage": 20.0,
    "dead_percentage": 56.0
  },
  "products": [
    {
      "product_id": 42,
      "product_name": "Produkt ABC",
      "quantity": 100.0,
      "product_volume": 20.5,
      "occupied_volume": 2050.0,
      "days_since_last_sale": 120,
      "category": "DEAD_STOCK"
    }
  ]
}
```

---

## Data Sources

| Table       | Fields used | Purpose |
|------------|-------------|--------|
| **products** | `id`, `name`, `volume`, `length`, `width`, `height` | Product volume per unit (dm³); name for display. |
| **inventory** | `product_id`, `quantity`, `warehouse_id`, `tenant_id` | Stock in the warehouse; only rows with `quantity > 0`. |
| **orders**    | `id`, `tenant_id`, `order_date`, `created_at` | Sale date for last-sale and categories. |
| **order_items** | `order_id`, `product_id`, `quantity` | Links orders to products sold. |

No other tables (e.g. `inventory_units`, `stock`, `locations`) are used for this analysis.

---

## Formulas

### 1. Product volume (dm³ per unit)

- **Preferred:** `products.volume` (assumed stored in dm³).
- **If `volume` is NULL or ≤ 0:**  
  `product_volume_dm3 = (length × width × height) / 1000`  
  with `length`, `width`, `height` in **cm** (result in dm³). If any dimension is missing or ≤ 0, product volume is treated as 0.

So:

- `product_volume = volume` if `volume > 0`, else derived from dimensions, else 0.

### 2. Inventory quantity (per product, per warehouse)

- From **inventory** filtered by `warehouse_id` and `tenant_id`, `quantity > 0`.
- **Quantity per product:**  
  `quantity = SUM(inventory.quantity)`  
  grouped by `product_id`.

### 3. Occupied volume (per product)

- **occupied_volume = inventory_quantity × product_volume_dm3**  
  Example: 100 pcs × 0.2 dm³ = 20 dm³.  
  All volumes in dm³.

### 4. Last sale date

- Reuses the same logic as the dead-stock (inventory aging) analysis:
  - **Sale date** of an order: `COALESCE(orders.order_date, orders.created_at)`.
  - **Last sale per product:**  
    `last_sale_date = MAX(sale_date)` over all order lines (order_items) for that product and tenant.
- **days_since_last_sale:**  
  `current_date - last_sale_date` (in days).  
  If the product has never been sold, `days_since_last_sale` is `null`.

### 5. Category (rotation bucket)

- **FAST_MOVING** — `days_since_last_sale < 30`
- **SLOW_MOVING** — `30 ≤ days_since_last_sale ≤ 90`
- **DEAD_STOCK** — `days_since_last_sale > 90` or no sales (null)

### 6. Totals (warehouse-level)

- **total_volume** = sum of `occupied_volume` over all products in the warehouse (with inventory > 0).
- **fast_volume** = sum of `occupied_volume` for products in category FAST_MOVING.
- **slow_volume** = sum of `occupied_volume` for products in category SLOW_MOVING.
- **dead_volume** = sum of `occupied_volume` for products in category DEAD_STOCK.

Check: `total_volume = fast_volume + slow_volume + dead_volume`.

### 7. Percentages

- **fast_percentage** = `100 × fast_volume / total_volume` (0 if total_volume = 0).
- **slow_percentage** = `100 × slow_volume / total_volume`.
- **dead_percentage** = `100 × dead_volume / total_volume`.

### 8. Top space consumers

- **products** list: all products with inventory in the warehouse, each with:
  - `product_id`, `product_name`, `quantity`, `product_volume`, `occupied_volume`, `days_since_last_sale`, `category`.
- Sorted by **occupied_volume DESC**.
- Returned count limited by **limit** (default 50, max 200).

Totals and percentages are computed over **all** products in the warehouse with stock; the **products** array is only the top N by occupied volume.

---

## Implementation

- **Service:** `backend/services/analytics_service.py` — function `dead_stock_space(db, warehouse_id, tenant_id, limit=50)`.
- **API:** `backend/api/analysis.py` — `GET /analysis/dead-stock-space` with `warehouse_id`, `tenant_id`, `limit`.

---

## Future frontend (not implemented yet)

Planned visualizations:

1. **Stacked bar chart** of warehouse space usage: fast / slow / dead volume (or percentages).
2. **List/table** of the biggest space-consuming dead-stock products (using the `products` array, optionally filtered by `category === "DEAD_STOCK"`).
