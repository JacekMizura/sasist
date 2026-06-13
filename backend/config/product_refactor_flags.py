"""
Feature flags for gradual rollout of product ↔ inventory behavior changes.

All flags default to FALSE when the environment variable is unset or invalid.
Set to "1", "true", "yes" (case-insensitive) to enable.
"""

from __future__ import annotations

import os


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


# When True: PUT/PATCH with assigned_locations does not call inventory sync (JSON still saved).
disable_assigned_locations_inventory_sync: bool = _env_bool(
    "DISABLE_ASSIGNED_LOCATIONS_INVENTORY_SYNC", default=False
)

# When True: stock_quantity on product update does not write Inventory rows (use inventory API).
disable_stock_quantity_inventory_write: bool = _env_bool(
    "DISABLE_STOCK_QUANTITY_INVENTORY_WRITE", default=False
)

# When True: POST .../apply-assigned-locations-to-inventory may run explicit legacy sync.
enable_legacy_bridge_apply_plan: bool = _env_bool(
    "ENABLE_LEGACY_BRIDGE_APPLY_PLAN", default=False
)

# When True: wave location_clustering may read products.assigned_locations only when
# product_warehouse_slotting has no rows for that product+warehouse (pre-backfill safety).
wave_clustering_legacy_assigned_locations_fallback: bool = _env_bool(
    "WAVE_CLUSTERING_LEGACY_ASSIGNED_LOCATIONS_FALLBACK", default=True
)
