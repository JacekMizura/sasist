"""Etap 3B + MODEL B phase 1 — inventory management policy + audited manual correction."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.product import Product
from backend.models.stock_document import StockDocument, StockDocumentItem
from backend.models.stock_operation import StockOperation
from backend.models.tenant_warehouse import TenantWarehouse
from backend.models.warehouse import Warehouse
from backend.models.warehouse_inventory_movement import WarehouseInventoryMovement
from backend.models.wms_settings import WmsSettings
from backend.services.inventory_management_policy_service import (
    InventoryManagementPolicyError,
    assert_no_unaudited_inventory_write,
    assert_raw_inventory_write_allowed,
    is_controlled_inventory_lifecycle,
    manual_adjustment_allowed,
    manual_warehouse_document_execution_allowed,
    manual_warehouse_document_execution_available,
    normalize_inventory_management_mode,
    normalize_inventory_management_mode_ui,
    raw_inventory_write_allowed,
    save_inventory_management_mode,
)
from backend.services.inventory_manual_adjustment_service import apply_manual_stock_correction
from backend.services.stock_disposition import STOCK_DISPOSITION_SALEABLE


@pytest.fixture
def policy_db(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants (id) VALUES (1), (2)"))

    for model in (
        Warehouse,
        TenantWarehouse,
        Location,
        Product,
        Inventory,
        WmsSettings,
        StockDocument,
        StockDocumentItem,
        StockOperation,
        WarehouseInventoryMovement,
    ):
        model.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    db = Session()

    db.add(Warehouse(id=1, tenant_id=1, name="Magazyn test"))
    db.add(Warehouse(id=2, tenant_id=2, name="Magazyn T2"))
    db.add(TenantWarehouse(tenant_id=1, warehouse_id=1, is_default=1))
    db.add(TenantWarehouse(tenant_id=2, warehouse_id=2, is_default=1))
    db.add(Location(id=1, warehouse_id=1, name="A-01", is_active=True))
    db.add(Location(id=2, warehouse_id=2, name="B-01", is_active=True))
    product = Product(id=1, tenant_id=1, name="Produkt", sku="SKU-1", ean="5900000000001", purchase_price=10.0)
    db.add(product)
    db.add(
        Inventory(
            tenant_id=1,
            warehouse_id=1,
            location_id=1,
            product_id=1,
            quantity=5.0,
            batch_number="",
            expiry_date=date(9999, 12, 31),
            stock_disposition=STOCK_DISPOSITION_SALEABLE,
        )
    )
    db.add(
        WmsSettings(
            tenant_id=1,
            warehouse_id=1,
            returns_mode="simple",
            inventory_management_mode="HYBRID",
        )
    )
    db.add(
        WmsSettings(
            tenant_id=2,
            warehouse_id=2,
            returns_mode="simple",
            inventory_management_mode="DOCUMENTS_ONLY",
        )
    )
    db.commit()

    monkeypatch.setattr(
        "backend.services.document_number_service.require_warehouse_series",
        lambda *a, **k: None,
    )

    try:
        yield db, product
    finally:
        db.close()


def test_legacy_hybrid_normalizes_to_direct_operations(policy_db) -> None:
    db, _product = policy_db
    assert normalize_inventory_management_mode("HYBRID") == "DIRECT_OPERATIONS"
    assert normalize_inventory_management_mode_ui("HYBRID") == "DIRECT_OPERATIONS"
    assert manual_adjustment_allowed(db, tenant_id=1, warehouse_id=1) is True


def test_save_direct_operations_stores_canonical_value(policy_db) -> None:
    db, _product = policy_db
    save_inventory_management_mode(db, tenant_id=1, warehouse_id=1, mode="DIRECT_OPERATIONS")
    db.commit()
    row = db.query(WmsSettings).filter(WmsSettings.tenant_id == 1, WmsSettings.warehouse_id == 1).one()
    assert row.inventory_management_mode == "DIRECT_OPERATIONS"


def test_save_legacy_hybrid_maps_to_direct_operations(policy_db) -> None:
    db, _product = policy_db
    save_inventory_management_mode(db, tenant_id=1, warehouse_id=1, mode="HYBRID")
    db.commit()
    row = db.query(WmsSettings).filter(WmsSettings.tenant_id == 1, WmsSettings.warehouse_id == 1).one()
    assert row.inventory_management_mode == "DIRECT_OPERATIONS"


def test_controlled_wms_lifecycle_kinds(policy_db) -> None:
    _db, _product = policy_db
    assert is_controlled_inventory_lifecycle("wms_picking_cart") is True
    assert is_controlled_inventory_lifecycle("wms_receiving") is True
    assert is_controlled_inventory_lifecycle("production_pw_rw") is True
    assert is_controlled_inventory_lifecycle("returns_z_pz") is True
    assert is_controlled_inventory_lifecycle("inventory_count") is True
    assert is_controlled_inventory_lifecycle("owr_atp") is True
    assert is_controlled_inventory_lifecycle("raw_api") is False


def test_documents_only_blocks_unaudited_write(policy_db) -> None:
    db, _product = policy_db
    save_inventory_management_mode(db, tenant_id=1, warehouse_id=1, mode="DOCUMENTS_ONLY")
    db.commit()
    assert manual_adjustment_allowed(db, tenant_id=1, warehouse_id=1) is False
    assert raw_inventory_write_allowed(db, tenant_id=1, warehouse_id=1) is False
    with pytest.raises(InventoryManagementPolicyError) as exc:
        assert_no_unaudited_inventory_write(db, tenant_id=1, warehouse_id=1)
    assert exc.value.code == "DOCUMENTS_ONLY_INVENTORY_WRITE"


def test_documents_only_manual_correction_rejected(policy_db) -> None:
    db, _product = policy_db
    save_inventory_management_mode(db, tenant_id=1, warehouse_id=1, mode="DOCUMENTS_ONLY")
    db.commit()
    inv_before = db.query(Inventory).filter(Inventory.product_id == 1).one()
    qty_before = float(inv_before.quantity)
    with pytest.raises(InventoryManagementPolicyError) as exc:
        apply_manual_stock_correction(
            db,
            tenant_id=1,
            warehouse_id=1,
            product_id=1,
            location_id=1,
            quantity_delta=10.0,
            reason="Test korekty",
        )
    assert exc.value.code == "MANUAL_ADJUSTMENT_FORBIDDEN"
    db.rollback()
    inv_after = db.query(Inventory).filter(Inventory.product_id == 1).one()
    assert float(inv_after.quantity) == qty_before
    assert db.query(StockDocument).count() == 0


def test_direct_operations_manual_correction_with_audit(policy_db) -> None:
    db, _product = policy_db
    save_inventory_management_mode(db, tenant_id=1, warehouse_id=1, mode="DIRECT_OPERATIONS")
    db.commit()
    result = apply_manual_stock_correction(
        db,
        tenant_id=1,
        warehouse_id=1,
        product_id=1,
        location_id=1,
        quantity_delta=10.0,
        reason="Korekta testowa +10",
    )
    db.commit()

    inv = db.query(Inventory).filter(Inventory.product_id == 1).one()
    assert float(inv.quantity) == pytest.approx(15.0)
    assert result["document_type"] == "RK"
    assert result["stock_document_id"] > 0

    rk = db.query(StockDocument).filter(StockDocument.id == int(result["stock_document_id"])).one()
    assert rk.document_type == "RK"

    ops = db.query(StockOperation).filter(StockOperation.document_id == int(rk.id)).all()
    assert len(ops) >= 1
    assert any(float(o.qty) == pytest.approx(10.0) for o in ops)


def test_direct_operations_blocks_unaudited_direct_write(policy_db) -> None:
    db, _product = policy_db
    save_inventory_management_mode(db, tenant_id=1, warehouse_id=1, mode="DIRECT_OPERATIONS")
    db.commit()
    with pytest.raises(InventoryManagementPolicyError) as exc:
        assert_raw_inventory_write_allowed(db, tenant_id=1, warehouse_id=1)
    assert exc.value.code == "USE_AUDITED_MANUAL_CORRECTION"


def test_tenant_warehouse_isolation(policy_db) -> None:
    db, _product = policy_db
    assert manual_adjustment_allowed(db, tenant_id=1, warehouse_id=1) is True
    assert manual_adjustment_allowed(db, tenant_id=2, warehouse_id=2) is False


def test_manual_warehouse_document_toggle_not_available_phase1(policy_db) -> None:
    db, _product = policy_db
    assert manual_warehouse_document_execution_available() is False
    row = db.query(WmsSettings).filter(WmsSettings.tenant_id == 1).one()
    row.allow_manual_warehouse_document_execution = True
    db.commit()
    assert manual_warehouse_document_execution_allowed(db, tenant_id=1, warehouse_id=1) is False
