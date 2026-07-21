"""
Receiving validation SSOT: global ∧ ¬product_skip + scan gate regressions.

  python -m pytest backend/tests/test_receiving_validation_effective_policy.py -q
"""

from __future__ import annotations

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
from backend.services.inventory_serial_service import lot_keys_from_product
from backend.services.product_receiving_requirements import validate_required_product_data
from backend.services.product_validation_policy import (
    build_receiving_validation_requirements_payload,
    resolve_effective_receiving_requirements,
)
from backend.services.receiving_scan_service import resolve_receiving_scan


EAN_ST003 = "5905450181208"


def _settings(**kwargs) -> SimpleNamespace:
    base = dict(
        validation_policy_migrated=True,
        validation_require_dimensions=True,
        validation_require_weight=True,
        validation_require_batch=True,
        validation_require_expiry=True,
        validation_require_serial=True,
        validation_require_master_carton=False,
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
        require_recv_master_carton=False,
        require_recv_master_carton_ean=False,
        require_recv_master_carton_qty=False,
        require_recv_master_carton_dims=False,
        require_recv_master_carton_weight=False,
        # Legacy columns may still be True while skips disable effective policy.
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


def test_case_a_serial_override_disables_effective():
    settings = _settings()
    product = _product(validation_skip_serial=True)
    eff = resolve_effective_receiving_requirements(product, settings)
    assert eff.track_serial is False
    payload = build_receiving_validation_requirements_payload(product, settings)
    assert payload["serial_number"]["required"] is False


def test_case_b_batch_expiry_overrides():
    settings = _settings()
    product = _product(validation_skip_batch=True, validation_skip_expiry=True)
    eff = resolve_effective_receiving_requirements(product, settings)
    assert eff.track_batch is False
    assert eff.track_expiry is False
    bn, _ed = lot_keys_from_product(
        product, batch_number=None, expiry_date=None, wms_settings=settings
    )
    assert bn == ""


def test_case_c_serial_required_without_override():
    settings = _settings()
    product = _product(validation_skip_serial=False)
    eff = resolve_effective_receiving_requirements(product, settings)
    assert eff.track_serial is True
    assert build_receiving_validation_requirements_payload(product, settings)["serial_number"][
        "required"
    ]


def test_case_d_dimensions_missing_blocks_completion_not_identity():
    settings = _settings(
        validation_require_serial=False,
        validation_require_batch=False,
        validation_require_expiry=False,
    )
    product = _product(
        validation_skip_dimensions=False,
        height=None,
        width=None,
        length=None,
        track_serial=False,
        track_batch=False,
        track_expiry=False,
    )
    v = validate_required_product_data(product, settings)
    assert v.show_completion_modal is True
    assert any(m.key in ("height", "width", "length") for m in v.missing)
    assert v.complete is False


def test_case_e_dimensions_override_allows_missing():
    settings = _settings(
        validation_require_serial=False,
        validation_require_batch=False,
        validation_require_expiry=False,
        validation_require_weight=False,
    )
    product = _product(
        validation_skip_dimensions=True,
        height=None,
        width=None,
        length=None,
        track_serial=False,
        track_batch=False,
        track_expiry=False,
    )
    v = validate_required_product_data(product, settings)
    assert v.show_completion_modal is False
    assert v.complete is True
    assert (
        build_receiving_validation_requirements_payload(product, settings)["dimensions"]["required"]
        is False
    )


def test_case_g_st003_shaped_overrides_clear_trace():
    """LIVE ST-003: global all ON, product skips batch/expiry/serial."""
    settings = _settings()
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
    payload = build_receiving_validation_requirements_payload(product, settings)
    assert payload["batch"]["required"] is False
    assert payload["expiry_date"]["required"] is False
    assert payload["serial_number"]["required"] is False


def test_global_off_skip_cannot_force_on():
    settings = _settings(validation_require_serial=False)
    product = _product(validation_skip_serial=False, track_serial=True)
    assert resolve_effective_receiving_requirements(product, settings).track_serial is False


@pytest.fixture
def db(monkeypatch):
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
        validation_require_dimensions=True,
        validation_require_weight=True,
        validation_require_batch=True,
        validation_require_expiry=True,
        validation_require_serial=True,
    )
    session.add(settings_row)
    session.add(
        Product(
            id=192,
            tenant_id=1,
            name="Sznurowadła CAT 150 cm",
            sku="ST-003",
            ean=EAN_ST003,
            track_batch=True,
            track_expiry=True,
            track_serial=True,
            validation_skip_batch=True,
            validation_skip_expiry=True,
            validation_skip_serial=True,
            height=10,
            width=5,
            length=2,
            weight=0.05,
        )
    )
    session.commit()

    monkeypatch.setattr(
        "backend.services.receiving_scan_service.load_wms_settings_for_product",
        lambda db, tenant_id, warehouse_id=None: settings_row,
    )
    # Avoid InventorySerial table in resolve path
    monkeypatch.setattr(
        "backend.services.receiving_scan_service.scan_looks_like_gs1",
        lambda _k: False,
    )

    try:
        yield session
    finally:
        session.close()


def test_case_a_h_scan_resolve_st003_no_serial_gate(db):
    out = resolve_receiving_scan(db, 1, EAN_ST003)
    assert out.found is True
    assert out.product_id == 192
    assert out.match_kind == "product_ean"
    assert out.track_serial is False
    assert out.track_batch is False
    assert out.track_expiry is False
    assert out.validation_requirements is not None
    vr = out.validation_requirements
    assert vr.serial_number.required is False
    assert vr.batch.required is False
    assert vr.expiry_date.required is False


def test_case_h_refresh_same_effective(db):
    a = resolve_receiving_scan(db, 1, EAN_ST003)
    b = resolve_receiving_scan(db, 1, EAN_ST003)
    assert a.track_serial is False
    assert b.track_serial is False
    assert a.track_batch == b.track_batch == False
    assert a.track_expiry == b.track_expiry == False


def test_case_c_scan_requires_serial_without_skip(db):
    p = db.get(Product, 192)
    p.validation_skip_serial = False
    db.commit()
    out = resolve_receiving_scan(db, 1, EAN_ST003)
    assert out.track_serial is True
    assert out.validation_requirements.serial_number.required is True
