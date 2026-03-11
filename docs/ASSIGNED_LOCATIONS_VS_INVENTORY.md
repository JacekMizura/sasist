# Assigned Locations vs Inventory: Configuration vs Actual Stock

## Summary

- **`product.assigned_locations`** = **configuration** (planned or default storage locations).
- **`inventory.location_id`** (joined with **`location`** table) = **actual stock position**.

All warehouse analytics (pick route simulation, slotting, heatmap, walking cost, etc.) use **inventory** only. They do **not** use `assigned_locations` for location resolution.

---

## assigned_locations (configuration)

- **What it is:** A product-level JSON field storing planned or configured storage locations (e.g. `[{"locationAddress": "A1-1-1", "quantity": 10}]`).
- **Where it is used:**
  - **Product configuration** — When editing a product in the UI, assigned locations are saved and can be used to **synchronize** inventory (see below).
  - **Putaway suggestion** — Suggested default storage when receiving or putaway (e.g. wave service, import).
  - **Default storage location** — E.g. during import, if inventory is created at "Import" and the product has assigned_locations, stock can be moved to the first assigned location.

Analytics **must not** use `assigned_locations` to determine where product is stored. Configuration may be out of date or not yet applied.

---

## inventory (actual stock position)

- **What it is:** Table `inventory` with `product_id`, `warehouse_id`, `location_id`, `quantity`. Joined with `location` for name and coordinates.
- **Where it is used:**
  - **All analytics** — Pick route simulation, slotting, hot locations, walking cost, pick density, etc. read product locations only from **inventory** joined with **location**.
  - **Truth for “where is the stock”** — Only inventory defines the real position of stock.

If a product has no inventory row (or zero quantity), analytics will not show it at any location, even if `assigned_locations` is set.

---

## When product has assigned_locations but no inventory

If an order (or analytics) references a product that has **assigned_locations** set but **no inventory record** (or no stock in the relevant warehouse), the system may return a warning:

- **"product {id} has assigned location but no inventory record"**

This indicates configuration exists but actual stock position is missing — e.g. stock not yet received or inventory not synced after editing assigned locations.

---

## Syncing configuration to inventory

When you save **assigned_locations** on a product (e.g. via PUT `/products/{id}/`), the API can **synchronize** inventory: create or update inventory rows so that actual stock locations and quantities match the assigned locations. After that, analytics will use those inventory rows and show the correct positions.

See product API and changelog for: *Product location assignment now updates inventory stock locations.*
