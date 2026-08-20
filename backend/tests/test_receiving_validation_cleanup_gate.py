"""
FINAL GATE regressions for WMS Przyjęcia → Ogólne cleanup (cases A–O).

  python -m pytest backend/tests/test_receiving_validation_cleanup_gate.py -q
"""

from __future__ import annotations

import inspect
from pathlib import Path
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.product import Product
from backend.models.product_barcode import ProductBarcode
from backend.models.inventory_serial import InventorySerial
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_settings import WmsSettings
from backend.services.product_receiving_requirements import validate_required_product_data
from backend.services.product_validation_policy import resolve_effective_receiving_requirements
from backend.services.receiving_scan_service import resolve_receiving_scan
from backend.services.stock_document_service import accept_stock_document
from backend.services.wms_receiving_service import (
    _lot_from_wms_body,
    mark_wms_receiving_pz_item_damaged,
)


BULK_EAN = "5900000000012"


def _settings(**kwargs) -> SimpleNamespace:
    base = dict(
        validation_policy_migrated=True,
        validation_require_dimensions=False,
        validation_require_weight=False,
        validation_require_batch=False,
        validation_require_expiry=False,
        validation_require_serial=False,
        validation_require_master_carton=True,  # legacy dead flag — must not affect migrated policy
        validation_require_master_carton_ean=False,
        validation_require_master_carton_qty=False,
        validation_require_master_carton_dims=False,
        validation_require_master_carton_weight=False,
    )
    base.update(kwargs)
    return SimpleNamespace(**base)


def _product(**kwargs) -> SimpleNamespace:
    base = dict(
        validation_skip_dimensions=False,
        validation_skip_weight=False,
        validation_skip_batch=False,
        validation_skip_expiry=False,
        validation_skip_serial=False,
        validation_skip_master_carton=False,
        validation_skip_master_carton_ean=False,
        validation_skip_master_carton_qty=False,
        validation_skip_master_carton_dims=False,
        validation_skip_master_carton_weight=False,
        require_recv_height=False,
        require_recv_width=False,
        require_recv_length=False,
        require_recv_weight=False,
        require_recv_master_carton=True,
        require_recv_master_carton_ean=False,
        require_recv_master_carton_qty=False,
        require_recv_master_carton_dims=False,
        require_recv_master_carton_weight=False,
        track_batch=True,
        track_expiry=True,
        track_serial=True,
        height=None,
        width=None,
        length=None,
        weight=None,
        bulk_ean=None,
        units_per_carton=None,
        carton_length_cm=None,
        carton_width_cm=None,
        carton_height_cm=None,
        carton_weight_kg=None,
        metadata_json=None,
    )
    base.update(kwargs)
    return SimpleNamespace(**base)


# --- A–C master-data completeness ---


def test_a_dimensions_on_missing_lwh_incomplete():
    settings = _settings(validation_require_dimensions=True)
    product = _product(height=None, width=None, length=None)
    v = validate_required_product_data(product, settings)
    assert v.complete is False
    keys = {m.key for m in v.missing}
    assert {"height", "width", "length"} <= keys


def test_b_weight_on_zero_incomplete():
    settings = _settings(validation_require_weight=True)
    product = _product(weight=0)
    v = validate_required_product_data(product, settings)
    assert v.complete is False
    assert any(m.key == "weight" for m in v.missing)


def test_b_weight_on_positive_ok():
    settings = _settings(validation_require_weight=True)
    product = _product(weight=0.25)
    v = validate_required_product_data(product, settings)
    assert v.complete is True


def test_c_weight_off_does_not_require():
    settings = _settings(validation_require_weight=False)
    product = _product(weight=None)
    v = validate_required_product_data(product, settings)
    assert v.complete is True
    assert not any(m.key == "weight" for m in v.missing)


# --- D–F traceability effective policy ---


def test_d_batch_expiry_serial_global_on_skip_false_required():
    settings = _settings(
        validation_require_batch=True,
        validation_require_expiry=True,
        validation_require_serial=True,
    )
    product = _product(
        validation_skip_batch=False,
        validation_skip_expiry=False,
        validation_skip_serial=False,
    )
    eff = resolve_effective_receiving_requirements(product, settings)
    assert eff.track_batch is True
    assert eff.track_expiry is True
    assert eff.track_serial is True


def test_e_global_on_sku_skip_true_not_required():
    settings = _settings(
        validation_require_batch=True,
        validation_require_expiry=True,
        validation_require_serial=True,
    )
    product = _product(
        validation_skip_batch=True,
        validation_skip_expiry=True,
        validation_skip_serial=True,
        track_batch=True,
        track_expiry=True,
        track_serial=True,
    )
    eff = resolve_effective_receiving_requirements(product, settings)
    assert eff.track_batch is False
    assert eff.track_expiry is False
    assert eff.track_serial is False


def test_f_global_off_skip_false_not_required():
    settings = _settings(
        validation_require_batch=False,
        validation_require_expiry=False,
        validation_require_serial=False,
    )
    product = _product(
        validation_skip_batch=False,
        validation_skip_expiry=False,
        validation_skip_serial=False,
        track_batch=True,
        track_expiry=True,
        track_serial=True,
    )
    eff = resolve_effective_receiving_requirements(product, settings)
    assert eff.track_batch is False
    assert eff.track_expiry is False
    assert eff.track_serial is False


# --- G–H mark_damaged / office accept use effective policy ---


def test_g_mark_damaged_lot_uses_effective_policy():
    settings = _settings(validation_require_batch=True, validation_require_expiry=True)
    skipped = _product(validation_skip_batch=True, validation_skip_expiry=True, track_batch=True)
    bn, ed = _lot_from_wms_body(skipped, None, None, settings)
    assert bn == ""
    assert ed is not None

    required = _product(validation_skip_batch=False, track_batch=True)
    with pytest.raises(ValueError, match="partii"):
        _lot_from_wms_body(required, None, None, settings)

    mark_src = inspect.getsource(mark_wms_receiving_pz_item_damaged)
    assert "_lot_from_wms_body" in mark_src
    assert "_wms_settings_for_doc" in mark_src


def test_h_office_accept_uses_effective_policy():
    src = inspect.getsource(accept_stock_document)
    assert "resolve_effective_receiving_requirements" in src
    assert "load_wms_settings_for_product" in src
    # Must not fall back to raw product.track_* for migrated accept path.
    assert "eff.track_batch" in src or "eff = resolve_effective_receiving_requirements" in src


# --- I–J bulk EAN scan independent of carton requirements ---


@pytest.fixture
def db_bulk(monkeypatch):
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
        validation_require_dimensions=False,
        validation_require_weight=False,
        validation_require_batch=False,
        validation_require_expiry=False,
        validation_require_serial=False,
        validation_require_master_carton=False,
        validation_require_master_carton_ean=False,
        validation_require_master_carton_qty=False,
        validation_require_master_carton_dims=False,
        validation_require_master_carton_weight=False,
    )
    session.add(settings_row)
    session.add(
        Product(
            id=501,
            tenant_id=1,
            name="Carton SKU",
            sku="CARTON-1",
            ean="5900000000099",
            bulk_ean=BULK_EAN,
            units_per_carton=12,
            height=10,
            width=5,
            length=2,
            weight=0.5,
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
    try:
        yield session, settings_row
    finally:
        session.close()


def test_i_bulk_ean_scan_works_with_carton_requirements_off(db_bulk):
    session, settings_row = db_bulk
    out = resolve_receiving_scan(session, 1, BULK_EAN)
    assert out.found is True
    assert out.match_kind == "bulk_ean"
    assert out.product_id == 501
    # Requirements OFF — still resolves
    assert settings_row.validation_require_master_carton_ean is False


def test_j_bulk_ean_default_qty_from_units_per_carton(db_bulk):
    session, _ = db_bulk
    out = resolve_receiving_scan(session, 1, BULK_EAN)
    assert out.default_quantity == 12


# --- K–N carton master-data completeness ---


def test_k_carton_ean_required_missing_incomplete():
    settings = _settings(validation_require_master_carton_ean=True)
    v = validate_required_product_data(_product(bulk_ean=""), settings)
    assert v.complete is False
    assert any(m.key == "bulk_ean" for m in v.missing)


def test_l_carton_qty_zero_incomplete():
    settings = _settings(validation_require_master_carton_qty=True)
    v = validate_required_product_data(_product(units_per_carton=0), settings)
    assert v.complete is False
    assert any(m.key == "units_per_carton" for m in v.missing)


def test_m_carton_dims_one_zero_incomplete():
    settings = _settings(validation_require_master_carton_dims=True)
    v = validate_required_product_data(
        _product(carton_length_cm=10, carton_width_cm=0, carton_height_cm=5),
        settings,
    )
    assert v.complete is False
    assert any(m.key == "carton_dimensions" for m in v.missing)


def test_n_carton_weight_zero_incomplete():
    settings = _settings(validation_require_master_carton_weight=True)
    v = validate_required_product_data(_product(carton_weight_kg=0), settings)
    assert v.complete is False
    assert any(m.key == "carton_weight_kg" for m in v.missing)


# --- O: no active runtime reader of require_master_carton / validation_require_master_carton ---


def test_o_migrated_resolver_ignores_require_master_carton_flag():
    settings = _settings(validation_require_master_carton=True)
    product = _product(require_recv_master_carton=True, validation_skip_master_carton=False)
    eff = resolve_effective_receiving_requirements(product, settings)
    assert eff.require_recv_master_carton is False


def test_o_no_active_runtime_reader_of_settings_require_master_carton():
    """Migrated policy hard-codes False; completeness does not gate on the dead flag."""
    policy_src = (
        Path(__file__).resolve().parents[1] / "services" / "product_validation_policy.py"
    ).read_text(encoding="utf-8")
    # Migrated return must force False (not master("validation_require_master_carton", ...)).
    migrated = policy_src.split("def resolve_effective_receiving_requirements")[1].split(
        "def effective_track_batch"
    )[0]
    assert "require_recv_master_carton=False" in migrated
    assert 'master("validation_require_master_carton"' not in migrated
    assert 'master("validation_require_master_carton",' not in migrated

    api_src = (Path(__file__).resolve().parents[1] / "api" / "wms_settings.py").read_text(
        encoding="utf-8"
    )
    assert "require_master_carton=False" in api_src
    # PUT must not assign the legacy settings column.
    assert "row.validation_require_master_carton =" not in api_src

    req_src = (
        Path(__file__).resolve().parents[1] / "services" / "product_receiving_requirements.py"
    ).read_text(encoding="utf-8")
    assert "eff.require_recv_master_carton and" not in req_src
    assert "eff.require_recv_master_carton:" not in req_src


def test_regression_cannot_create_stock_bypassing_traceability_lot_gate():
    """Qty→inventory lot path raises when effective batch required and missing."""
    settings = _settings(validation_require_batch=True)
    product = _product(validation_skip_batch=False)
    with pytest.raises(ValueError, match="partii"):
        _lot_from_wms_body(product, None, None, settings)
