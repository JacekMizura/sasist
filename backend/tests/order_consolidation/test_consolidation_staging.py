"""P5.3 — consolidation rack staging tests."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.consolidation_rack import ConsolidationRack, ConsolidationRackLevel, RackSegment
from backend.models.order import Order
from backend.models.order_consolidation_plan import OrderConsolidationPlan, OrderConsolidationPlanItem
from backend.models.order_consolidation_alert import OrderConsolidationAlert
from backend.models.order_item import OrderItem
from backend.models.product import Product
from backend.models.stock_document import StockDocument, StockDocumentItem
from backend.models.tenant import Tenant
from backend.models.tenant_fulfillment_configuration import TenantFulfillmentConfiguration
from backend.models.tenant_warehouse import TenantWarehouse
from backend.models.warehouse import Warehouse
from backend.services.fulfillment_assignment.phase_constants import PHASE_FULFILLMENT_ASSIGNED
from backend.services.order_consolidation.alert_service import cancel_consolidation_plan
from backend.services.order_consolidation.constants import (
    ITEM_STATUS_MM_CREATED,
    ITEM_STATUS_RECEIVED,
    ITEM_STATUS_STAGED,
    PLAN_STATUS_COMPLETED,
    PLAN_STATUS_READY_FOR_STAGING,
    PLAN_STATUS_STAGING,
)
from backend.services.order_consolidation.plan_service import (
    generate_consolidation_plan,
    refresh_consolidation_plan_progress,
)
from backend.services.order_consolidation.staging_service import (
    ConsolidationStagingError,
    find_free_segment,
    list_staging_queue,
    release_rack_segments_for_order,
    resolve_segment_by_label,
    stage_plan_item,
    start_consolidation_staging,
)
from backend.services.order_fulfillment_lifecycle_service import on_packing_started


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
def staging_db():
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
    db.add(Tenant(id=1, name="Firma A", default_warehouse_id=1))
    for wid, name in [(1, "Warszawa"), (2, "Poznań"), (3, "Gdańsk")]:
        db.add(Warehouse(id=wid, tenant_id=1, name=name))
    for wid, prio in [(1, 10), (2, 5), (3, 20)]:
        db.add(
            TenantWarehouse(
                tenant_id=1,
                warehouse_id=wid,
                role="owner",
                is_default=1 if prio == 10 else 0,
                fulfillment_eligible=True,
                fulfillment_priority=prio,
            )
        )
    db.add(
        TenantFulfillmentConfiguration(
            tenant_id=1,
            fulfillment_assignment_mode="DEFAULT_WAREHOUSE",
            consolidation_warehouse_id=2,
        )
    )
    for pid, name in [(101, "A"), (102, "B"), (103, "C"), (104, "D")]:
        db.add(Product(id=pid, tenant_id=1, name=name, sku=f"SKU-{pid}"))
    rack = ConsolidationRack(id=1, tenant_id=1, warehouse_id=2, name="RK-01")
    db.add(rack)
    db.flush()
    level = ConsolidationRackLevel(id=1, rack_id=1, level_index=2, name="A", is_segmented=True)
    db.add(level)
    db.flush()
    db.add(RackSegment(id=1, level_id=1, segment_index=2, order_id=None, fill_percent=0.0))
    db.commit()
    yield db
    db.close()


def _order_with_lines(db, number: str):
    order = Order(
        tenant_id=1,
        warehouse_id=1,
        number=number,
        status="NEW",
        fulfillment_assignment_phase=PHASE_FULFILLMENT_ASSIGNED,
    )
    db.add(order)
    db.flush()
    for pid in (101, 102, 103, 104):
        db.add(OrderItem(order_id=int(order.id), product_id=pid, quantity=1, is_bundle_parent=False))
    db.commit()
    return order


def _receive_all_transfers(db, plan: OrderConsolidationPlan) -> None:
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


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_no_shelf_before_start_staging(mock_commercial, staging_db):
    db = staging_db
    mock_commercial.side_effect = _mock_commercial(_stock_map())
    order = _order_with_lines(db, "NS-1")
    generate_consolidation_plan(db, int(order.id))
    db.commit()
    plan = db.query(OrderConsolidationPlan).filter_by(order_id=int(order.id)).first()
    _receive_all_transfers(db, plan)
    db.refresh(plan)

    assert plan.status == PLAN_STATUS_READY_FOR_STAGING
    assert find_free_segment(db, tenant_id=1, warehouse_id=2) is not None
    seg = db.query(RackSegment).first()
    assert seg.order_id is None


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_start_staging_assigns_segment(mock_commercial, staging_db):
    db = staging_db
    mock_commercial.side_effect = _mock_commercial(_stock_map())
    order = _order_with_lines(db, "ST-1")
    generate_consolidation_plan(db, int(order.id))
    db.commit()
    plan = db.query(OrderConsolidationPlan).filter_by(order_id=int(order.id)).first()
    _receive_all_transfers(db, plan)

    result = start_consolidation_staging(db, plan_id=int(plan.id), tenant_id=1)
    db.commit()
    db.refresh(plan)
    seg = db.query(RackSegment).first()

    assert result["status"] == PLAN_STATUS_STAGING
    assert seg.order_id == int(order.id)
    assert plan.status == PLAN_STATUS_STAGING
    assert "RK-01" in result["shelf_label"]


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_stage_items_completes_plan(mock_commercial, staging_db):
    db = staging_db
    mock_commercial.side_effect = _mock_commercial(_stock_map())
    order = _order_with_lines(db, "SC-1")
    generate_consolidation_plan(db, int(order.id))
    db.commit()
    plan = db.query(OrderConsolidationPlan).filter_by(order_id=int(order.id)).first()
    _receive_all_transfers(db, plan)
    start_consolidation_staging(db, plan_id=int(plan.id), tenant_id=1)
    db.commit()

    items = db.query(OrderConsolidationPlanItem).filter_by(plan_id=int(plan.id)).all()
    for it in items:
        if str(it.status).upper() == ITEM_STATUS_RECEIVED:
            stage_plan_item(db, plan_id=int(plan.id), plan_item_id=int(it.id), tenant_id=1)
    db.commit()
    db.refresh(plan)
    db.refresh(order)

    assert plan.status == PLAN_STATUS_COMPLETED
    assert order.fulfillment_assignment_phase == PHASE_FULFILLMENT_ASSIGNED
    assert all(str(it.status).upper() == ITEM_STATUS_STAGED for it in items if str(it.status).upper() != "CANCELLED")


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_no_free_segments_blocks_start(mock_commercial, staging_db):
    db = staging_db
    mock_commercial.side_effect = _mock_commercial(_stock_map())
    seg = db.query(RackSegment).first()
    seg.order_id = 999
    db.commit()

    order = _order_with_lines(db, "BF-1")
    generate_consolidation_plan(db, int(order.id))
    db.commit()
    plan = db.query(OrderConsolidationPlan).filter_by(order_id=int(order.id)).first()
    _receive_all_transfers(db, plan)

    with pytest.raises(ConsolidationStagingError, match="Brak wolnych"):
        start_consolidation_staging(db, plan_id=int(plan.id), tenant_id=1)


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_release_on_cancel(mock_commercial, staging_db):
    db = staging_db
    mock_commercial.side_effect = _mock_commercial(_stock_map())
    order = _order_with_lines(db, "RL-1")
    generate_consolidation_plan(db, int(order.id))
    db.commit()
    plan = db.query(OrderConsolidationPlan).filter_by(order_id=int(order.id)).first()
    _receive_all_transfers(db, plan)
    start_consolidation_staging(db, plan_id=int(plan.id), tenant_id=1)
    db.commit()

    cancel_consolidation_plan(db, plan_id=int(plan.id), tenant_id=1, reason="test")
    db.commit()
    seg = db.query(RackSegment).first()
    assert seg.order_id is None


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_release_on_packing(mock_commercial, staging_db):
    db = staging_db
    mock_commercial.side_effect = _mock_commercial(_stock_map())
    order = _order_with_lines(db, "RL-2")
    generate_consolidation_plan(db, int(order.id))
    db.commit()
    plan = db.query(OrderConsolidationPlan).filter_by(order_id=int(order.id)).first()
    _receive_all_transfers(db, plan)
    start_consolidation_staging(db, plan_id=int(plan.id), tenant_id=1)
    db.commit()
    seg = db.query(RackSegment).first()
    assert seg.order_id == int(order.id)

    on_packing_started(order, db)
    db.commit()
    db.refresh(seg)
    assert seg.order_id is None


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_resolve_shelf_for_packing(mock_commercial, staging_db):
    db = staging_db
    mock_commercial.side_effect = _mock_commercial(_stock_map())
    order = _order_with_lines(db, "RS-1")
    generate_consolidation_plan(db, int(order.id))
    db.commit()
    plan = db.query(OrderConsolidationPlan).filter_by(order_id=int(order.id)).first()
    _receive_all_transfers(db, plan)
    started = start_consolidation_staging(db, plan_id=int(plan.id), tenant_id=1)
    db.commit()

    resolved = resolve_segment_by_label(db, tenant_id=1, warehouse_id=2, code=started["shelf_label"])
    assert resolved["order_id"] == int(order.id)
    assert resolved["order_number"] == "RS-1"


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_staging_queue_lists_plans(mock_commercial, staging_db):
    db = staging_db
    mock_commercial.side_effect = _mock_commercial(_stock_map())
    order = _order_with_lines(db, "Q-1")
    generate_consolidation_plan(db, int(order.id))
    db.commit()
    plan = db.query(OrderConsolidationPlan).filter_by(order_id=int(order.id)).first()
    _receive_all_transfers(db, plan)

    rows = list_staging_queue(db, tenant_id=1, target_warehouse_id=2)
    assert len(rows) == 1
    assert rows[0]["can_start_staging"] is True
    assert rows[0]["shelf_label"] is None


def test_release_helper_clears_segments(staging_db):
    db = staging_db
    seg = db.query(RackSegment).first()
    seg.order_id = 42
    seg.fill_percent = 50.0
    db.commit()
    assert release_rack_segments_for_order(db, 42) == 1
    db.refresh(seg)
    assert seg.order_id is None
    assert seg.fill_percent == 0.0
