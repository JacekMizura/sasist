"""
Regression: packing finish RW must accept DocumentSeries.id as UUID string.

  python -m pytest backend/tests/test_packing_packaging_rw_series_uuid.py -q
"""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from backend.services.packaging_materials.packing_consume_service import (
    PackagingConsumeLine,
    create_packing_packaging_rw,
)


def test_create_packing_packaging_rw_passes_series_id_as_string_not_int():
    """document_series.id is String(36) UUID — int(series.id) used to 400 finish."""
    series_uuid = "d26516c5-0dd7-4dad-a4d5-17a3399ed456"
    series = SimpleNamespace(id=series_uuid)
    carton_id = str(uuid.uuid4())
    order = SimpleNamespace(
        id=1191,
        selected_carton_id=carton_id,
        packing_consumables_json=None,
        packing_packaging_rw_document_id=None,
    )
    carton = SimpleNamespace(id=carton_id, tenant_id=1, name="Box")
    product = SimpleNamespace(id=42)
    doc = SimpleNamespace(id=99, tenant_id=1, warehouse_id=1)

    db = MagicMock()
    captured: dict = {}

    def fake_create_stock_document(_db, **kwargs):
        captured.update(kwargs)
        sid = kwargs.get("document_series_id")
        assert sid == series_uuid
        assert isinstance(sid, str)
        return doc

    with (
        patch(
            "backend.services.packaging_materials.packing_consume_service.require_warehouse_series",
            return_value=series,
        ),
        patch(
            "backend.services.packaging_materials.packing_consume_service.create_stock_document",
            side_effect=fake_create_stock_document,
        ),
        patch(
            "backend.services.document_number_service.assign_series_number_to_stock_document",
        ),
        patch(
            "backend.services.packaging_materials.packing_consume_service._load_wm_row",
            return_value=carton,
        ),
        patch(
            "backend.services.packaging_materials.packing_consume_service.ensure_carton_stockable_product",
            return_value=product,
        ),
        patch(
            "backend.services.packaging_materials.packing_consume_service.apply_packaging_inventory_issue",
            return_value=7,
        ),
        patch(
            "backend.services.packaging_materials.packing_consume_service.append_issue_operation",
        ),
        patch(
            "backend.services.packaging_materials.packing_consume_service.StockDocumentItem",
            return_value=SimpleNamespace(),
        ),
    ):
        out = create_packing_packaging_rw(
            db,
            order=order,
            tenant_id=1,
            warehouse_id=1,
            operator_user_id=1,
            lines=[PackagingConsumeLine(wm_kind="carton", wm_id=carton_id, qty=1.0)],
            allow_negative=True,
        )

    assert out is doc
    assert captured["document_series_id"] == series_uuid
    with pytest.raises(ValueError, match="invalid literal"):
        int(series_uuid)
