"""Shared engine input — aggregates from READ adapters only (ids/counts, no SSOT copies)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .adapters.read import DeliveryReadDTO


@dataclass
class OpenPzRead:
    id: int
    delivery_id: int | None
    receiving_status: str
    putaway_status: str


@dataclass
class SupplyFlowEngineInput:
    """
    Immutable-ish snapshot of READ adapter outputs for one warehouse recompute.

    Must not contain inventory row dumps, location rows, or recovery state copies —
    only aggregates and id references.
    """

    tenant_id: int
    warehouse_id: int
    deliveries: list[DeliveryReadDTO] = field(default_factory=list)
    open_pz_awaiting_putaway: list[OpenPzRead] = field(default_factory=list)
    putaway_summary: dict[str, Any] = field(default_factory=dict)
    recovery: dict[str, Any] = field(default_factory=dict)
    capacity: dict[str, Any] = field(default_factory=dict)
    slotting: dict[str, Any] = field(default_factory=dict)
    inventory: dict[str, Any] = field(default_factory=dict)
    warehouse_graph: dict[str, Any] = field(default_factory=dict)
    wms_terminal: dict[str, Any] = field(default_factory=dict)
    optimization_goal: str = "MAX_SHIPPED_ORDERS"
    planning_horizon_hours: int = 24

    def active_deliveries(self) -> list[DeliveryReadDTO]:
        """Deliveries not yet in ZAKONCZONA."""
        out: list[DeliveryReadDTO] = []
        for d in self.deliveries:
            if str(d.operational_phase or "").upper() != "ZAKONCZONA":
                out.append(d)
        return out

    def pz_ids_for_delivery(self, delivery_id: int) -> list[int]:
        return [
            p.id
            for p in self.open_pz_awaiting_putaway
            if p.delivery_id is not None and int(p.delivery_id) == int(delivery_id)
        ]
