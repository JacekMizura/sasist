"""
Packing finish — mode=no_cart regression (active queue + outside-queue fully packed).

  python -m pytest backend/tests/test_packing_finish_no_cart.py -q
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.activity_event import ActivityEvent, ActivityEventLink
from backend.models.bundle import Bundle
from backend.models.capacity_analytics import (
    CapacityAnalyticsDetail,
    CapacityAnalyticsReasonAgg,
    CapacityAnalyticsRun,
)
from backend.models.cart import Cart
from backend.models.cart_basket import CartBasket
from backend.models.cart_lifecycle_event import CartLifecycleEvent
from backend.models.cart_lifecycle_history import CartLifecycleHistory
from backend.models.carton import Carton, carton_shipping_method_links
from backend.models.fulfillment_event import FulfillmentEvent
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.order_ui_status import OrderUiStatus
from backend.models.pick import Pick
from backend.models.picking_config import PickingConfig
from backend.models.product import Product
from backend.models.shipping_method import ShippingMethod
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_operation_session import WmsOperationSession
from backend.models.wms_packing_settings import WmsPackingSettings
from backend.services.picking_handoff_service import HANDOFF_CART, HANDOFF_CARTLESS
from backend.services.wms_packing_service import PackingScanError, packing_finish_order


_PACKABLE_STATE = SimpleNamespace(
    totals=SimpleNamespace(oms_decision_lines=0, recovery_lines=0),
    packing_allowed=True,
    has_recovery_work=False,
    has_relocation_work=False,
)


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (
        Tenant,
        Warehouse,
        Cart,
        CartBasket,
        Order,
        OrderItem,
        OrderUiStatus,
        Product,
        Bundle,
        Pick,
        WmsOperationSession,
        CartLifecycleHistory,
        CartLifecycleEvent,
        PickingConfig,
        ShippingMethod,
        Carton,
        WmsPackingSettings,
        ActivityEvent,
        ActivityEventLink,
        CapacityAnalyticsRun,
        CapacityAnalyticsReasonAgg,
        CapacityAnalyticsDetail,
        FulfillmentEvent,
    ):
        model.__table__.create(engine, checkfirst=True)
    carton_shipping_method_links.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    session.add(
        OrderUiStatus(
            id=3,
            tenant_id=1,
            warehouse_id=1,
            main_group="TO_PACK",
            name="Do pakowania",
            color="#000",
            sort_order=1,
        )
    )
    session.add(
        Carton(
            id="carton-a",
            tenant_id=1,
            warehouse_id=1,
            name="A",
            length_cm=64,
            width_cm=38,
            height_cm=8,
            weight_kg=0.1,
            is_active=True,
        )
    )
    session.commit()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def _bypass_gates(monkeypatch):
    monkeypatch.setattr(
        "backend.services.wms_order_validation.gate.gate_orders_before_capacity",
        lambda db, *, orders, tenant_id, warehouse_id, operator_user_id=None: list(orders),
    )
    monkeypatch.setattr(
        "backend.services.wms_queue_eligibility.wms_queue_fulfillment_mode_clauses",
        lambda **kwargs: [],
    )
    monkeypatch.setattr(
        "backend.services.wms_queue_eligibility.wms_queue_consolidation_phase_clauses",
        lambda: [],
    )
    monkeypatch.setattr(
        "backend.services.wms_queue_eligibility.wms_queue_consolidation_plan_clauses",
        lambda: [],
    )
    monkeypatch.setattr(
        "backend.services.wms_queue_eligibility.wms_queue_consolidation_packing_clauses",
        lambda: [],
    )
    monkeypatch.setattr(
        "backend.services.wms_packing_service.emit_wms_packing_automation_finished",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_packing_service.emit_wms_packing_finished",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_packing_service._packing_build_scan_out_after_commit",
        lambda db, **kwargs: SimpleNamespace(
            fully_packed=True,
            packing_after_finish_action=kwargs.get("packing_after_finish_action") or "STAY",
            next_order_id=kwargs.get("next_order_id"),
            last_packed_order_item_id=None,
            post_pack_pipeline=kwargs.get("post_pack_pipeline") or [],
            detail=SimpleNamespace(order_id=kwargs.get("order_id")),
        ),
    )
    monkeypatch.setattr(
        "backend.services.wms_packing_service.find_next_fifo_packing_order_id",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_packing_service._run_wms_packing_post_pack_pipeline",
        lambda *a, **k: [],
    )
    monkeypatch.setattr(
        "backend.services.wms_packing_service.order_item_required_pack_qty",
        lambda db, order, it: int(getattr(it, "quantity", 0) or 0),
    )
    monkeypatch.setattr(
        "backend.services.wms_packing_service._order_item_operational_missing_qty",
        lambda *a, **k: 0.0,
    )
    monkeypatch.setattr(
        "backend.services.order_fulfillment_lifecycle_service.on_order_shipped",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.production_execution.production_packing_handoff_service.consume_production_buffer_stock_on_packing_finish",
        lambda *a, **k: {"result": "SKIPPED", "reason": "test", "consumed": 0.0},
    )


def _product(db, *, ean: str) -> Product:
    p = Product(tenant_id=1, name="P", ean=ean, sku=ean)
    db.add(p)
    db.flush()
    return p


def _packable_order(
    db,
    *,
    number: str,
    handoff: str | None = HANDOFF_CARTLESS,
    packed: int = 1,
    qty: int = 1,
    fulfillment_state: str | None = "READY_TO_PACK",
    status_id: int = 3,
) -> Order:
    p = _product(db, ean=f"EAN-{number}")
    o = Order(
        tenant_id=1,
        warehouse_id=1,
        number=number,
        status="TO_PACK",
        fulfillment_state=fulfillment_state,
        order_ui_status_id=status_id,
        picking_handoff_mode=handoff,
        selected_carton_id="carton-a",
        cart_id=None,
        basket_id=None,
    )
    db.add(o)
    db.flush()
    db.add(
        OrderItem(
            order_id=int(o.id),
            product_id=int(p.id),
            quantity=qty,
            packing_quantity_packed=packed,
        )
    )
    db.flush()
    return o


def _patch_packable():
    return patch.multiple(
        "backend.services.recovery_workflow_service",
        resolve_order_recovery_state=lambda *a, **k: _PACKABLE_STATE,
        can_order_be_packed=lambda *a, **k: True,
        log_recovery_state_snapshot=lambda *a, **k: None,
    )


def test_no_cart_finish_cartless_in_queue(db):
    """Prawidłowe CARTLESS → finish mode=no_cart bez 404."""
    o = _packable_order(db, number="NC-OK")
    db.commit()
    with _patch_packable():
        out = packing_finish_order(
            db,
            tenant_id=1,
            warehouse_id=1,
            status_id=3,
            mode="no_cart",
            cart_id=None,
            order_id=int(o.id),
            order_type="all",
        )
    assert out.fully_packed is True
    db.refresh(o)
    assert o.wms_packing_automation_finished_at is not None


def test_no_cart_finish_fully_packed_outside_active_queue(db):
    """
    Po spakowaniu linii zamówienie może wypaść z eligibility (np. fulfillment drift),
    a detail nadal jest dostępny — finish nie może wtedy zwracać ślepego 404.
    """
    o = _packable_order(
        db,
        number="NC-OUT",
        handoff=HANDOFF_CARTLESS,
        fulfillment_state="PICKING",  # poza READY_TO_PACK/PACKING → poza aktywną kolejką
    )
    db.commit()
    with _patch_packable():
        out = packing_finish_order(
            db,
            tenant_id=1,
            warehouse_id=1,
            status_id=3,
            mode="no_cart",
            cart_id=None,
            order_id=int(o.id),
            order_type="all",
        )
    assert out.fully_packed is True
    db.refresh(o)
    assert o.wms_packing_automation_finished_at is not None


def test_no_cart_finish_null_handoff_fully_packed(db):
    """Legacy NULL handoff + brak wózka: finish w no_cart dla w pełni spakowanego."""
    o = _packable_order(db, number="NC-NULL", handoff=None, fulfillment_state="PICKING")
    o.picking_handoff_mode = None
    db.add(o)
    db.commit()
    with _patch_packable():
        out = packing_finish_order(
            db,
            tenant_id=1,
            warehouse_id=1,
            status_id=3,
            mode="no_cart",
            cart_id=None,
            order_id=int(o.id),
        )
    assert out.fully_packed is True


def test_no_cart_finish_wrong_mode_business_error(db):
    """CART w trybie no_cart → czytelny błąd biznesowy (nie cichy sukces)."""
    o = _packable_order(db, number="NC-CART", handoff=HANDOFF_CART, fulfillment_state="PICKING")
    o.cart_id = 99
    db.add(o)
    db.commit()
    with _patch_packable():
        with pytest.raises(PackingScanError) as ei:
            packing_finish_order(
                db,
                tenant_id=1,
                warehouse_id=1,
                status_id=3,
                mode="no_cart",
                cart_id=None,
                order_id=int(o.id),
            )
    assert ei.value.code == "ORDER_NOT_IN_QUEUE"
    assert ei.value.message
    assert "trybie pakowania" in ei.value.message.lower() or "kolejce" in ei.value.message.lower()
    assert "404" not in (ei.value.message or "")
    assert "ORDER_NOT_IN_QUEUE" not in (ei.value.message or "")


def test_no_cart_unpacked_outside_queue_still_rejected(db):
    """Niepełne pakowanie poza kolejką — nadal odrzucenie z komunikatem dla operatora."""
    o = _packable_order(
        db,
        number="NC-PART",
        handoff=HANDOFF_CARTLESS,
        packed=0,
        qty=2,
        fulfillment_state="PICKING",
    )
    db.commit()
    with _patch_packable():
        with pytest.raises(PackingScanError) as ei:
            packing_finish_order(
                db,
                tenant_id=1,
                warehouse_id=1,
                status_id=3,
                mode="no_cart",
                cart_id=None,
                order_id=int(o.id),
            )
    assert ei.value.code == "ORDER_NOT_IN_QUEUE"
    assert "kolejce pakowania" in (ei.value.message or "").lower()
