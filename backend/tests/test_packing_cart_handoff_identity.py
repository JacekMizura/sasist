"""
Packing cart handoff: custody vs packable queue — no fake „empty cart”,
no mix-up of orders.id vs business number.

  python -m pytest backend/tests/test_packing_cart_handoff_identity.py -q
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.wms_order_validation.lifecycle import apply_wms_validation_pass_revalidate
from backend.services.wms_order_validation.types import WmsOrderValidationResult
from backend.services.wms_packing_service import (
    _order_business_number,
    inspect_packing_cart_handoff,
)


def test_order_business_number_prefers_number_not_id():
    o = SimpleNamespace(id=1249, number="1236")
    assert _order_business_number(o) == "1236"
    assert _order_business_number(SimpleNamespace(id=1249, number=None)) == "1249"
    assert _order_business_number(SimpleNamespace(id=1249, number="  ")) == "1249"


def test_validation_pass_message_uses_business_number_not_internal_id():
    db = MagicMock()
    order = SimpleNamespace(
        id=1249,
        number="1236",
        order_ui_status_id=8,
        metadata_json="{}",
    )
    result = WmsOrderValidationResult(order_id=1249, validation_status="PASS", issues=[])
    with (
        patch(
            "backend.services.wms_order_validation.lifecycle._order_meta",
            return_value={},
        ),
        patch("backend.services.wms_order_validation.lifecycle._save_order_meta"),
        patch(
            "backend.services.wms_order_validation.lifecycle._status_name",
            return_value="Pakowanie",
        ),
        patch(
            "backend.services.wms_audit_service.insert_wms_order_event",
        ),
        patch(
            "backend.services.wms_audit_service.append_order_activity_for_wms",
        ) as act,
    ):
        apply_wms_validation_pass_revalidate(
            db,
            order=order,
            result=result,
            tenant_id=1,
            warehouse_id=1,
            operator_user_id=1,
        )
    msg = act.call_args.kwargs["message"]
    assert "#1236" in msg
    assert "#1249" not in msg


def test_cart_handoff_incomplete_picking_not_empty_message():
    """CART-0001 + order 1249 (#1236) w custody, nie packable → nie „brak zamówienia”."""
    db = MagicMock()
    cart = SimpleNamespace(
        id=3,
        code="CART-0001",
        barcode="CART-0001",
        name="120X80",
        type=SimpleNamespace(value="BULK"),
        tenant_id=1,
        warehouse_id=1,
    )
    order = SimpleNamespace(id=1249, number="1236", tenant_id=1, warehouse_id=1, items=[])

    q = MagicMock()
    q.filter.return_value = q
    q.first.return_value = cart
    db.query.return_value = q

    recovery = SimpleNamespace(
        totals=SimpleNamespace(oms_decision_lines=0, recovery_lines=2),
        has_recovery_work=True,
        has_relocation_work=False,
    )

    with (
        patch(
            "backend.services.cart_picking_lifecycle_service.get_cart_status",
            return_value=SimpleNamespace(value="PACKING"),
        ),
        patch(
            "backend.services.cart_stats_service.list_orders_on_cart",
            return_value=[order],
        ),
        patch(
            "backend.services.wms_packing_service.list_packing_orders",
            return_value=[],
        ),
        patch(
            "backend.services.braki_order_state_service.order_can_show_ready_pack",
            return_value=False,
        ),
        patch(
            "backend.services.recovery_workflow_service.resolve_order_recovery_state",
            return_value=recovery,
        ),
    ):
        out = inspect_packing_cart_handoff(
            db,
            tenant_id=1,
            warehouse_id=1,
            status_id=8,
            cart_id=3,
        )

    assert out["operator_state"] == "INCOMPLETE_PICKING"
    assert "nie przypisano" not in out["operator_message"].lower()
    assert "zbieranie" in out["operator_message"].lower()
    assert out["custody_orders"][0]["order_id"] == 1249
    assert out["custody_orders"][0]["order_number"] == "1236"
    assert out["packable_order_ids"] == []
    assert out["packing_mode"] == "bulk"
    assert out["cart_code"] == "CART-0001"


def test_cart_handoff_truly_empty():
    db = MagicMock()
    cart = SimpleNamespace(
        id=3,
        code="CART-0001",
        barcode="CART-0001",
        name="120X80",
        type=SimpleNamespace(value="BULK"),
        tenant_id=1,
        warehouse_id=1,
    )
    q = MagicMock()
    q.filter.return_value = q
    q.first.return_value = cart
    db.query.return_value = q

    with (
        patch(
            "backend.services.cart_picking_lifecycle_service.get_cart_status",
            return_value=SimpleNamespace(value="PACKING"),
        ),
        patch(
            "backend.services.cart_stats_service.list_orders_on_cart",
            return_value=[],
        ),
        patch(
            "backend.services.wms_packing_service.list_packing_orders",
            return_value=[],
        ),
    ):
        out = inspect_packing_cart_handoff(
            db,
            tenant_id=1,
            warehouse_id=1,
            status_id=8,
            cart_id=3,
        )

    assert out["operator_state"] == "EMPTY"
    assert "nie przypisano" in out["operator_message"].lower()
