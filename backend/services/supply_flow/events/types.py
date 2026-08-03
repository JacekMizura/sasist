"""Supply Flow domain event types (published by WMS; consumed only by Dispatcher)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

# Canonical event types (ETAP 3A).
EVENT_NEW_DELIVERY = "NEW_DELIVERY"
EVENT_DELIVERY_PHASE_CHANGED = "DELIVERY_PHASE_CHANGED"
EVENT_UNLOAD_STARTED = "UNLOAD_STARTED"
EVENT_UNLOAD_FINISHED = "UNLOAD_FINISHED"
EVENT_PUTAWAY_STARTED = "PUTAWAY_STARTED"
EVENT_PUTAWAY_FINISHED = "PUTAWAY_FINISHED"
EVENT_EXECUTION_CANCELLED = "EXECUTION_CANCELLED"
EVENT_EXECUTION_FAILED = "EXECUTION_FAILED"
EVENT_ORDER_CREATED = "ORDER_CREATED"
EVENT_ORDER_CANCELLED = "ORDER_CANCELLED"
EVENT_RECOVERY_CHANGED = "RECOVERY_CHANGED"
EVENT_CAPACITY_CHANGED = "CAPACITY_CHANGED"
EVENT_CROSS_DOCK_FREED = "CROSS_DOCK_FREED"
EVENT_OPERATOR_FINISHED = "OPERATOR_FINISHED"
EVENT_ETA_CHANGED = "ETA_CHANGED"
EVENT_CONFIG_CHANGED = "CONFIG_CHANGED"
EVENT_MANUAL_RECOMPUTE = "MANUAL_RECOMPUTE"

SUPPLY_FLOW_EVENT_TYPES: tuple[str, ...] = (
    EVENT_NEW_DELIVERY,
    EVENT_DELIVERY_PHASE_CHANGED,
    EVENT_UNLOAD_STARTED,
    EVENT_UNLOAD_FINISHED,
    EVENT_PUTAWAY_STARTED,
    EVENT_PUTAWAY_FINISHED,
    EVENT_EXECUTION_CANCELLED,
    EVENT_EXECUTION_FAILED,
    EVENT_ORDER_CREATED,
    EVENT_ORDER_CANCELLED,
    EVENT_RECOVERY_CHANGED,
    EVENT_CAPACITY_CHANGED,
    EVENT_CROSS_DOCK_FREED,
    EVENT_OPERATOR_FINISHED,
    EVENT_ETA_CHANGED,
    EVENT_CONFIG_CHANGED,
    EVENT_MANUAL_RECOMPUTE,
)

# Lower number = higher priority when collapsing a warehouse batch.
EVENT_PRIORITY: dict[str, int] = {
    EVENT_UNLOAD_FINISHED: 10,
    EVENT_PUTAWAY_FINISHED: 15,
    EVENT_UNLOAD_STARTED: 16,
    EVENT_PUTAWAY_STARTED: 17,
    EVENT_EXECUTION_FAILED: 18,
    EVENT_EXECUTION_CANCELLED: 19,
    EVENT_ORDER_CREATED: 20,
    EVENT_ORDER_CANCELLED: 25,
    EVENT_RECOVERY_CHANGED: 30,
    EVENT_NEW_DELIVERY: 40,
    EVENT_DELIVERY_PHASE_CHANGED: 50,
    EVENT_CROSS_DOCK_FREED: 55,
    EVENT_CAPACITY_CHANGED: 60,
    EVENT_OPERATOR_FINISHED: 70,
    EVENT_ETA_CHANGED: 80,
    EVENT_CONFIG_CHANGED: 90,
    EVENT_MANUAL_RECOMPUTE: 100,
}

# Map domain event → recompute trigger code (engine input).
# Start / cancel / fail are monitor-only (no Engine recompute).
EVENT_TO_RECOMPUTE_TRIGGER: dict[str, str] = {
    EVENT_NEW_DELIVERY: "NEW_DELIVERY",
    EVENT_DELIVERY_PHASE_CHANGED: "PHASE_CHANGED",
    EVENT_UNLOAD_FINISHED: "UNLOAD_FINISHED",
    EVENT_PUTAWAY_FINISHED: "PUTAWAY_FINISHED",
    EVENT_ORDER_CREATED: "NEW_ORDER",
    EVENT_ORDER_CANCELLED: "ORDER_CANCELLED",
    EVENT_RECOVERY_CHANGED: "RECOVERY_CHANGED",
    EVENT_CAPACITY_CHANGED: "CAPACITY_CHANGED",
    EVENT_CROSS_DOCK_FREED: "CROSS_DOCK_FREED",
    EVENT_OPERATOR_FINISHED: "OPERATOR_SHIFT_ENDED",
    EVENT_ETA_CHANGED: "ETA_CHANGED",
    EVENT_CONFIG_CHANGED: "CONFIG_CHANGED",
    EVENT_MANUAL_RECOMPUTE: "MANUAL",
}


@dataclass(frozen=True)
class SupplyFlowEvent:
    """Immutable domain event — modules publish this; they never call the Engine."""

    event_type: str
    tenant_id: int
    warehouse_id: int
    delivery_id: int | None = None
    order_id: int | None = None
    pz_id: int | None = None
    source: str = "wms"
    occurred_at: datetime = field(default_factory=datetime.utcnow)
    payload: dict[str, Any] = field(default_factory=dict)

    def dedupe_key(self) -> tuple:
        return (
            self.event_type,
            int(self.tenant_id),
            int(self.warehouse_id),
            self.delivery_id,
            self.order_id,
            self.pz_id,
        )

    def group_key(self) -> tuple[int, int]:
        return (int(self.tenant_id), int(self.warehouse_id))

    def priority(self) -> int:
        return int(EVENT_PRIORITY.get(self.event_type, 500))
