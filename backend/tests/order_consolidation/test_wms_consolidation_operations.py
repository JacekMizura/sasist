"""P5.1 — WMS consolidation operations tests."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

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
)
from backend.services.order_consolidation.constants import (
    ITEM_STATUS_IN_TRANSIT,
    ITEM_STATUS_MM_CREATED,
    ITEM_STATUS_RECEIVED,
    ITEM_STATUS_WAITING,
    PLAN_STATUS_COMPLETED,
    PLAN_STATUS_IN_PROGRESS,
)
from backend.services.order_consolidation.plan_service import (
    generate_consolidation_plan,
    refresh_consolidation_plan_progress,
)
from backend.services.order_consolidation.wms_operations_service import (
    WmsConsolidationAccessError,
    build_wms_consolidation_summary,
    get_wms_consolidation_plan_detail,
    list_wms_consolidation_plans,
)
from backend.services.wms_picking_product_list_service import _query_order_ids_for_status
from backend.services.wms_queue_eligibility import assert_order_wms_fulfillment_not_blocked, WmsConsolidationBlockedError


@pytest.fixture
def wms_consolidation_db():
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
        db.add(Product(id=pid, tenant_id=1, name=name, sku=f"S{pid}"))
    db.commit()
    try:
        yield db
    finally:
        db.close()


def _stock():
    return {
        (1, 1, 101): 10.0,
        (1, 2, 102): 10.0,
        (1, 3, 103): 10.0,
    }


def _mock_commercial(stock: dict):
    def _fn(db, *, tenant_id, warehouse_id, product_id):
        return float(stock.get((int(tenant_id), int(warehouse_id), int(product_id)), 0.0))

    return _fn


def _order_with_lines(db, number: str) -> Order:
    order = Order(
        tenant_id=1,
        warehouse_id=1,
        number=number,
        status="NEW",
        fulfillment_assignment_phase=PHASE_FULFILLMENT_ASSIGNED,
        order_ui_status_id=10,
    )
    db.add(order)
    db.flush()
    for pid in (101, 102, 103):
        db.add(OrderItem(order_id=int(order.id), product_id=pid, quantity=1, is_bundle_parent=False))
    db.commit()
    return order


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_two_of_three_transfers_in_progress(mock_commercial, wms_consolidation_db):
    db = wms_consolidation_db
    mock_commercial.side_effect = _mock_commercial(_stock())
    order = _order_with_lines(db, "W-1")
    generate_consolidation_plan(db, int(order.id))
    db.commit()
    plan = db.query(OrderConsolidationPlan).filter_by(order_id=int(order.id)).first()
    transfers = [
        it
        for it in db.query(OrderConsolidationPlanItem).filter_by(plan_id=int(plan.id)).all()
        if int(it.source_warehouse_id) != int(it.target_warehouse_id)
    ]
    assert len(transfers) == 2
    for idx, it in enumerate(transfers):
        doc = StockDocument(
            tenant_id=1,
            document_type="MM",
            warehouse_id=int(it.source_warehouse_id),
            source_warehouse_id=int(it.source_warehouse_id),
            destination_warehouse_id=int(it.target_warehouse_id),
            status="draft",
            receiving_status="DONE" if idx == 0 else "IN_PROGRESS",
            putaway_status="NOT_STARTED",
            relocation_status="OPEN",
            creation_source="CONSOLIDATION",
        )
        db.add(doc)
        db.flush()
        it.stock_document_id = int(doc.id)
        it.status = ITEM_STATUS_MM_CREATED
    db.commit()

    refresh_consolidation_plan_progress(db, int(plan.id))
    db.commit()
    db.refresh(plan)

    assert plan.status == PLAN_STATUS_IN_PROGRESS
    items = db.query(OrderConsolidationPlanItem).filter_by(plan_id=int(plan.id)).all()
    received = sum(1 for it in transfers if it.status == ITEM_STATUS_RECEIVED)
    assert received == 1


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_all_transfers_completed(mock_commercial, wms_consolidation_db):
    db = wms_consolidation_db
    mock_commercial.side_effect = _mock_commercial(_stock())
    order = _order_with_lines(db, "W-2")
    generate_consolidation_plan(db, int(order.id))
    db.commit()
    plan = db.query(OrderConsolidationPlan).filter_by(order_id=int(order.id)).first()
    order = db.query(Order).filter_by(id=int(plan.order_id)).first()

    for it in db.query(OrderConsolidationPlanItem).filter_by(plan_id=int(plan.id)).all():
        if int(it.source_warehouse_id) == int(it.target_warehouse_id):
            continue
        doc = StockDocument(
            tenant_id=1,
            document_type="MM",
            warehouse_id=int(it.source_warehouse_id),
            source_warehouse_id=int(it.source_warehouse_id),
            destination_warehouse_id=int(it.target_warehouse_id),
            status="draft",
            receiving_status="DONE",
            putaway_status="NOT_STARTED",
            relocation_status="OPEN",
            creation_source="CONSOLIDATION",
        )
        db.add(doc)
        db.flush()
        it.stock_document_id = int(doc.id)
        it.status = ITEM_STATUS_MM_CREATED
    db.commit()

    refresh_consolidation_plan_progress(db, int(plan.id))
    db.commit()
    db.refresh(plan)
    db.refresh(order)

    assert plan.status == PLAN_STATUS_COMPLETED
    assert order.fulfillment_assignment_phase == PHASE_FULFILLMENT_ASSIGNED


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_dashboard_counters(mock_commercial, wms_consolidation_db):
    db = wms_consolidation_db
    mock_commercial.side_effect = _mock_commercial(_stock())
    _order_with_lines(db, "D-1")
    order2 = _order_with_lines(db, "D-2")
    generate_consolidation_plan(db, int(order2.id))
    db.commit()
    summary = build_wms_consolidation_summary(db, tenant_id=1, target_warehouse_id=2)
    assert summary["pending_count"] >= 1
    assert summary["active_count"] >= 1


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_multi_tenant_wms_list_isolation(mock_commercial, wms_consolidation_db):
    db = wms_consolidation_db
    mock_commercial.side_effect = _mock_commercial({(2, 4, 201): 5.0})
    db.add(Product(id=201, tenant_id=2, name="T2", sku="T2"))
    order = Order(
        tenant_id=2,
        warehouse_id=4,
        number="T2",
        status="NEW",
        fulfillment_assignment_phase=PHASE_FULFILLMENT_ASSIGNED,
    )
    db.add(order)
    db.flush()
    db.add(OrderConsolidationPlan(order_id=int(order.id), target_warehouse_id=4, status=PLAN_STATUS_IN_PROGRESS))
    db.commit()

    rows = list_wms_consolidation_plans(db, tenant_id=1, target_warehouse_id=2)
    assert rows == []
    with pytest.raises(WmsConsolidationAccessError):
        get_wms_consolidation_plan_detail(db, plan_id=1, tenant_id=1)


def test_packing_picking_blocked_during_consolidation(wms_consolidation_db):
    db = wms_consolidation_db
    order = Order(
        tenant_id=1,
        warehouse_id=2,
        number="BLK-1",
        status="NEW",
        fulfillment_assignment_phase=PHASE_CONSOLIDATING,
        order_ui_status_id=10,
        picking_finished_at=None,
    )
    db.add(order)
    db.flush()
    db.add(OrderItem(order_id=int(order.id), product_id=101, quantity=1, is_bundle_parent=False))
    db.commit()

    with pytest.raises(WmsConsolidationBlockedError):
        assert_order_wms_fulfillment_not_blocked(order)

    ids = _query_order_ids_for_status(
        db,
        tenant_id=1,
        warehouse_id=2,
        source_status_id=10,
        order_type="all",
    )
    assert int(order.id) not in ids
