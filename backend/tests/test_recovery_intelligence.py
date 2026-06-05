"""Testy rozszerzeń inteligencji resolvera (priorytety, bez osobnego workflow)."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

from backend.services.recovery_intelligence import (
    _priority_level_from_score,
    compute_shortage_priority,
)


def test_priority_level_thresholds():
    assert _priority_level_from_score(200) == "CRITICAL"
    assert _priority_level_from_score(120) == "HIGH"
    assert _priority_level_from_score(60) == "NORMAL"
    assert _priority_level_from_score(10) == "LOW"


def test_vip_and_partial_packing_boost_score():
    db = MagicMock()
    order = SimpleNamespace(
        id=1,
        tenant_id=1,
        warehouse_id=1,
        priority_color="red",
        shipping_method="Standard",
        packing_started_at="2026-01-01T00:00:00Z",
        selected_carton_id=None,
        import_metadata_json=None,
        customer=None,
        picking_finished_at=None,
    )
    ln_blocked = SimpleNamespace(
        order_line_id=10,
        product_id=100,
        ordered_qty=2.0,
        picked_qty=1.0,
        visible_in_recovery_pick=True,
        visible_in_relocation=False,
        packing_eligible=False,
        recovery_qty=1.0,
        unresolved_qty=1.0,
    )
    ln_ready = SimpleNamespace(
        order_line_id=11,
        product_id=101,
        ordered_qty=1.0,
        picked_qty=1.0,
        visible_in_recovery_pick=False,
        visible_in_relocation=False,
        packing_eligible=True,
        recovery_qty=0.0,
        unresolved_qty=0.0,
    )
    state = SimpleNamespace(
        lines=[ln_blocked, ln_ready],
        packing_allowed=False,
        has_recovery_pick_work=True,
    )
    db.query.return_value.filter.return_value.all.return_value = []

    out = compute_shortage_priority(db, order, state)
    assert out["shortage_priority_score"] >= 100
    assert out["shortage_priority_level"] in ("CRITICAL", "HIGH")
    keys = {f["key"] for f in out["shortage_priority_factors"]}
    assert "vip_customer" in keys
    assert "partial_packing" in keys
    assert "single_shortage_blocking" in keys
