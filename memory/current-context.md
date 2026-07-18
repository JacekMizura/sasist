# current-context

## Active

Capacity Engine implemented as SSOT (`backend/services/cart_capacity/`).
Cart.status lifecycle unchanged (5 values). Occupancy is computed only.

## Next (ops)

Deploy → `ensure_cart_capacity_columns` migrates `capacity_mode`/`max_orders` → strategy fields.
Smoke: cart list shows `capacity` snapshot; picking/start uses engine select_orders.
