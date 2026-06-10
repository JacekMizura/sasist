"""Regression tests for warehouse operations snapshot resilience."""

from __future__ import annotations

from datetime import datetime

from backend.schemas.warehouse_operations import (
    WarehouseInboundSummaryOut,
    WarehousePutawayLoadOut,
    WarehousePutawayZoneLoadOut,
)
from backend.services.warehouse_operations_domains import _normalize_alert_category, extend_alerts


def test_normalize_alert_category_maps_putaway_label() -> None:
    assert _normalize_alert_category("Rozlokowanie PZ") == "Rozlokowanie"


def test_extend_alerts_putaway_alert_uses_valid_category() -> None:
    now = datetime.utcnow()
    putaway = WarehousePutawayLoadOut(
        products_waiting=12,
        pallets_waiting=3,
        oldest_unprocessed_carrier_minutes=90,
        zones=[WarehousePutawayZoneLoadOut(zone="A", waiting_quantity=12, heat_percent=100, tone="orange")],
    )
    alerts = extend_alerts(
        base_alerts=[],
        bottlenecks=[],
        replenishments=[],
        inbound=WarehouseInboundSummaryOut(),
        putaway=putaway,
        carrier_issues=[],
        queues=[],
        operators=[],
        now=now,
    )
    putaway_alerts = [a for a in alerts if a.id == "putaway-delayed"]
    assert len(putaway_alerts) == 1
    assert putaway_alerts[0].category == "Rozlokowanie"
