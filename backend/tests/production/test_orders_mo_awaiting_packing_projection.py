"""Projection: ORDERS MO READY_TO_PACK vs packed/shipped source orders."""

from __future__ import annotations

from types import SimpleNamespace

from backend.services.production_execution.production_packing_handoff_service import (
    order_awaits_packing_after_orders_production,
)


def _order(**kwargs):
    base = {
        "id": 1,
        "fulfillment_assignment_phase": "READY_TO_PACK",
        "fulfillment_state": None,
        "order_ui_status": SimpleNamespace(
            name="Gotowe do pakowania",
            code="READY",
            main_group="IN_PROGRESS",
        ),
    }
    base.update(kwargs)
    return SimpleNamespace(**base)


def test_awaits_packing_when_ready_to_pack_ui():
    assert order_awaits_packing_after_orders_production(_order()) is True


def test_not_awaiting_when_main_group_done():
    assert (
        order_awaits_packing_after_orders_production(
            _order(
                order_ui_status=SimpleNamespace(
                    name="W drodze do klienta",
                    code="SHIP",
                    main_group="DONE",
                )
            )
        )
        is False
    )


def test_not_awaiting_when_shipped_phase():
    assert (
        order_awaits_packing_after_orders_production(
            _order(
                fulfillment_assignment_phase="SHIPPED",
                order_ui_status=SimpleNamespace(
                    name="Spakowane",
                    code="x",
                    main_group="DONE",
                ),
            )
        )
        is False
    )


def test_not_awaiting_when_ui_name_packed():
    assert (
        order_awaits_packing_after_orders_production(
            _order(
                fulfillment_assignment_phase="READY_TO_PACK",
                order_ui_status=SimpleNamespace(
                    name="Spakowane",
                    code="PACKED",
                    main_group="IN_PROGRESS",
                ),
            )
        )
        is False
    )


def test_not_awaiting_when_fulfillment_state_packed():
    assert (
        order_awaits_packing_after_orders_production(
            _order(fulfillment_state="PACKED", fulfillment_assignment_phase="READY_TO_PACK")
        )
        is False
    )
