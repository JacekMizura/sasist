"""Multi-WH product slotting — table SSOT + API."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from backend.database import SessionLocal
from backend.db.product_warehouse_slotting_schema import ensure_product_warehouse_slotting_schema
from backend.database import engine
from backend.models.product import Product
from backend.models.product_warehouse_slotting import ProductWarehouseSlotting
from backend.models.tenant_warehouse import TenantWarehouse
from backend.models.warehouse import Bin, Rack, WarehouseLayout
from backend.services.product_warehouse_slotting_service import (
    backfill_slotting_from_assigned_locations,
    get_product_slotting_entries,
    replace_product_slotting_for_warehouse,
    validate_slotting_entries_for_warehouse,
)


@pytest.fixture
def db():
    ensure_product_warehouse_slotting_schema(engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _first_bin_for_tenant(db, tenant_id: int) -> tuple[int, str, int] | None:
    row = (
        db.query(Bin.location_uuid, WarehouseLayout.warehouse_id, Bin.id)
        .join(Rack, Bin.rack_id == Rack.id)
        .join(WarehouseLayout, Rack.layout_id == WarehouseLayout.id)
        .join(
            TenantWarehouse,
            (TenantWarehouse.warehouse_id == WarehouseLayout.warehouse_id)
            & (TenantWarehouse.tenant_id == tenant_id),
        )
        .filter(Bin.location_uuid.isnot(None))
        .first()
    )
    if not row or not row[0]:
        return None
    return int(row[2]), str(row[0]).strip(), int(row[1])


def test_backfill_idempotent(db):
    stats = backfill_slotting_from_assigned_locations(db, tenant_id=1, dry_run=False)
    db.commit()
    stats2 = backfill_slotting_from_assigned_locations(db, tenant_id=1, dry_run=False)
    assert stats2["inserted"] == 0


def test_replace_slotting_scoped_to_warehouse(db):
    product = db.query(Product).filter(Product.deleted_at.is_(None), Product.tenant_id == 1).first()
    if product is None:
        pytest.skip("no product")
    ctx = _first_bin_for_tenant(db, int(product.tenant_id))
    if ctx is None:
        pytest.skip("no bin for tenant")
    _bin_id, loc_uuid, warehouse_id = ctx

    other_wh = (
        db.query(TenantWarehouse.warehouse_id)
        .filter(TenantWarehouse.tenant_id == product.tenant_id, TenantWarehouse.warehouse_id != warehouse_id)
        .first()
    )
    if other_wh is None:
        pytest.skip("need second warehouse")

    other_wh_id = int(other_wh[0])
    other_row = (
        db.query(Bin.location_uuid)
        .join(Rack, Bin.rack_id == Rack.id)
        .join(WarehouseLayout, Rack.layout_id == WarehouseLayout.id)
        .filter(WarehouseLayout.warehouse_id == other_wh_id, Bin.location_uuid.isnot(None))
        .first()
    )
    if not other_row or not other_row[0]:
        pytest.skip("no bin in second warehouse")
    other_uuid = str(other_row[0]).strip()

    pid = int(product.id)
    tid = int(product.tenant_id)

    db.query(ProductWarehouseSlotting).filter(ProductWarehouseSlotting.product_id == pid).delete()
    db.commit()

    replace_product_slotting_for_warehouse(
        db,
        tenant_id=tid,
        product_id=pid,
        warehouse_id=warehouse_id,
        entries=[{"locationUUID": loc_uuid, "quantity": 3, "storageType": "primary"}],
    )
    replace_product_slotting_for_warehouse(
        db,
        tenant_id=tid,
        product_id=pid,
        warehouse_id=other_wh_id,
        entries=[{"locationUUID": other_uuid, "quantity": 7, "storageType": "pick"}],
    )
    db.commit()

    wh1 = get_product_slotting_entries(db, tenant_id=tid, product_id=pid, warehouse_id=warehouse_id)
    wh2 = get_product_slotting_entries(db, tenant_id=tid, product_id=pid, warehouse_id=other_wh_id)
    assert len(wh1) == 1 and wh1[0]["quantity"] == 3
    assert len(wh2) == 1 and wh2[0]["quantity"] == 7

    replace_product_slotting_for_warehouse(
        db,
        tenant_id=tid,
        product_id=pid,
        warehouse_id=warehouse_id,
        entries=[],
    )
    db.commit()

    wh1_after = get_product_slotting_entries(db, tenant_id=tid, product_id=pid, warehouse_id=warehouse_id)
    wh2_after = get_product_slotting_entries(db, tenant_id=tid, product_id=pid, warehouse_id=other_wh_id)
    assert wh1_after == []
    assert len(wh2_after) == 1


def test_validate_rejects_uuid_from_other_warehouse(db):
    product = db.query(Product).filter(Product.deleted_at.is_(None), Product.tenant_id == 1).first()
    if product is None:
        pytest.skip("no product")
    ctx = _first_bin_for_tenant(db, int(product.tenant_id))
    if ctx is None:
        pytest.skip("no bin")
    _bin_id, loc_uuid, warehouse_id = ctx

    other_wh = (
        db.query(TenantWarehouse.warehouse_id)
        .filter(TenantWarehouse.tenant_id == product.tenant_id, TenantWarehouse.warehouse_id != warehouse_id)
        .first()
    )
    if other_wh is None:
        pytest.skip("need second warehouse")

    with pytest.raises(HTTPException) as exc:
        validate_slotting_entries_for_warehouse(
            db,
            tenant_id=int(product.tenant_id),
            warehouse_id=int(other_wh[0]),
            entries=[{"locationUUID": loc_uuid, "quantity": 1}],
        )
    assert exc.value.status_code == 400
