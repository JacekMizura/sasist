"""Etap 2 — disposition-aware reservation / allocation helpers (unit)."""

from __future__ import annotations

import pytest

from backend.services.stock_disposition import (
    DEFAULT_STOCK_DISPOSITION,
    STOCK_DISPOSITION_OUTLET_B,
    STOCK_DISPOSITION_QUARANTINE,
    assert_reservable_disposition,
    disposition_for_new_order_line,
    resolve_order_item_required_disposition,
)
from backend.services.bundle_explosion import (
    BundleExplosionError,
    ResolvedOrderLine,
    validate_merged_stock,
)
from backend.services.product_disposition_snapshot_service import _disposition_stock_from_buckets
from backend.services.stock_disposition import STOCK_DISPOSITION_SALEABLE


class TestStockDispositionHelpers:
    def test_default_order_line_is_saleable(self) -> None:
        assert disposition_for_new_order_line(None) == DEFAULT_STOCK_DISPOSITION
        assert disposition_for_new_order_line("") == DEFAULT_STOCK_DISPOSITION

    def test_outlet_b_accepted_for_api(self) -> None:
        assert disposition_for_new_order_line("outlet_b") == STOCK_DISPOSITION_OUTLET_B

    def test_non_reservable_rejected(self) -> None:
        with pytest.raises(ValueError, match="not reservable"):
            disposition_for_new_order_line(STOCK_DISPOSITION_QUARANTINE)

    def test_resolve_order_item_missing_column(self) -> None:
        class _Oi:
            pass

        assert resolve_order_item_required_disposition(_Oi()) == DEFAULT_STOCK_DISPOSITION

    def test_assert_reservable_outlet_b(self) -> None:
        assert assert_reservable_disposition(STOCK_DISPOSITION_OUTLET_B) == STOCK_DISPOSITION_OUTLET_B


class TestValidateMergedStockDisposition:
    @pytest.fixture
    def db(self):
        from backend.database import SessionLocal

        session = SessionLocal()
        try:
            yield session
        finally:
            session.close()

    def test_skips_bundle_parent_in_need(self, db, monkeypatch) -> None:
        calls: list[tuple[int, str]] = []

        def _fake_avail(_db, tenant_id, warehouse_id, product_id, stock_disposition):
            calls.append((product_id, stock_disposition))
            return 0.0

        monkeypatch.setattr(
            "backend.services.bundle_explosion.available_stock_for_disposition",
            _fake_avail,
        )
        lines = [
            ResolvedOrderLine(
                product_id=1,
                quantity=2,
                unit_price=1.0,
                total_price=2.0,
                list_price=None,
                line_volume=0.0,
                source_bundle_id=10,
                bundle_instance_id="x",
                metadata_json=None,
                is_bundle_parent=True,
            ),
            ResolvedOrderLine(
                product_id=2,
                quantity=3,
                unit_price=0.0,
                total_price=0.0,
                list_price=None,
                line_volume=0.0,
                source_bundle_id=10,
                bundle_instance_id="x",
                metadata_json=None,
                is_bundle_parent=False,
                required_stock_disposition=STOCK_DISPOSITION_OUTLET_B,
            ),
        ]
        with pytest.raises(BundleExplosionError) as exc:
            validate_merged_stock(db, tenant_id=1, warehouse_id=1, lines=lines)
        assert "product_id=2" in str(exc.value.detail)
        assert "OUTLET_B" in str(exc.value)
        assert calls == [(2, STOCK_DISPOSITION_OUTLET_B)]


def test_saleable_available_uses_saleable_reserved_only() -> None:
    buckets = {STOCK_DISPOSITION_SALEABLE: 50.0, STOCK_DISPOSITION_OUTLET_B: 20.0}
    out = _disposition_stock_from_buckets(buckets, reserved=8.0)
    assert out["saleable_available_qty"] == 42.0
