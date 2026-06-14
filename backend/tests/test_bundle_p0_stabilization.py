"""P4.13B — P0 bundle stabilization regression tests."""

from __future__ import annotations

import json

import pytest

from types import SimpleNamespace

from backend.models.order_item import OrderItem
from backend.services.bundle_operational_mode import ON_DEMAND_ASSEMBLY, STOCK_PRODUCTION
from backend.services.bundle_order_item_ops import (
    order_item_is_operational_picking_line,
    order_item_is_stock_production_bundle_parent,
    order_item_skip_bundle_commercial_header_for_ops,
)
from backend.services.order_consolidation.order_footprint_service import _aggregate_lines
from backend.services.recovery_workflow_service import line_skipped_for_recovery


def _meta(mode: str) -> str:
    return json.dumps({"bundle_fulfillment_mode": mode, "bundle_id": 1})


def _oi(
    *,
    oid: int,
    pid: int,
    qty: int = 1,
    is_parent: bool = False,
    parent_id: int | None = None,
    mode: str | None = None,
) -> OrderItem:
    return OrderItem(
        id=oid,
        order_id=1,
        product_id=pid,
        quantity=qty,
        is_bundle_parent=is_parent,
        parent_bundle_order_item_id=parent_id,
        metadata_json=_meta(mode) if mode and is_parent else None,
    )


def _product_stub(**overrides: float) -> SimpleNamespace:
    base: dict[str, float | None | bool] = {
        "id": 1,
        "volume": 1.0,
        "length": 1.0,
        "width": 1.0,
        "height": 1.0,
        "weight": 0.0,
        "orientation_type": None,
        "stack_behavior": None,
        "stack_compressible": False,
        "max_stack_weight": None,
        "units_per_carton": 0,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


class TestOperationalPickingLineSSOT:
    def test_on_demand_parent_skipped_components_included(self) -> None:
        parent = _oi(oid=1, pid=100, is_parent=True, mode=ON_DEMAND_ASSEMBLY)
        comp = _oi(oid=2, pid=101, qty=2, parent_id=1)
        assert order_item_skip_bundle_commercial_header_for_ops(parent) is True
        assert order_item_is_operational_picking_line(parent) is False
        assert order_item_is_operational_picking_line(comp) is True

    def test_stock_parent_operational(self) -> None:
        parent = _oi(oid=10, pid=200, is_parent=True, mode=STOCK_PRODUCTION)
        assert order_item_is_stock_production_bundle_parent(parent) is True
        assert order_item_skip_bundle_commercial_header_for_ops(parent) is False
        assert order_item_is_operational_picking_line(parent) is True

    def test_regular_product_unchanged(self) -> None:
        line = _oi(oid=3, pid=50)
        assert order_item_is_operational_picking_line(line) is True
        assert order_item_skip_bundle_commercial_header_for_ops(line) is False


class TestRecoverySkipsCommercialHeaderOnly:
    def test_on_demand_component_not_skipped(self) -> None:
        comp = _oi(oid=2, pid=101, qty=2, parent_id=1)
        assert line_skipped_for_recovery(comp) is False

    def test_on_demand_parent_skipped(self) -> None:
        parent = _oi(oid=1, pid=100, is_parent=True, mode=ON_DEMAND_ASSEMBLY)
        assert line_skipped_for_recovery(parent) is True

    def test_stock_parent_not_skipped(self) -> None:
        parent = _oi(oid=10, pid=200, is_parent=True, mode=STOCK_PRODUCTION)
        assert line_skipped_for_recovery(parent) is False


class TestShortageReportEligible:
    def test_on_demand_component_eligible(self) -> None:
        from backend.services.wms_picking_product_list_service import _line_eligible_for_shortage_report

        comp = _oi(oid=2, pid=101, qty=2, parent_id=1)
        ok, reason = _line_eligible_for_shortage_report(comp)
        assert ok is True
        assert reason == "active_line"

    def test_on_demand_parent_not_eligible(self) -> None:
        from backend.services.wms_picking_product_list_service import _line_eligible_for_shortage_report

        parent = _oi(oid=1, pid=100, is_parent=True, mode=ON_DEMAND_ASSEMBLY)
        ok, reason = _line_eligible_for_shortage_report(parent)
        assert ok is False
        assert reason == "bundle_commercial_header"


class TestFootprintOperationalLinesOnly:
    def test_on_demand_excludes_commercial_header_volume(self) -> None:
        """Parent (rep SKU) + 2 components — footprint counts components only."""
        parent_vol_product = _product_stub(volume=100.0, length=10, width=10, height=10)
        comp_a = _product_stub(volume=1.0, length=1, width=1, height=1)
        comp_b = _product_stub(volume=2.0, length=2, width=2, height=2)
        parent = _oi(oid=1, pid=100, qty=1, is_parent=True, mode=ON_DEMAND_ASSEMBLY)
        c1 = _oi(oid=2, pid=101, qty=2, parent_id=1)
        c2 = _oi(oid=3, pid=102, qty=1, parent_id=1)
        lines = [
            (comp_a, float(c1.quantity)),
            (comp_b, float(c2.quantity)),
        ]
        if order_item_is_operational_picking_line(parent):
            lines.append((parent_vol_product, float(parent.quantity)))
        fp = _aggregate_lines(lines)
        assert fp.total_items_count == 3
        assert fp.volume_dm3 < 50.0

    def test_stock_counts_parent_only(self) -> None:
        sku = _product_stub(volume=5.0, length=5, width=5, height=5)
        parent = _oi(oid=10, pid=200, qty=3, is_parent=True, mode=STOCK_PRODUCTION)
        lines = [(sku, float(parent.quantity))] if order_item_is_operational_picking_line(parent) else []
        fp = _aggregate_lines(lines)
        assert fp.total_items_count == 3
        assert fp.volume_dm3 == pytest.approx(15.0, rel=0.01)
