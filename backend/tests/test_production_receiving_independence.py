"""Independence matrix: Receiving policy vs Production policy (cases A–G)."""

from __future__ import annotations

from backend.models.product import Product
from backend.models.wms_settings import WmsSettings
from backend.services.product_validation_policy import resolve_effective_receiving_requirements
from backend.services.production_execution.production_traceability_policy import (
    resolve_effective_production_traceability,
    validate_product_production_trace_modes,
)
import pytest


def _recv_settings(**kwargs) -> WmsSettings:
    base = dict(
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
    base.update(kwargs)
    return WmsSettings(**base)


def _product(**kwargs) -> Product:
    defaults = dict(
        track_batch=True,
        track_serial=True,
        track_expiry=True,
        validation_skip_batch=False,
        validation_skip_serial=False,
        validation_skip_expiry=False,
        production_trace_batch_mode="INHERIT",
        production_trace_serial_mode="INHERIT",
        production_trace_expiry_mode="INHERIT",
    )
    defaults.update(kwargs)
    return Product(**defaults)


def test_A_pz_lot_off_production_lot_required():
    product = _product()
    recv = resolve_effective_receiving_requirements(
        product, _recv_settings(validation_require_batch=False)
    )
    prod = resolve_effective_production_traceability(
        product, {"mode": "CONFIGURED", "require_batch": True}
    )
    assert recv.track_batch is False
    assert prod.require_batch is True


def test_B_pz_lot_required_production_lot_off():
    product = _product()
    recv = resolve_effective_receiving_requirements(
        product, _recv_settings(validation_require_batch=True)
    )
    prod = resolve_effective_production_traceability(
        product, {"mode": "CONFIGURED", "require_batch": False}
    )
    assert recv.track_batch is True
    assert prod.require_batch is False


def test_C_pz_sn_off_production_sn_required():
    product = _product()
    recv = resolve_effective_receiving_requirements(
        product, _recv_settings(validation_require_serial=False)
    )
    prod = resolve_effective_production_traceability(
        product, {"mode": "CONFIGURED", "require_serial": True}
    )
    assert recv.track_serial is False
    assert prod.require_serial is True


def test_D_global_production_lot_on_product_off():
    product = _product(production_trace_batch_mode="OFF")
    prod = resolve_effective_production_traceability(
        product, {"mode": "CONFIGURED", "require_batch": True}
    )
    assert prod.require_batch is False


def test_E_global_production_lot_off_product_require():
    product = _product(production_trace_batch_mode="REQUIRE")
    prod = resolve_effective_production_traceability(
        product, {"mode": "CONFIGURED", "require_batch": False}
    )
    assert prod.require_batch is True


def test_F_track_serial_false_rejects_require():
    product = _product(track_serial=False, production_trace_serial_mode="REQUIRE")
    with pytest.raises(ValueError, match="Wymagany"):
        validate_product_production_trace_modes(product)


def test_G_production_mode_off_ignores_overrides():
    product = _product(production_trace_batch_mode="REQUIRE", production_trace_serial_mode="REQUIRE")
    prod = resolve_effective_production_traceability(
        product, {"mode": "OFF", "require_batch": True, "require_serial": True}
    )
    assert prod.require_batch is False
    assert prod.require_serial is False
    assert prod.require_expiry is False


def test_changing_production_settings_does_not_change_receiving():
    product = _product()
    recv_settings = _recv_settings(validation_require_batch=True, validation_require_serial=True)
    before = resolve_effective_receiving_requirements(product, recv_settings)
    _ = resolve_effective_production_traceability(
        product, {"mode": "CONFIGURED", "require_batch": False, "require_serial": False}
    )
    after = resolve_effective_receiving_requirements(product, recv_settings)
    assert before.track_batch == after.track_batch is True
    assert before.track_serial == after.track_serial is True


def test_changing_receiving_settings_does_not_change_production():
    product = _product()
    prod_cfg = {"mode": "CONFIGURED", "require_batch": True, "require_serial": False}
    before = resolve_effective_production_traceability(product, prod_cfg)
    _ = resolve_effective_receiving_requirements(
        product, _recv_settings(validation_require_batch=False, validation_require_serial=True)
    )
    after = resolve_effective_production_traceability(product, prod_cfg)
    assert before.require_batch == after.require_batch is True
    assert before.require_serial == after.require_serial is False
