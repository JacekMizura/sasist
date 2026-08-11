"""Unit tests for picking terminal validation resolver."""

from __future__ import annotations

import pytest

from backend.services.wms_picking_terminal_settings_service import (
    assert_pick_terminal_gates,
    location_scan_required,
    product_has_scannable_code,
    resolve_picking_validation_gates,
)
from backend.services.wms_basket_put.error_codes import (
    PICK_LOCATION_REQUIRED,
    PRODUCT_SCAN_REQUIRED,
    PRODUCT_WITHOUT_SCAN_CODE_BLOCKED,
)
from backend.services.wms_basket_put.scan_service import BasketPutError


class _FakeProduct:
    def __init__(self, *, ean=None, barcode=None, sku=None, symbol=None, extras=None):
        self.ean = ean
        self.barcode = barcode
        self.sku = sku
        self.symbol = symbol
        self.extra_barcodes = extras or []


class _FakeExtra:
    def __init__(self, ean: str):
        self.ean = ean


def test_location_scan_priority_a_always_on():
    assert location_scan_required(
        location_count=1, require_location_scan=True, disable_force_when_many=True
    )
    assert location_scan_required(
        location_count=5, require_location_scan=True, disable_force_when_many=True
    )


def test_location_scan_priority_b_multi_force():
    assert location_scan_required(
        location_count=2, require_location_scan=False, disable_force_when_many=False
    )
    assert not location_scan_required(
        location_count=2, require_location_scan=False, disable_force_when_many=True
    )


def test_location_scan_priority_c_single_no_force():
    assert not location_scan_required(
        location_count=1, require_location_scan=False, disable_force_when_many=False
    )


def test_product_has_scannable_code_accepts_sku_and_extra():
    assert product_has_scannable_code(_FakeProduct(ean="590123"))
    assert product_has_scannable_code(_FakeProduct(sku="SKU-1"))
    assert product_has_scannable_code(_FakeProduct(barcode="PRD-9"))
    assert product_has_scannable_code(_FakeProduct(extras=[_FakeExtra("111")]))
    assert not product_has_scannable_code(_FakeProduct())


def test_gates_product_scan_on_off():
    on = resolve_picking_validation_gates(
        require_product_scan_at_least_once=True,
        require_location_scan=False,
        disable_force_location_scan_when_many=False,
        allow_reserve_location_picking=False,
        allow_products_without_ean=False,
        location_count=1,
        has_scannable_product_code=True,
    )
    assert on.needs_product_scan is True
    off = resolve_picking_validation_gates(
        require_product_scan_at_least_once=False,
        require_location_scan=False,
        disable_force_location_scan_when_many=False,
        allow_reserve_location_picking=False,
        allow_products_without_ean=False,
        location_count=1,
        has_scannable_product_code=True,
    )
    assert off.needs_product_scan is False


def test_gates_no_ean_allow_manual_avoids_deadlock():
    g = resolve_picking_validation_gates(
        require_product_scan_at_least_once=True,
        require_location_scan=False,
        disable_force_location_scan_when_many=False,
        allow_reserve_location_picking=False,
        allow_products_without_ean=True,
        location_count=1,
        has_scannable_product_code=False,
    )
    assert g.needs_product_scan is False
    assert g.allow_manual_product_confirm is True
    assert g.product_blocked_without_code is False


def test_gates_no_ean_blocked():
    g = resolve_picking_validation_gates(
        require_product_scan_at_least_once=True,
        require_location_scan=False,
        disable_force_location_scan_when_many=False,
        allow_reserve_location_picking=False,
        allow_products_without_ean=False,
        location_count=1,
        has_scannable_product_code=False,
    )
    assert g.product_blocked_without_code is True


def test_assert_pick_rejects_missing_product_scan():
    g = resolve_picking_validation_gates(
        require_product_scan_at_least_once=True,
        require_location_scan=False,
        disable_force_location_scan_when_many=False,
        allow_reserve_location_picking=False,
        allow_products_without_ean=False,
        location_count=1,
        has_scannable_product_code=True,
    )
    with pytest.raises(BasketPutError) as ei:
        assert_pick_terminal_gates(g, product_scan_confirmed=False, location_scan_confirmed=True)
    assert ei.value.code == PRODUCT_SCAN_REQUIRED


def test_assert_pick_rejects_missing_location_scan_single():
    g = resolve_picking_validation_gates(
        require_product_scan_at_least_once=False,
        require_location_scan=True,
        disable_force_location_scan_when_many=True,
        allow_reserve_location_picking=False,
        allow_products_without_ean=False,
        location_count=1,
        has_scannable_product_code=True,
    )
    with pytest.raises(BasketPutError) as ei:
        assert_pick_terminal_gates(g, product_scan_confirmed=True, location_scan_confirmed=False)
    assert ei.value.code == PICK_LOCATION_REQUIRED


def test_assert_pick_rejects_missing_location_scan_multi():
    g = resolve_picking_validation_gates(
        require_product_scan_at_least_once=False,
        require_location_scan=False,
        disable_force_location_scan_when_many=False,
        allow_reserve_location_picking=False,
        allow_products_without_ean=False,
        location_count=3,
        has_scannable_product_code=True,
    )
    with pytest.raises(BasketPutError) as ei:
        assert_pick_terminal_gates(g, product_scan_confirmed=True, location_scan_confirmed=False)
    assert ei.value.code == PICK_LOCATION_REQUIRED


def test_assert_pick_allows_multi_without_scan_when_disabled():
    g = resolve_picking_validation_gates(
        require_product_scan_at_least_once=False,
        require_location_scan=False,
        disable_force_location_scan_when_many=True,
        allow_reserve_location_picking=False,
        allow_products_without_ean=False,
        location_count=3,
        has_scannable_product_code=True,
    )
    assert g.needs_location_scan is False
    assert_pick_terminal_gates(g, product_scan_confirmed=False, location_scan_confirmed=False)


def test_assert_pick_blocks_product_without_code():
    g = resolve_picking_validation_gates(
        require_product_scan_at_least_once=True,
        require_location_scan=False,
        disable_force_location_scan_when_many=False,
        allow_reserve_location_picking=False,
        allow_products_without_ean=False,
        location_count=1,
        has_scannable_product_code=False,
    )
    with pytest.raises(BasketPutError) as ei:
        assert_pick_terminal_gates(g, product_scan_confirmed=True, location_scan_confirmed=True)
    assert ei.value.code == PRODUCT_WITHOUT_SCAN_CODE_BLOCKED
