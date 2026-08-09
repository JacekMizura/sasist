"""
Packing finish must not abort when packaging material stock is insufficient.

  python -m pytest backend/tests/test_packing_finish_packaging_stock.py -q
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from backend.services.packaging_materials.packing_consume_service import (
    PackagingConsumeLine,
    create_packing_packaging_rw,
)
from backend.services.wms_packing_service import (
    WmsPackingPostPackStepResult,
    _run_wms_packing_post_pack_pipeline,
)


def test_pipeline_packaging_rw_stock_shortage_is_soft_fail():
    """ValueError o braku stanu → krok packaging_rw ok=False, pipeline nie rzuca."""
    order = SimpleNamespace(id=1191, selected_carton_id="d26516c5-0dd7-4dad-a4d5-17a3399ed456")
    db = MagicMock()
    settings = SimpleNamespace(
        auto_actions_json='{"create_document":false,"generate_shipment":false,"print_document":false,"print_label":false,"change_order_status":false}',
        document_settings_json="{}",
        fallback_label_json="{}",
        packing_after_finish_action="STAY",
        packed_status_id=None,
    )

    with (
        patch(
            "backend.services.wms_packing_service._get_or_create_wms_packing_settings_row",
            return_value=settings,
        ),
        patch(
            "backend.services.wms_packing_service._packing_step_apply_packed_status",
            return_value=WmsPackingPostPackStepResult(
                step="change_order_status",
                ok=True,
                skipped=True,
                message="disabled",
            ),
        ),
        patch(
            "backend.services.packaging_materials.packing_consume_service.create_packing_packaging_rw",
            side_effect=ValueError("Niewystarczający stan materiału opakowaniowego"),
        ),
    ):
        out = _run_wms_packing_post_pack_pipeline(
            db,
            order=order,
            tenant_id=1,
            warehouse_id=1,
            operator_user_id=1,
        )

    rw = next(s for s in out if s.step == "packaging_rw")
    assert rw.ok is False
    assert "Niewystarczający stan" in (rw.message or "")


def test_create_packing_rw_passes_allow_negative_and_warns_on_zero_stock():
    """Przy allow_negative=True zużycie idzie mimo stanu 0 (ostrzeżenie w logu)."""
    carton_id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    order = SimpleNamespace(
        id=1191,
        selected_carton_id=carton_id,
        packing_consumables_json=None,
        packing_packaging_rw_document_id=None,
    )
    series = SimpleNamespace(id="d26516c5-0dd7-4dad-a4d5-17a3399ed456")
    carton = SimpleNamespace(id=carton_id, tenant_id=1, name="Box")
    product = SimpleNamespace(id=42)
    doc = SimpleNamespace(id=99)
    db = MagicMock()
    captured: dict = {}

    def fake_issue(**kwargs):
        captured.update(kwargs)
        assert kwargs.get("allow_negative") is True
        return 7

    with (
        patch(
            "backend.services.packaging_materials.packing_consume_service.require_warehouse_series",
            return_value=series,
        ),
        patch(
            "backend.services.packaging_materials.packing_consume_service.create_stock_document",
            return_value=doc,
        ),
        patch("backend.services.document_number_service.assign_series_number_to_stock_document"),
        patch(
            "backend.services.packaging_materials.packing_consume_service._load_wm_row",
            return_value=carton,
        ),
        patch(
            "backend.services.packaging_materials.packing_consume_service.ensure_carton_stockable_product",
            return_value=product,
        ),
        patch(
            "backend.services.packaging_materials.packing_consume_service.packaging_inventory_quantity",
            return_value=0.0,
        ),
        patch(
            "backend.services.packaging_materials.packing_consume_service.apply_packaging_inventory_issue",
            side_effect=lambda *a, **k: fake_issue(**k),
        ),
        patch("backend.services.packaging_materials.packing_consume_service.append_issue_operation"),
        patch(
            "backend.services.packaging_materials.packing_consume_service.StockDocumentItem",
            return_value=SimpleNamespace(),
        ),
        patch("backend.services.packaging_materials.packing_consume_service._logger") as log,
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
    assert captured.get("allow_negative") is True
    assert any(
        "PACKING_PACKAGING_RW_STOCK_SHORTAGE" in str(c.args[0])
        for c in log.warning.call_args_list
    )


def test_pipeline_calls_create_packing_rw_with_allow_negative_true():
    order = SimpleNamespace(id=1191, selected_carton_id="c1")
    db = MagicMock()
    settings = SimpleNamespace(
        auto_actions_json='{"create_document":false,"generate_shipment":false,"print_document":false,"print_label":false,"change_order_status":false}',
        document_settings_json="{}",
        fallback_label_json="{}",
        packing_after_finish_action="STAY",
        packed_status_id=None,
    )
    captured: dict = {}

    def fake_rw(*_a, **kwargs):
        captured.update(kwargs)
        return SimpleNamespace(id=55)

    with (
        patch(
            "backend.services.wms_packing_service._get_or_create_wms_packing_settings_row",
            return_value=settings,
        ),
        patch(
            "backend.services.wms_packing_service._packing_step_apply_packed_status",
            return_value=WmsPackingPostPackStepResult(
                step="change_order_status",
                ok=True,
                skipped=True,
                message="disabled",
            ),
        ),
        patch(
            "backend.services.packaging_materials.packing_consume_service.create_packing_packaging_rw",
            side_effect=fake_rw,
        ),
    ):
        out = _run_wms_packing_post_pack_pipeline(
            db,
            order=order,
            tenant_id=1,
            warehouse_id=1,
            operator_user_id=1,
        )

    assert captured.get("allow_negative") is True
    rw = next(s for s in out if s.step == "packaging_rw")
    assert rw.ok is True
    assert "id=55" in (rw.message or "")
