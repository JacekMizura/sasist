"""Wave location_clustering uses product_warehouse_slotting scoped by wave warehouse_id."""

from __future__ import annotations

import json

import pytest

from backend.database import SessionLocal, engine
from backend.db.product_warehouse_slotting_schema import ensure_product_warehouse_slotting_schema
from backend.models.product import Product
from backend.models.product_warehouse_slotting import ProductWarehouseSlotting
from backend.models.tenant_warehouse import TenantWarehouse
from backend.models.warehouse import Bin, Rack, WarehouseLayout
from backend.services.product_warehouse_slotting_service import (
    get_wave_cluster_location_key_by_product,
    get_wave_cluster_order_location_sets,
)
from backend.services.wave_service import _get_order_locations_sets


@pytest.fixture
def db():
    ensure_product_warehouse_slotting_schema(engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _bins_by_warehouse(db, tenant_id: int) -> dict[int, tuple[str, str]]:
    """warehouse_id -> (location_uuid, label hint from bin)."""
    rows = (
        db.query(WarehouseLayout.warehouse_id, Bin.location_uuid, Bin.label)
        .join(Rack, Bin.rack_id == Rack.id)
        .join(WarehouseLayout, Rack.layout_id == WarehouseLayout.id)
        .join(
            TenantWarehouse,
            (TenantWarehouse.warehouse_id == WarehouseLayout.warehouse_id)
            & (TenantWarehouse.tenant_id == tenant_id),
        )
        .filter(Bin.location_uuid.isnot(None))
        .all()
    )
    out: dict[int, tuple[str, str]] = {}
    for wh_id, loc_uuid, label in rows:
        wh = int(wh_id)
        if wh in out:
            continue
        u = str(loc_uuid).strip()
        if u:
            out[wh] = (u, str(label or u))
    return out


def test_wave_clustering_sees_only_slotting_for_wave_warehouse(db):
    """
    Produkt A: Warszawa A-01-01, Poznań B-02-01 (via slotting table).
    Fala Warszawa → tylko UUID Warszawy; fala Poznań → tylko UUID Poznania.
    """
    product = db.query(Product).filter(Product.deleted_at.is_(None), Product.tenant_id == 1).first()
    if product is None:
        pytest.skip("no product")

    bins = _bins_by_warehouse(db, int(product.tenant_id))
    if len(bins) < 2:
        pytest.skip("need at least two warehouses with bins")

    wh_ids = sorted(bins.keys())[:2]
    wh_warsaw, wh_poznan = wh_ids[0], wh_ids[1]
    uuid_warsaw, _ = bins[wh_warsaw]
    uuid_poznan, _ = bins[wh_poznan]

    pid = int(product.id)
    tid = int(product.tenant_id)

    db.query(ProductWarehouseSlotting).filter(ProductWarehouseSlotting.product_id == pid).delete()
    db.add(
        ProductWarehouseSlotting(
            tenant_id=tid,
            product_id=pid,
            warehouse_id=wh_warsaw,
            location_uuid=uuid_warsaw,
            quantity=5,
            storage_type="primary",
        )
    )
    db.add(
        ProductWarehouseSlotting(
            tenant_id=tid,
            product_id=pid,
            warehouse_id=wh_poznan,
            location_uuid=uuid_poznan,
            quantity=3,
            storage_type="primary",
        )
    )
    # Stale legacy JSON pointing only at Poznań — must be ignored when slotting exists.
    product.assigned_locations = json.dumps(
        [{"locationUUID": uuid_poznan, "quantity": 99, "storageType": "primary"}]
    )
    db.commit()

    keys_w = get_wave_cluster_location_key_by_product(
        db, tenant_id=tid, warehouse_id=wh_warsaw, product_ids=[pid]
    )
    keys_p = get_wave_cluster_location_key_by_product(
        db, tenant_id=tid, warehouse_id=wh_poznan, product_ids=[pid]
    )

    assert keys_w.get(pid) == uuid_warsaw
    assert keys_p.get(pid) == uuid_poznan
    assert keys_w.get(pid) != keys_p.get(pid)


def test_get_order_locations_sets_delegates_to_slotting(db):
    product = db.query(Product).filter(Product.deleted_at.is_(None), Product.tenant_id == 1).first()
    if product is None:
        pytest.skip("no product")
    bins = _bins_by_warehouse(db, int(product.tenant_id))
    if not bins:
        pytest.skip("no bins")
    wh_id = next(iter(bins))
    uuid_wh, _ = bins[wh_id]
    pid = int(product.id)
    tid = int(product.tenant_id)

    db.query(ProductWarehouseSlotting).filter(ProductWarehouseSlotting.product_id == pid).delete()
    db.add(
        ProductWarehouseSlotting(
            tenant_id=tid,
            product_id=pid,
            warehouse_id=wh_id,
            location_uuid=uuid_wh,
            quantity=1,
            storage_type="pick",
        )
    )
    db.commit()

    # Synthetic order_ids with no OrderItem rows → empty sets (smoke: no legacy crash)
    empty = _get_order_locations_sets(
        db, [999_999_991], tenant_id=tid, warehouse_id=wh_id
    )
    assert empty[999_999_991] == set()

    keys = get_wave_cluster_location_key_by_product(
        db, tenant_id=tid, warehouse_id=wh_id, product_ids=[pid]
    )
    assert keys[pid] == uuid_wh


def test_legacy_fallback_only_when_no_slotting_rows(db, monkeypatch):
    """Fallback: legacy JSON filtered to warehouse — only when slotting empty for product+WH."""
    from backend.config import product_refactor_flags as pr_flags

    monkeypatch.setattr(pr_flags, "wave_clustering_legacy_assigned_locations_fallback", True)

    product = db.query(Product).filter(Product.deleted_at.is_(None), Product.tenant_id == 1).first()
    if product is None:
        pytest.skip("no product")
    bins = _bins_by_warehouse(db, int(product.tenant_id))
    if not bins:
        pytest.skip("no bins")
    wh_id = next(iter(bins))
    uuid_wh, _ = bins[wh_id]
    pid = int(product.id)
    tid = int(product.tenant_id)

    db.query(ProductWarehouseSlotting).filter(ProductWarehouseSlotting.product_id == pid).delete()
    product.assigned_locations = json.dumps(
        [{"locationUUID": uuid_wh, "quantity": 2, "storageType": "primary"}]
    )
    db.commit()

    keys = get_wave_cluster_location_key_by_product(
        db, tenant_id=tid, warehouse_id=wh_id, product_ids=[pid]
    )
    assert keys[pid] == uuid_wh
