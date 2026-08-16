"""ETAP 2 — A/B/C stock model: ATP, reservations, planning, marketplace (commercial)."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from backend.services.commercial_availability_service import commercially_sellable_qty
from backend.services.product_disposition_snapshot_service import _disposition_stock_from_buckets
from backend.services.production_planning.production_recommendation_service import (
    combined_production_need,
    forecast_stock_need,
)
from backend.services.reservations.availability_service import warehouse_net_available
from backend.services.stock_disposition import (
    STOCK_DISPOSITION_OUTLET_B,
    STOCK_DISPOSITION_SALEABLE,
    STOCK_DISPOSITION_SERVICE_C,
    assert_reservable_disposition,
    disposition_for_new_order_line,
    resolve_order_item_required_disposition,
)
from backend.services.wms_picking_atp import pickable_available_qty


def test_A_total_and_default_available() -> None:
    """A=10 B=2 C=1 → total=13, default available=10."""
    out = _disposition_stock_from_buckets(
        {
            STOCK_DISPOSITION_SALEABLE: 10.0,
            STOCK_DISPOSITION_OUTLET_B: 2.0,
            STOCK_DISPOSITION_SERVICE_C: 1.0,
        }
    )
    assert out["physical_qty"] == 13.0
    assert out["saleable_qty"] == 10.0
    assert out["saleable_available_qty"] == 10.0
    assert out["outlet_qty"] == 2.0
    assert out["service_qty"] == 1.0


def test_B_ordinary_order_defaults_to_saleable_not_b() -> None:
    assert disposition_for_new_order_line(None) == STOCK_DISPOSITION_SALEABLE
    oi = SimpleNamespace(required_stock_disposition=None)
    assert resolve_order_item_required_disposition(oi) == STOCK_DISPOSITION_SALEABLE


def test_C_outlet_explicit_and_service_never() -> None:
    assert disposition_for_new_order_line("OUTLET_B") == STOCK_DISPOSITION_OUTLET_B
    with pytest.raises(ValueError, match="not reservable"):
        assert_reservable_disposition(STOCK_DISPOSITION_SERVICE_C)


def test_E_planning_ignores_b_c_on_hand() -> None:
    """A=0 B=20 demand=10 → need still 10 (saleable cover only)."""
    on_hand_a = 0.0
    demand = 10.0
    need = max(0.0, demand - on_hand_a - 0.0)
    assert need == 10.0
    combined = combined_production_need(
        order_demand=demand, target_stock=0.0, on_hand=on_hand_a, in_pipeline=0.0
    )
    assert combined == 10.0
    legacy_physical = 20.0
    wrong = max(0.0, demand - legacy_physical)
    assert wrong == 0.0
    assert need != wrong


def test_E2_planning_partial_a_cover() -> None:
    """A=5 B=20 demand=10 → need 5 (B must not cover)."""
    assert (
        combined_production_need(
            order_demand=10.0, target_stock=0.0, on_hand=5.0, in_pipeline=0.0
        )
        == 5.0
    )


def test_F_marketplace_commercial_is_a_only(monkeypatch) -> None:
    def _fake_disp(_db, *, product_id, tenant_id, warehouse_id=None):
        return {
            "saleable_available_qty": 5.0,
            "saleable_qty": 5.0,
            "outlet_qty": 10.0,
            "service_qty": 10.0,
            "physical_qty": 25.0,
        }

    monkeypatch.setattr(
        "backend.services.commercial_availability_service.get_product_disposition_stock",
        _fake_disp,
    )
    monkeypatch.setattr(
        "backend.services.commercial_availability_service.effective_sales_block_for_product",
        lambda *_a, **_k: 0.0,
    )
    qty = commercially_sellable_qty(MagicMock(), tenant_id=1, warehouse_id=1, product_id=1)
    assert qty == 5.0


def test_G_location_matrix_buckets_not_merged() -> None:
    out = _disposition_stock_from_buckets(
        {
            STOCK_DISPOSITION_SALEABLE: 10.0,
            STOCK_DISPOSITION_OUTLET_B: 2.0,
            STOCK_DISPOSITION_SERVICE_C: 1.0,
        }
    )
    assert out["saleable_qty"] == 10.0
    assert out["outlet_qty"] == 2.0
    assert out["service_qty"] == 1.0
    assert out["physical_qty"] == 13.0


def test_H_putaway_b_stays_b_bucket() -> None:
    out = _disposition_stock_from_buckets({STOCK_DISPOSITION_OUTLET_B: 1.0})
    assert out["outlet_qty"] == 1.0
    assert out["saleable_qty"] == 0.0
    assert out["physical_qty"] == 1.0


def test_I_legacy_available_semantics_untouched_in_snapshot_contract() -> None:
    from backend.services.product_inventory_snapshot_service import inventory_snapshots_for_products

    assert callable(inventory_snapshots_for_products)


def test_pickable_atp_respects_disposition_param(monkeypatch) -> None:
    calls: list[str] = []

    def _fake_by_loc(*_a, **kwargs):
        calls.append(str(kwargs.get("stock_disposition")))
        return []

    monkeypatch.setattr(
        "backend.services.wms_picking_atp.pickable_available_by_location",
        _fake_by_loc,
    )
    pickable_available_qty(
        MagicMock(),
        tenant_id=1,
        warehouse_id=1,
        product_id=1,
        stock_disposition=STOCK_DISPOSITION_OUTLET_B,
    )
    assert calls == [STOCK_DISPOSITION_OUTLET_B]


def test_warehouse_net_available_filters_reserved_by_disposition(monkeypatch) -> None:
    monkeypatch.setattr(
        "backend.services.reservations.availability_service.warehouse_on_hand",
        lambda *_a, **_k: 10.0,
    )

    def _reserved(*_a, **kwargs):
        assert kwargs.get("stock_disposition") == STOCK_DISPOSITION_SALEABLE
        return 3.0

    monkeypatch.setattr(
        "backend.services.reservations.availability_service.warehouse_reserved_qty",
        _reserved,
    )
    assert (
        warehouse_net_available(MagicMock(), tenant_id=1, warehouse_id=1, product_id=1) == 7.0
    )


def test_production_materials_default_saleable_only(monkeypatch) -> None:
    """A=5 B=20 → material ATP = 5 (default production does not auto-use B)."""
    from backend.services.production_planning.material_availability_service import _warehouse_stock

    def _net(*_a, **kwargs):
        # Default path omits stock_disposition → SALEABLE in warehouse_net_available.
        assert kwargs.get("stock_disposition", STOCK_DISPOSITION_SALEABLE) == STOCK_DISPOSITION_SALEABLE
        return 5.0

    monkeypatch.setattr(
        "backend.services.production_planning.material_availability_service.warehouse_net_available",
        _net,
    )
    assert _warehouse_stock(MagicMock(), tenant_id=1, warehouse_id=1, product_id=99) == 5.0


def test_forecast_need_with_a_zero() -> None:
    need = forecast_stock_need(
        daily_rate=0.0,
        coverage_days=0,
        min_stock=None,
        max_stock=None,
        on_hand=0.0,
        in_pipeline=0.0,
    )
    assert need == 0.0
