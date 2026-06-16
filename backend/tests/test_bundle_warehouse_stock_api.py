"""Regression — GET /api/bundles/{id}/warehouse-stock (B1, STOCK_PRODUCTION import)."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

import backend.api.bundle as bundle_api
from backend.api.bundle import get_bundle_warehouse_stock
from backend.services.bundle_operational_mode import ON_DEMAND_ASSEMBLY, STOCK_PRODUCTION


def test_bundle_api_module_imports_stock_production() -> None:
    assert bundle_api.STOCK_PRODUCTION == STOCK_PRODUCTION


def _bundle_row(*, bundle_id: int, mode: str, linked: int | None) -> SimpleNamespace:
    return SimpleNamespace(
        id=bundle_id,
        tenant_id=1,
        deleted_at=None,
        bundle_fulfillment_mode=mode,
        stock_mode="physical" if mode == STOCK_PRODUCTION else "virtual",
        fulfillment_mode="manufacturing" if mode == STOCK_PRODUCTION else "assembly",
        linked_product_id=linked,
    )


def test_warehouse_stock_stock_production_no_name_error() -> None:
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = _bundle_row(
        bundle_id=1, mode=STOCK_PRODUCTION, linked=10
    )
    payload = {"product_id": 10, "name": "Shadow SKU"}
    with patch(
        "backend.services.product_detail_service.build_product_detail_payload",
        return_value=payload,
    ) as build_payload:
        result = get_bundle_warehouse_stock(
            bundle_id=1,
            tenant_id=1,
            warehouse_id=None,
            db=db,
        )
    assert result == payload
    build_payload.assert_called_once_with(
        db,
        product_id=10,
        tenant_id=1,
        warehouse_id=None,
    )


def test_warehouse_stock_on_demand_assembly_returns_400_no_name_error() -> None:
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = _bundle_row(
        bundle_id=2, mode=ON_DEMAND_ASSEMBLY, linked=None
    )
    with pytest.raises(HTTPException) as exc:
        get_bundle_warehouse_stock(
            bundle_id=2,
            tenant_id=1,
            warehouse_id=None,
            db=db,
        )
    assert exc.value.status_code == 400
    assert exc.value.detail == "Bundle is not STOCK_PRODUCTION"
