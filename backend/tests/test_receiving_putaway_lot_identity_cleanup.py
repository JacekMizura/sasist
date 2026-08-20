"""
Follow-up: putaway lot identity from PZ line + dead toggle_master_carton_pack removal.

  python -m pytest backend/tests/test_receiving_putaway_lot_identity_cleanup.py -q
"""

from __future__ import annotations

from datetime import date
from pathlib import Path
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.product import Product
from backend.models.product_barcode import ProductBarcode
from backend.models.inventory_serial import InventorySerial
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_settings import WmsSettings
from backend.services.inventory_lot_keys import NO_EXPIRY_SENTINEL, dock_lot_keys_for_pz_line
from backend.services.product_validation_policy import resolve_effective_receiving_requirements
from backend.services.receiving_scan_service import resolve_receiving_scan
from backend.services.stock_document_service import _item_storage_lot_inventory_key
from backend.services.stock_disposition import STOCK_DISPOSITION_SALEABLE


LOT = "LOT-123"
EXPIRY = date(2027, 6, 15)
BULK_EAN = "5901111222333"


def test_a_global_batch_on_legacy_track_batch_off_effective_true():
    settings = SimpleNamespace(
        validation_policy_migrated=True,
        validation_require_batch=True,
        validation_require_expiry=False,
        validation_require_serial=False,
        validation_require_dimensions=False,
        validation_require_weight=False,
        validation_require_master_carton_ean=False,
        validation_require_master_carton_qty=False,
        validation_require_master_carton_dims=False,
        validation_require_master_carton_weight=False,
    )
    product = SimpleNamespace(
        track_batch=False,
        track_expiry=False,
        track_serial=False,
        validation_skip_batch=False,
        validation_skip_expiry=False,
        validation_skip_serial=False,
        validation_skip_dimensions=False,
        validation_skip_weight=False,
        validation_skip_master_carton_ean=False,
        validation_skip_master_carton_qty=False,
        validation_skip_master_carton_dims=False,
        validation_skip_master_carton_weight=False,
    )
    eff = resolve_effective_receiving_requirements(product, settings)
    assert eff.track_batch is True
    assert product.track_batch is False


def test_b_lot_key_preserves_batch_from_line_despite_legacy_track_off():
    """A: receive stored LOT-123 on line; putaway key must keep it (not product.track_*)."""
    product = SimpleNamespace(track_batch=False, track_expiry=False)
    line = SimpleNamespace(
        product_id=42,
        batch_number=LOT,
        expiry_date=NO_EXPIRY_SENTINEL,
    )
    pid, bn, ed = _item_storage_lot_inventory_key(line, product)
    assert pid == 42
    assert bn == LOT
    assert ed == NO_EXPIRY_SENTINEL
    assert dock_lot_keys_for_pz_line(line) == (LOT, NO_EXPIRY_SENTINEL)


def test_c_settings_change_after_receive_does_not_rewrite_lot_key():
    """Live settings OFF after receive — putaway still uses line identity."""
    product = SimpleNamespace(track_batch=False, track_expiry=False)
    line = SimpleNamespace(product_id=7, batch_number=LOT, expiry_date=NO_EXPIRY_SENTINEL)
    # Even if someone mistakenly passed a product with track_batch True/False, line wins.
    _, bn, _ = _item_storage_lot_inventory_key(line, product)
    assert bn == LOT
    line2 = SimpleNamespace(product_id=7, batch_number=LOT, expiry_date=NO_EXPIRY_SENTINEL)
    product_on = SimpleNamespace(track_batch=True, track_expiry=True)
    _, bn2, ed2 = _item_storage_lot_inventory_key(line2, product_on)
    assert bn2 == LOT
    assert ed2 == NO_EXPIRY_SENTINEL


def test_d_expiry_preserved_from_line():
    product = SimpleNamespace(track_batch=False, track_expiry=False)
    line = SimpleNamespace(product_id=9, batch_number="", expiry_date=EXPIRY)
    _, bn, ed = _item_storage_lot_inventory_key(line, product)
    assert bn == ""
    assert ed == EXPIRY


def test_e_serial_policy_still_via_effective_resolver_not_lot_key():
    """Serial lifecycle is not part of inventory lot key; effective policy remains SSOT."""
    settings = SimpleNamespace(
        validation_policy_migrated=True,
        validation_require_batch=False,
        validation_require_expiry=False,
        validation_require_serial=True,
        validation_require_dimensions=False,
        validation_require_weight=False,
        validation_require_master_carton_ean=False,
        validation_require_master_carton_qty=False,
        validation_require_master_carton_dims=False,
        validation_require_master_carton_weight=False,
    )
    product = SimpleNamespace(
        track_serial=False,
        validation_skip_serial=False,
        track_batch=False,
        track_expiry=False,
        validation_skip_batch=False,
        validation_skip_expiry=False,
        validation_skip_dimensions=False,
        validation_skip_weight=False,
        validation_skip_master_carton_ean=False,
        validation_skip_master_carton_qty=False,
        validation_skip_master_carton_dims=False,
        validation_skip_master_carton_weight=False,
    )
    assert resolve_effective_receiving_requirements(product, settings).track_serial is True
    # Lot key ignores serial entirely.
    line = SimpleNamespace(product_id=1, batch_number="", expiry_date=NO_EXPIRY_SENTINEL)
    assert _item_storage_lot_inventory_key(line, product)[1:] == ("", NO_EXPIRY_SENTINEL)


def test_f_toggle_master_carton_pack_removed_and_bulk_ean_still_works(monkeypatch):
    root = Path(__file__).resolve().parents[1]
    api_src = (root / "api" / "product.py").read_text(encoding="utf-8")
    patch_src = (root / "services" / "product_bulk_logistics_patch.py").read_text(encoding="utf-8")
    assert "toggle_master_carton_pack" not in api_src
    assert "apply_toggle_master_carton_pack" not in patch_src
    assert "def apply_toggle_master_carton_pack" not in patch_src
    # Dead flag not in live patch writers
    assert '"require_recv_master_carton"' not in patch_src or "require_recv_master_carton_ean" in patch_src
    assert "Product.require_recv_master_carton:" not in patch_src
    assert '"require_recv_master_carton": Product.require_recv_master_carton' not in patch_src

    fe = (
        Path(__file__).resolve().parents[2]
        / "frontend"
        / "src"
        / "api"
        / "productsBulkApi.ts"
    ).read_text(encoding="utf-8")
    assert "toggle_master_carton_pack" not in fe

    engine = create_engine("sqlite:///:memory:")
    for model in (Tenant, Warehouse, Product, ProductBarcode, InventorySerial, WmsSettings):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    settings_row = WmsSettings(
        tenant_id=1,
        warehouse_id=1,
        validation_policy_migrated=True,
        validation_require_master_carton_ean=False,
        validation_require_master_carton_qty=False,
        validation_require_master_carton_dims=False,
        validation_require_master_carton_weight=False,
    )
    session.add(settings_row)
    session.add(
        Product(
            id=88,
            tenant_id=1,
            name="Bulk",
            sku="B-1",
            ean="5900000000888",
            bulk_ean=BULK_EAN,
            units_per_carton=12,
            require_recv_master_carton=False,
            track_batch=False,
        )
    )
    session.commit()
    monkeypatch.setattr(
        "backend.services.receiving_scan_service.load_wms_settings_for_product",
        lambda db, tenant_id, warehouse_id=None: settings_row,
    )
    monkeypatch.setattr(
        "backend.services.receiving_scan_service.scan_looks_like_gs1",
        lambda _k: False,
    )
    out = resolve_receiving_scan(session, 1, BULK_EAN)
    assert out.found is True
    assert out.match_kind == "bulk_ean"
    assert out.default_quantity == 12
    session.close()


def test_hard_delete_import_uses_dock_lot_keys():
    src = (
        Path(__file__).resolve().parents[1]
        / "services"
        / "stock_document_hard_delete_service.py"
    ).read_text(encoding="utf-8")
    assert "dock_lot_keys_for_pz_line" in src
    assert 'getattr(prod, "track_batch"' not in src
    assert 'getattr(prod, "track_expiry"' not in src


def test_item_storage_lot_key_source_uses_dock_helper():
    src = (
        Path(__file__).resolve().parents[1]
        / "services"
        / "stock_document_service.py"
    ).read_text(encoding="utf-8")
    fn = src.split("def _item_storage_lot_inventory_key")[1].split("\ndef ")[0]
    assert "dock_lot_keys_for_pz_line" in fn
    assert "track_batch" not in fn
    assert "track_expiry" not in fn


@pytest.fixture
def dock_putaway_db():
    """Minimal receive→dock→putaway identity check via transfer helpers."""
    engine = create_engine("sqlite:///:memory:")
    for model in (Tenant, Warehouse, Location, Product, Inventory):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(Tenant(id=1, name="T", default_warehouse_id=1))
    db.add(Warehouse(id=1, tenant_id=1, name="WH"))
    dock = Location(id=10, warehouse_id=1, name="DOCK-IN", type="dock", location_type="DOCK")
    bin_loc = Location(id=20, warehouse_id=1, name="A-01", type="pick")
    db.add(dock)
    db.add(bin_loc)
    db.add(
        Product(
            id=1,
            tenant_id=1,
            name="P",
            sku="P1",
            ean="5900000000001",
            track_batch=False,
            track_expiry=False,
        )
    )
    db.add(
        Inventory(
            tenant_id=1,
            warehouse_id=1,
            location_id=10,
            product_id=1,
            quantity=5.0,
            batch_number=LOT,
            expiry_date=EXPIRY,
            stock_disposition=STOCK_DISPOSITION_SALEABLE,
        )
    )
    db.commit()
    try:
        yield db
    finally:
        db.close()


def test_b_c_putaway_transfer_keeps_lot_when_legacy_track_off(dock_putaway_db, monkeypatch):
    from backend.services.wms_putaway_service import _transfer_from_dock_to_location

    db = dock_putaway_db
    row = SimpleNamespace(
        id=1,
        product_id=1,
        received_quantity=5.0,
        quantity_putaway=0.0,
        batch_number=LOT,
        expiry_date=EXPIRY,
        stock_disposition=STOCK_DISPOSITION_SALEABLE,
        return_disposition=None,
    )
    doc = SimpleNamespace(warehouse_id=1, location_id=10)
    monkeypatch.setattr(
        "backend.services.wms_putaway_service._document_line_putaway_remaining",
        lambda *_a, **_k: 5.0,
    )
    monkeypatch.setattr(
        "backend.services.wms_putaway_service._ensure_dock_inventory_for_putaway",
        lambda **_k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_putaway_service.copy_damage_trace_between_inventory",
        lambda *_a, **_k: None,
    )

    bn, ed = dock_lot_keys_for_pz_line(row)
    assert bn == LOT and ed == EXPIRY

    _transfer_from_dock_to_location(
        db,
        tenant_id=1,
        row=row,
        doc=doc,
        dock_id=10,
        target_location_id=20,
        loc_uuid=None,
        quantity=5.0,
        from_carrier_id=None,
        to_carrier_id=None,
        bn=bn,
        ed_store=ed,
        sd=STOCK_DISPOSITION_SALEABLE,
    )
    db.commit()

    dest = (
        db.query(Inventory)
        .filter(
            Inventory.location_id == 20,
            Inventory.product_id == 1,
            Inventory.batch_number == LOT,
            Inventory.expiry_date == EXPIRY,
        )
        .one()
    )
    assert float(dest.quantity) == 5.0
    dock_left = (
        db.query(Inventory)
        .filter(Inventory.location_id == 10, Inventory.product_id == 1)
        .all()
    )
    assert not dock_left or all(float(x.quantity or 0) <= 1e-9 for x in dock_left)
