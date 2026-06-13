"""P5.5 — packing entry via consolidation shelf scan (RK-01/A2)."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.consolidation_rack import ConsolidationRack, ConsolidationRackLevel, RackSegment
from backend.models.order import Order
from backend.models.order_consolidation_plan import OrderConsolidationPlan, OrderConsolidationPlanItem
from backend.models.order_item import OrderItem
from backend.models.product import Product
from backend.models.tenant import Tenant
from backend.models.tenant_fulfillment_configuration import TenantFulfillmentConfiguration
from backend.models.tenant_warehouse import TenantWarehouse
from backend.models.warehouse import Warehouse
from backend.services.fulfillment_assignment.phase_constants import PHASE_FULFILLMENT_ASSIGNED
from backend.services.order_consolidation.consolidation_context import mark_local_plan_item_picked
from backend.services.order_consolidation.constants import ITEM_STATUS_MM_CREATED
from backend.services.order_consolidation.plan_service import generate_consolidation_plan, refresh_consolidation_plan_progress
from backend.services.order_consolidation.staging_service import (
    stage_plan_item,
    start_consolidation_staging,
)
from backend.services.order_fulfillment_state import READY_TO_PACK
from backend.services.wms_packing_service import PackingScanError, resolve_packing_order_for_shelf_scan
from backend.models.stock_document import StockDocument, StockDocumentItem


def _stock_map():
    return {
        (1, 1, 101): 10.0,
        (1, 2, 102): 10.0,
        (1, 2, 104): 10.0,
        (1, 3, 103): 10.0,
    }


def _mock_commercial(stock_map):
    def _fn(db, *, tenant_id, warehouse_id, product_id, **_kwargs):
        return float(stock_map.get((int(tenant_id), int(warehouse_id), int(product_id)), 0.0))

    return _fn


@pytest.fixture
def shelf_entry_db():
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
    for wid, name in [(1, "Warszawa"), (2, "Poznań"), (3, "Gdańsk")]:
        db.add(Warehouse(id=wid, tenant_id=1, name=name))
    for wid in (1, 2, 3):
        db.add(
            TenantWarehouse(
                tenant_id=1,
                warehouse_id=wid,
                role="owner",
                is_default=1 if wid == 2 else 0,
                fulfillment_eligible=True,
            )
        )
    db.add(
        TenantFulfillmentConfiguration(
            tenant_id=1,
            fulfillment_assignment_mode="DEFAULT_WAREHOUSE",
            consolidation_warehouse_id=2,
        )
    )
    for pid in (101, 102, 103, 104):
        db.add(Product(id=pid, tenant_id=1, name=f"P{pid}", sku=f"S{pid}"))
    rack = ConsolidationRack(id=1, tenant_id=1, warehouse_id=2, name="RK-01")
    db.add(rack)
    db.flush()
    level = ConsolidationRackLevel(id=1, rack_id=1, level_index=1, name="A", is_segmented=True)
    db.add(level)
    db.flush()
    db.add(RackSegment(id=1, level_id=1, segment_index=1, order_id=None, fill_percent=0.0))
    db.commit()
    yield db
    db.close()


def _ready_order_on_shelf(db) -> tuple[Order, str]:
    order = Order(
        tenant_id=1,
        warehouse_id=2,
        number="PK-1",
        status="NEW",
        fulfillment_assignment_phase=PHASE_FULFILLMENT_ASSIGNED,
    )
    db.add(order)
    db.flush()
    for pid in (101, 102, 103, 104):
        db.add(OrderItem(order_id=int(order.id), product_id=pid, quantity=1, is_bundle_parent=False))
    db.commit()
    generate_consolidation_plan(db, int(order.id))
    db.commit()
    plan = db.query(OrderConsolidationPlan).filter_by(order_id=int(order.id)).first()
    for it in db.query(OrderConsolidationPlanItem).filter_by(plan_id=int(plan.id)).all():
        if int(it.source_warehouse_id) != int(it.target_warehouse_id):
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
    start_consolidation_staging(db, plan_id=int(plan.id), tenant_id=1)
    db.commit()
    for it in db.query(OrderConsolidationPlanItem).filter_by(plan_id=int(plan.id)).all():
        if int(it.source_warehouse_id) == int(it.target_warehouse_id):
            mark_local_plan_item_picked(db, order_id=int(order.id), product_id=int(it.product_id))
        stage_plan_item(db, plan_id=int(plan.id), plan_item_id=int(it.id), tenant_id=1)
    db.commit()
    db.refresh(order)
    seg = db.query(RackSegment).filter(RackSegment.order_id == int(order.id)).first()
    assert seg is not None
    return order, "RK-01/A2"


@patch("backend.services.wms_packing_service.get_packing_order_detail_for_queue")
@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_shelf_entry_opens_packing_when_ready(mock_commercial, mock_in_queue, shelf_entry_db):
    db = shelf_entry_db
    mock_commercial.side_effect = _mock_commercial(_stock_map())
    mock_in_queue.return_value = object()
    order, label = _ready_order_on_shelf(db)
    assert str(order.fulfillment_state).upper() == READY_TO_PACK

    out = resolve_packing_order_for_shelf_scan(
        db,
        tenant_id=1,
        warehouse_id=2,
        shelf_scan=label,
        status_id=1,
        mode="no_cart",
        cart_id=None,
    )
    assert out.order_id == int(order.id)
    assert "RK-01" in out.shelf_label


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_shelf_entry_blocked_when_not_ready(mock_commercial, shelf_entry_db):
    db = shelf_entry_db
    mock_commercial.side_effect = _mock_commercial(_stock_map())
    order = Order(
        tenant_id=1,
        warehouse_id=2,
        number="NR-1",
        status="NEW",
        fulfillment_state="PICKING",
        fulfillment_assignment_phase=PHASE_FULFILLMENT_ASSIGNED,
    )
    db.add(order)
    db.commit()
    seg = db.query(RackSegment).first()
    seg.order_id = int(order.id)
    db.commit()

    with pytest.raises(PackingScanError) as exc:
        resolve_packing_order_for_shelf_scan(
            db,
            tenant_id=1,
            warehouse_id=2,
            shelf_scan="RK-01/A2",
            status_id=1,
            mode="no_cart",
            cart_id=None,
        )
    assert exc.value.code == "SHELF_ORDER_NOT_READY"
    assert exc.value.message == "Zamówienie nie jest jeszcze kompletne."


def test_shelf_entry_not_found(shelf_entry_db):
    db = shelf_entry_db
    with pytest.raises(PackingScanError) as exc:
        resolve_packing_order_for_shelf_scan(
            db,
            tenant_id=1,
            warehouse_id=2,
            shelf_scan="RK-99/Z9",
            status_id=1,
            mode="no_cart",
            cart_id=None,
        )
    assert exc.value.code == "SHELF_NOT_FOUND"
