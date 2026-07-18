"""Activity Log catalog — object types, categories, Polish helpers."""

from __future__ import annotations

from typing import Literal

ObjectType = Literal[
    "cart",
    "order",
    "basket",
    "rack",
    "carrier",
    "product",
    "operator",
    "document",
    "return",
    "production",
]

Category = Literal[
    "picking",
    "packing",
    "status",
    "capacity",
    "assignment",
    "system",
    "shipping",
    "cancel",
]

Severity = Literal["INFO", "SUCCESS", "WARNING", "ERROR", "AUDIT"]

# cart lifecycle event_code → activity category
CART_EVENT_CATEGORY: dict[str, Category] = {
    "cart_claimed": "assignment",
    "picking_started": "picking",
    "first_product_confirmed": "picking",
    "picking_finished": "picking",
    "packing_started": "packing",
    "order_packed": "packing",
    "packing_finished": "packing",
    "cart_released": "system",
    "cart_auto_released_idle": "system",
    "picking_cancelled": "cancel",
    "picking_resumed": "picking",
    "cart_transferred": "assignment",
    "reservation_timed_out": "system",
    "double_claim_attempt": "assignment",
    "orders_assigned": "assignment",
    "order_added": "assignment",
    "capacity_blocked": "capacity",
    "basket_assigned": "assignment",
}
