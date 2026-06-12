"""List vs detail inventory payload parity."""

from __future__ import annotations

import pytest

from backend.database import SessionLocal
from backend.models.product import Product
from backend.services.product_detail_service import build_product_detail_payload
from backend.services.product_inventory_display_service import (
    get_product_inventory_display_snapshot,
    inventory_display_maps_for_products,
)


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def test_list_and_detail_stock_parity_for_st001(db):
    product = (
        db.query(Product)
        .filter(Product.symbol == "ST-001", Product.deleted_at.is_(None))
        .first()
    )
    if product is None:
        pytest.skip("ST-001 not in test db")

    pid = int(product.id)
    tid = int(product.tenant_id)
    stock_map, loc_map, inv_map = inventory_display_maps_for_products(db, [product])
    list_stock = stock_map.get((pid, tid), 0)
    list_locs = loc_map.get(pid, [])
    list_inv = inv_map.get(pid, [])

    detail = build_product_detail_payload(db, product_id=pid, tenant_id=tid)
    assert detail["stock_quantity"] == list_stock
    assert detail["locations"] == list_locs
    assert detail["inventory"] == list_inv

    snap = get_product_inventory_display_snapshot(db, product_id=pid, tenant_id=tid)
    assert snap["stock_quantity"] == list_stock
    assert snap["locations"] == list_locs
    disp = snap.get("disposition_stock") or {}
    assert float(disp.get("physical_qty") or 0) == pytest.approx(float(list_stock), abs=0.01)


def test_location_entries_include_id_and_code(db):
    product = (
        db.query(Product)
        .filter(Product.symbol == "ST-001", Product.deleted_at.is_(None))
        .first()
    )
    if product is None:
        pytest.skip("ST-001 not in test db")

    _, loc_map, _ = inventory_display_maps_for_products(db, [product])
    locs = loc_map.get(int(product.id), [])
    if not locs:
        pytest.skip("ST-001 has no inventory locations in test db")
    for loc in locs:
        assert loc.get("id") is not None
        assert (loc.get("code") or "").strip() != ""
