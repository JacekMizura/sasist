"""P5.2 — consolidation exceptions, alerts, recovery."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.consolidation_rack import ConsolidationRack, ConsolidationRackLevel, RackSegment
from backend.models.order import Order
from backend.models.order_consolidation_alert import OrderConsolidationAlert
from backend.models.order_consolidation_plan import OrderConsolidationPlan, OrderConsolidationPlanItem
from backend.models.order_item import OrderItem
from backend.models.product import Product
from backend.models.stock_document import StockDocument, StockDocumentItem
from backend.models.tenant import Tenant
from backend.models.tenant_fulfillment_configuration import TenantFulfillmentConfiguration
from backend.models.tenant_warehouse import TenantWarehouse
from backend.models.warehouse import Warehouse
from backend.services.fulfillment_assignment.phase_constants import (
    PHASE_CONSOLIDATING,
    PHASE_FULFILLMENT_ASSIGNED,
    PHASE_MANUAL_REVIEW_REQUIRED,
)
from backend.services.order_consolidation.alert_service import (
    apply_recovery_action,
    cancel_consolidation_plan,
    change_consolidation_target_warehouse,
    list_consolidation_alerts,
)
from backend.services.order_consolidation.constants import (
    ALERT_CODE_CONSOLIDATION_CANCELLED,
    ALERT_CODE_DAMAGED_ITEM,
    ALERT_CODE_SHORTAGE,
    ALERT_CODE_TARGET_WAREHOUSE_CHANGED,
    ITEM_STATUS_DAMAGED,
    ITEM_STATUS_LOST,
    ITEM_STATUS_MM_CREATED,
    ITEM_STATUS_SHORTAGE,
    PLAN_STATUS_CANCELLED,
    PLAN_STATUS_EXCEPTION,
    PLAN_STATUS_IN_PROGRESS,
    PLAN_STATUS_MANUAL_REVIEW_REQUIRED,
)
from backend.services.order_consolidation.plan_service import (
    generate_consolidation_plan,
    refresh_consolidation_plan_progress,
)
from backend.services.stock_disposition import STOCK_DISPOSITION_OUTLET_B
from backend.services.wms_queue_eligibility import assert_order_wms_fulfillment_not_blocked, WmsConsolidationBlockedError


@pytest.fixture
def exceptions_db():
    engine = create_engine("sqlite:///:memory:")
    for model in (
        Tenant,
        Warehouse,
        TenantWarehouse,
        TenantFulfillmentConfiguration,
        Product,
        Order,
        OrderItem,
        OrderConsolidationPlan,
        OrderConsolidationPlanItem,
        OrderConsolidationAlert,
        StockDocument,
        StockDocumentItem,
        ConsolidationRack,
        ConsolidationRackLevel,
        RackSegment,
    ):
        model.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(Tenant(id=1, name="A", default_warehouse_id=2))
    db.add(Tenant(id=2, name="B", default_warehouse_id=4))
    for wid, name in [(1, "Warszawa"), (2, "Poznań"), (3, "Gdańsk"), (4, "Kraków")]:
        db.add(Warehouse(id=wid, tenant_id=1 if wid < 4 else 2, name=name))
    for tid, wid in [(1, 1), (1, 2), (1, 3), (2, 4)]:
        db.add(
            TenantWarehouse(
                tenant_id=tid,
                warehouse_id=wid,
                role="owner",
                is_default=1 if wid == 2 else 0,
                fulfillment_eligible=True,
                fulfillment_priority=wid,
            )
        )
    db.add(
        TenantFulfillmentConfiguration(
            tenant_id=1,
            fulfillment_assignment_mode="DEFAULT_WAREHOUSE",
            consolidation_warehouse_id=2,
        )
    )
    for pid, name in [(101, "A"), (102, "B"), (103, "C")]:
        db.add(Product(id=pid, tenant_id=1, name=name, sku=f"SKU-{pid}"))
    db.commit()
    try:
        yield db
    finally:
        db.close()


def _stock():
    return {
        (1, 1, 101): 10.0,
        (1, 2, 102): 10.0,
        (1, 2, 104): 10.0,
        (1, 3, 103): 10.0,
    }


def _mock_commercial(stock: dict):
    def _fn(db, *, tenant_id, warehouse_id, product_id):
        return float(stock.get((int(tenant_id), int(warehouse_id), int(product_id)), 0.0))

    return _fn


def _order_with_lines(db, number: str = "EX-1") -> Order:
    order = Order(
        tenant_id=1,
        warehouse_id=2,
        number=number,
        status="NEW",
        fulfillment_assignment_phase=PHASE_FULFILLMENT_ASSIGNED,
    )
    db.add(order)
    db.flush()
    db.add(OrderItem(order_id=int(order.id), product_id=101, quantity=1, is_bundle_parent=False))
    db.add(OrderItem(order_id=int(order.id), product_id=102, quantity=10, is_bundle_parent=False))
    db.add(OrderItem(order_id=int(order.id), product_id=103, quantity=10, is_bundle_parent=False))
    db.commit()
    return order


def _setup_plan_with_mm(db) -> tuple[OrderConsolidationPlan, OrderConsolidationPlanItem, StockDocument]:
    from backend.services.inventory_lot_keys import NO_EXPIRY_SENTINEL

    order = _order_with_lines(db)
    with patch(
        "backend.services.order_consolidation.feasibility_service.commercially_sellable_qty",
        side_effect=_mock_commercial(_stock()),
    ):
        generate_consolidation_plan(db, int(order.id))
    db.commit()
    plan = db.query(OrderConsolidationPlan).filter(OrderConsolidationPlan.order_id == int(order.id)).first()
    assert plan is not None

    item = (
        db.query(OrderConsolidationPlanItem)
        .filter(
            OrderConsolidationPlanItem.plan_id == int(plan.id),
            OrderConsolidationPlanItem.product_id == 103,
        )
        .first()
    )
    assert item is not None
    assert int(item.source_warehouse_id) != int(item.target_warehouse_id)

    doc = StockDocument(
        tenant_id=1,
        document_type="MM",
        warehouse_id=int(item.source_warehouse_id),
        source_warehouse_id=int(item.source_warehouse_id),
        destination_warehouse_id=int(item.target_warehouse_id),
        status="draft",
        receiving_status="IN_PROGRESS",
        putaway_status="NOT_STARTED",
        relocation_status="OPEN",
        creation_source="CONSOLIDATION",
    )
    db.add(doc)
    db.flush()
    db.add(
        StockDocumentItem(
            document_id=int(doc.id),
            product_id=int(item.product_id),
            ordered_quantity=float(item.quantity),
            received_quantity=0.0,
            quantity=float(item.quantity),
            batch_number="",
            expiry_date=NO_EXPIRY_SENTINEL,
        )
    )
    item.stock_document_id = int(doc.id)
    item.status = ITEM_STATUS_MM_CREATED
    plan.status = PLAN_STATUS_IN_PROGRESS
    db.add(item)
    db.add(plan)
    db.commit()
    return plan, item, doc


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_shortage_on_mm_receive(mock_commercial, exceptions_db):
    db = exceptions_db
    mock_commercial.side_effect = _mock_commercial(_stock())
    plan, item, doc = _setup_plan_with_mm(db)

    line = (
        db.query(StockDocumentItem)
        .filter(
            StockDocumentItem.document_id == int(doc.id),
            StockDocumentItem.product_id == int(item.product_id),
        )
        .first()
    )
    line.received_quantity = 8.0
    line.quantity = 8.0
    line.ordered_quantity = float(item.quantity)
    doc.receiving_status = "DONE"
    db.add(line)
    db.add(doc)
    db.commit()

    refresh_consolidation_plan_progress(db, int(plan.id))
    db.commit()
    db.refresh(item)
    db.refresh(plan)

    assert item.status == ITEM_STATUS_SHORTAGE
    assert plan.status == PLAN_STATUS_EXCEPTION
    alerts = list_consolidation_alerts(db, tenant_id=1, target_warehouse_id=2)
    assert any(a["code"] == ALERT_CODE_SHORTAGE for a in alerts)


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_damaged_on_mm_receive(mock_commercial, exceptions_db):
    db = exceptions_db
    mock_commercial.side_effect = _mock_commercial(_stock())
    plan, item, doc = _setup_plan_with_mm(db)

    line = (
        db.query(StockDocumentItem)
        .filter(
            StockDocumentItem.document_id == int(doc.id),
            StockDocumentItem.product_id == int(item.product_id),
        )
        .first()
    )
    line.received_quantity = 10.0
    line.stock_disposition = STOCK_DISPOSITION_OUTLET_B
    doc.receiving_status = "DONE"
    db.add(line)
    db.add(doc)
    db.commit()

    refresh_consolidation_plan_progress(db, int(plan.id))
    db.commit()
    db.refresh(item)
    db.refresh(plan)

    assert item.status == ITEM_STATUS_DAMAGED
    assert plan.status == PLAN_STATUS_EXCEPTION
    alerts = list_consolidation_alerts(db, tenant_id=1, target_warehouse_id=2)
    assert any(a["code"] == ALERT_CODE_DAMAGED_ITEM for a in alerts)


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_lost_recovery_action(mock_commercial, exceptions_db):
    db = exceptions_db
    mock_commercial.side_effect = _mock_commercial(_stock())
    plan, item, _doc = _setup_plan_with_mm(db)
    item.status = ITEM_STATUS_LOST
    db.add(item)
    db.commit()

    apply_recovery_action(
        db,
        plan_id=int(plan.id),
        plan_item_id=int(item.id),
        tenant_id=1,
        action="LOST_ESCALATION",
        note="Brak potwierdzenia dostawy",
    )
    db.commit()
    db.refresh(item)
    assert item.status == ITEM_STATUS_LOST
    alerts = list_consolidation_alerts(db, tenant_id=1, target_warehouse_id=2)
    assert any(a["code"] == "LOST_ESCALATION" for a in alerts)


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_change_target_warehouse(mock_commercial, exceptions_db):
    db = exceptions_db
    mock_commercial.side_effect = _mock_commercial(_stock())
    plan, _item, _doc = _setup_plan_with_mm(db)
    order = db.query(Order).filter(Order.id == int(plan.order_id)).first()

    change_consolidation_target_warehouse(
        db,
        plan_id=int(plan.id),
        tenant_id=1,
        warehouse_id=3,
        reason="Zmiana strategii realizacji",
    )
    db.commit()
    db.refresh(plan)
    db.refresh(order)

    assert int(plan.target_warehouse_id) == 3
    assert int(order.warehouse_id) == 3
    alerts = list_consolidation_alerts(db, tenant_id=1, target_warehouse_id=3)
    assert any(a["code"] == ALERT_CODE_TARGET_WAREHOUSE_CHANGED for a in alerts)


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_cancel_consolidation(mock_commercial, exceptions_db):
    db = exceptions_db
    mock_commercial.side_effect = _mock_commercial(_stock())
    plan, _item, _doc = _setup_plan_with_mm(db)
    order = db.query(Order).filter(Order.id == int(plan.order_id)).first()

    cancel_consolidation_plan(db, plan_id=int(plan.id), tenant_id=1, reason="Anulowanie przez operatora")
    db.commit()
    db.refresh(plan)
    db.refresh(order)

    assert plan.status == PLAN_STATUS_CANCELLED
    assert order.fulfillment_assignment_phase == PHASE_MANUAL_REVIEW_REQUIRED
    alerts = list_consolidation_alerts(db, tenant_id=1, target_warehouse_id=2)
    assert any(a["code"] == ALERT_CODE_CONSOLIDATION_CANCELLED for a in alerts)


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_alert_generation_dedupe(mock_commercial, exceptions_db):
    db = exceptions_db
    mock_commercial.side_effect = _mock_commercial(_stock())
    plan, item, doc = _setup_plan_with_mm(db)

    line = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == int(doc.id))
        .first()
    )
    line.received_quantity = 5.0
    doc.receiving_status = "DONE"
    db.add(line)
    db.add(doc)
    db.commit()

    refresh_consolidation_plan_progress(db, int(plan.id))
    refresh_consolidation_plan_progress(db, int(plan.id))
    db.commit()

    alerts = (
        db.query(OrderConsolidationAlert)
        .filter(
            OrderConsolidationAlert.plan_id == int(plan.id),
            OrderConsolidationAlert.code == ALERT_CODE_SHORTAGE,
            OrderConsolidationAlert.resolved.is_(False),
        )
        .all()
    )
    assert len(alerts) == 1


def test_wave_blocked_by_exception_plan(exceptions_db):
    db = exceptions_db
    order = Order(
        tenant_id=1,
        warehouse_id=2,
        number="WBLK",
        status="NEW",
        fulfillment_assignment_phase=PHASE_FULFILLMENT_ASSIGNED,
    )
    db.add(order)
    db.flush()
    db.add(
        OrderConsolidationPlan(
            order_id=int(order.id),
            target_warehouse_id=2,
            status=PLAN_STATUS_EXCEPTION,
        )
    )
    db.commit()

    with pytest.raises(WmsConsolidationBlockedError):
        assert_order_wms_fulfillment_not_blocked(order, db)


def test_multi_tenant_alert_isolation(exceptions_db):
    db = exceptions_db
    order = Order(
        tenant_id=2,
        warehouse_id=4,
        number="T2",
        status="NEW",
        fulfillment_assignment_phase=PHASE_CONSOLIDATING,
    )
    db.add(order)
    db.flush()
    plan = OrderConsolidationPlan(order_id=int(order.id), target_warehouse_id=4, status=PLAN_STATUS_EXCEPTION)
    db.add(plan)
    db.flush()
    db.add(
        OrderConsolidationAlert(
            plan_id=int(plan.id),
            severity="CRITICAL",
            code=ALERT_CODE_SHORTAGE,
            message="Tenant 2 shortage",
            resolved=False,
        )
    )
    db.commit()

    tenant1_alerts = list_consolidation_alerts(db, tenant_id=1, target_warehouse_id=2)
    assert tenant1_alerts == []
    tenant2_alerts = list_consolidation_alerts(db, tenant_id=2, target_warehouse_id=4)
    assert len(tenant2_alerts) == 1


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_damaged_recovery_sets_manual_review(mock_commercial, exceptions_db):
    db = exceptions_db
    mock_commercial.side_effect = _mock_commercial(_stock())
    plan, item, _doc = _setup_plan_with_mm(db)
    item.status = ITEM_STATUS_DAMAGED
    plan.status = PLAN_STATUS_EXCEPTION
    db.add(item)
    db.add(plan)
    db.commit()

    apply_recovery_action(
        db,
        plan_id=int(plan.id),
        plan_item_id=int(item.id),
        tenant_id=1,
        action="OPERATOR_DECISION",
    )
    db.commit()
    db.refresh(plan)
    assert plan.status == PLAN_STATUS_MANUAL_REVIEW_REQUIRED
