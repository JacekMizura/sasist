"""Unit tests for product disposition stock aggregation (Etap 1)."""

from __future__ import annotations

import pytest

from backend.database import SessionLocal
from backend.models.product import Product
from backend.services.product_disposition_snapshot_service import (
    _disposition_stock_from_buckets,
    disposition_snapshots_for_products,
    empty_disposition_stock_dict,
    get_product_disposition_stock,
)
from backend.services.product_inventory_display_service import get_product_inventory_display_snapshot
from backend.services.stock_disposition import (
    STOCK_DISPOSITION_OUTLET_B,
    STOCK_DISPOSITION_QUARANTINE,
    STOCK_DISPOSITION_REJECTED_STOCK,
    STOCK_DISPOSITION_SALEABLE,
    STOCK_DISPOSITION_SCRAP,
    STOCK_DISPOSITION_SERVICE_C,
)


class TestDispositionStockFromBuckets:
    def test_example_breakdown(self) -> None:
        buckets = {
            STOCK_DISPOSITION_SALEABLE: 100.0,
            STOCK_DISPOSITION_OUTLET_B: 1.0,
            STOCK_DISPOSITION_SERVICE_C: 2.0,
            STOCK_DISPOSITION_QUARANTINE: 5.0,
        }
        out = _disposition_stock_from_buckets(buckets, reserved=3.0)
        assert out["saleable_qty"] == 100.0
        assert out["outlet_qty"] == 1.0
        assert out["service_qty"] == 2.0
        assert out["quarantine_qty"] == 5.0
        assert out["scrap_qty"] == 0.0
        assert out["rejected_qty"] == 0.0
        assert out["physical_qty"] == 108.0
        assert out["saleable_available_qty"] == 97.0

    def test_scrap_in_physical_not_saleable(self) -> None:
        buckets = {STOCK_DISPOSITION_SALEABLE: 10.0, STOCK_DISPOSITION_SCRAP: 4.0}
        out = _disposition_stock_from_buckets(buckets)
        assert out["saleable_qty"] == 10.0
        assert out["scrap_qty"] == 4.0
        assert out["physical_qty"] == 14.0

    def test_rejected_separate_from_quarantine(self) -> None:
        buckets = {
            STOCK_DISPOSITION_QUARANTINE: 3.0,
            STOCK_DISPOSITION_REJECTED_STOCK: 2.0,
        }
        out = _disposition_stock_from_buckets(buckets)
        assert out["quarantine_qty"] == 3.0
        assert out["rejected_qty"] == 2.0
        assert out["physical_qty"] == 5.0


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def test_display_snapshot_includes_disposition_and_physical_parity(db):
    product = (
        db.query(Product)
        .filter(Product.symbol == "ST-001", Product.deleted_at.is_(None))
        .first()
    )
    if product is None:
        pytest.skip("ST-001 not in test db")

    pid = int(product.id)
    tid = int(product.tenant_id)
    snap = get_product_inventory_display_snapshot(db, product_id=pid, tenant_id=tid)
    disp = snap.get("disposition_stock") or {}
    assert "saleable_qty" in disp
    assert "physical_qty" in disp
    assert float(disp["physical_qty"]) == pytest.approx(float(snap["stock_quantity"]), abs=0.01)


def test_disposition_snapshot_batch_empty_ids(db):
    assert disposition_snapshots_for_products(db, 1, None, []) == {}


def test_get_product_disposition_stock_unknown_product(db):
    empty = empty_disposition_stock_dict()
    out = get_product_disposition_stock(db, product_id=999999999, tenant_id=1, warehouse_id=1)
    assert out == empty
