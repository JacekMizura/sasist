"""P5.4 — consolidation shelf deposits & packing readiness."""

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
from backend.services.order_consolidation.consolidation_context import (
    consolidation_blocks_ready_to_pack,
    consolidation_packing_ready,
    mark_local_plan_item_picked,
    order_in_consolidation_staging_pick,
)
from backend.services.order_consolidation.constants import (
    ITEM_STATUS_MM_CREATED,
    ITEM_STATUS_PICKED,
    ITEM_STATUS_RECEIVED,
    ITEM_STATUS_STAGED,
    ITEM_STATUS_TO_PICK,
    PLAN_STATUS_COMPLETED,
    PLAN_STATUS_STAGING,
)
from backend.services.order_consolidation.plan_service import (
    generate_consolidation_plan,
    refresh_consolidation_plan_progress,
)
from backend.services.order_consolidation.staging_service import (
    ConsolidationStagingError,
    resolve_segment_by_label,
    stage_plan_item,
    start_consolidation_staging,
)
from backend.services.order_fulfillment_state import READY_TO_PACK
from backend.services.wms_queue_eligibility import assert_order_wms_fulfillment_not_blocked


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
def deposit_db():
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
    db.add(Tenant(id=1, name="A", default_warehouse_id=1))
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


def _setup_plan(db):
    order = Order(
        tenant_id=1,
        warehouse_id=1,
        number="D-1",
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
    start_consolidation_staging(db, plan_id=int(plan.id), tenant_id=1)
    db.commit()
    db.refresh(plan)
    return plan, order


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_received_not_staged(mock_commercial, deposit_db):
    db = deposit_db
    mock_commercial.side_effect = _mock_commercial(_stock_map())
    plan, _order = _setup_plan(db)
    mm = [
        it
        for it in db.query(OrderConsolidationPlanItem).filter_by(plan_id=int(plan.id)).all()
        if int(it.source_warehouse_id) != int(it.target_warehouse_id)
    ][0]
    assert str(mm.status).upper() == ITEM_STATUS_RECEIVED
    assert str(mm.status).upper() != ITEM_STATUS_STAGED


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_picked_not_staged(mock_commercial, deposit_db):
    db = deposit_db
    mock_commercial.side_effect = _mock_commercial(_stock_map())
    plan, order = _setup_plan(db)
    local = [
        it
        for it in db.query(OrderConsolidationPlanItem).filter_by(plan_id=int(plan.id)).all()
        if int(it.source_warehouse_id) == int(it.target_warehouse_id)
    ][0]
    assert str(local.status).upper() == ITEM_STATUS_TO_PICK
    mark_local_plan_item_picked(db, order_id=int(order.id), product_id=int(local.product_id))
    db.commit()
    db.refresh(local)
    assert str(local.status).upper() == ITEM_STATUS_PICKED
    assert str(local.status).upper() != ITEM_STATUS_STAGED


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_local_and_mm_can_be_staged(mock_commercial, deposit_db):
    db = deposit_db
    mock_commercial.side_effect = _mock_commercial(_stock_map())
    plan, order = _setup_plan(db)
    items = db.query(OrderConsolidationPlanItem).filter_by(plan_id=int(plan.id)).all()
    local = next(it for it in items if int(it.source_warehouse_id) == int(it.target_warehouse_id))
    mm = next(it for it in items if int(it.source_warehouse_id) != int(it.target_warehouse_id))
    mark_local_plan_item_picked(db, order_id=int(order.id), product_id=int(local.product_id))
    db.commit()
    stage_plan_item(db, plan_id=int(plan.id), plan_item_id=int(local.id), tenant_id=1)
    stage_plan_item(db, plan_id=int(plan.id), plan_item_id=int(mm.id), tenant_id=1)
    db.commit()
    db.refresh(local)
    db.refresh(mm)
    assert str(local.status).upper() == ITEM_STATUS_STAGED
    assert str(mm.status).upper() == ITEM_STATUS_STAGED


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_partial_staging_not_ready_to_pack(mock_commercial, deposit_db):
    db = deposit_db
    mock_commercial.side_effect = _mock_commercial(_stock_map())
    plan, order = _setup_plan(db)
    mm = [
        it
        for it in db.query(OrderConsolidationPlanItem).filter_by(plan_id=int(plan.id)).all()
        if int(it.source_warehouse_id) != int(it.target_warehouse_id)
    ][0]
    stage_plan_item(db, plan_id=int(plan.id), plan_item_id=int(mm.id), tenant_id=1)
    db.commit()
    db.refresh(plan)
    assert not consolidation_packing_ready(db, int(order.id))
    assert consolidation_blocks_ready_to_pack(db, int(order.id))


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_all_staged_ready_to_pack(mock_commercial, deposit_db):
    db = deposit_db
    mock_commercial.side_effect = _mock_commercial(_stock_map())
    plan, order = _setup_plan(db)
    for it in db.query(OrderConsolidationPlanItem).filter_by(plan_id=int(plan.id)).all():
        if int(it.source_warehouse_id) == int(it.target_warehouse_id):
            mark_local_plan_item_picked(db, order_id=int(order.id), product_id=int(it.product_id))
        stage_plan_item(db, plan_id=int(plan.id), plan_item_id=int(it.id), tenant_id=1)
    db.commit()
    db.refresh(plan)
    db.refresh(order)
    assert str(plan.status).upper() == PLAN_STATUS_COMPLETED
    assert str(order.fulfillment_state).upper() == READY_TO_PACK
    assert consolidation_packing_ready(db, int(order.id))


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_packing_resolve_after_ready(mock_commercial, deposit_db):
    db = deposit_db
    mock_commercial.side_effect = _mock_commercial(_stock_map())
    plan, order = _setup_plan(db)
    shelf_label = None
    seg = db.query(RackSegment).filter(RackSegment.order_id == int(order.id)).first()
    if seg is not None:
        from backend.services.order_consolidation.staging_service import _segment_with_context, segment_label_for_row

        ctx = _segment_with_context(db, int(seg.id))
        shelf_label = segment_label_for_row(ctx[0], ctx[1], ctx[2]) if ctx else None
    for it in db.query(OrderConsolidationPlanItem).filter_by(plan_id=int(plan.id)).all():
        if int(it.source_warehouse_id) == int(it.target_warehouse_id):
            mark_local_plan_item_picked(db, order_id=int(order.id), product_id=int(it.product_id))
        stage_plan_item(db, plan_id=int(plan.id), plan_item_id=int(it.id), tenant_id=1)
    db.commit()
    assert shelf_label
    resolved = resolve_segment_by_label(db, tenant_id=1, warehouse_id=2, code=shelf_label)
    assert resolved["order_id"] == int(order.id)
    assert resolved["packing_ready"] is True


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_packing_resolve_blocked_before_ready(mock_commercial, deposit_db):
    db = deposit_db
    mock_commercial.side_effect = _mock_commercial(_stock_map())
    plan, order = _setup_plan(db)
    seg = db.query(RackSegment).filter(RackSegment.order_id == int(order.id)).first()
    assert seg is not None
    from backend.services.order_consolidation.staging_service import _segment_with_context, segment_label_for_row

    ctx = _segment_with_context(db, int(seg.id))
    shelf_label = segment_label_for_row(ctx[0], ctx[1], ctx[2]) if ctx else None
    assert shelf_label
    with pytest.raises(ConsolidationStagingError, match="nie jest gotowe"):
        resolve_segment_by_label(db, tenant_id=1, warehouse_id=2, code=shelf_label)


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_no_shelf_blocks_staging_deposit(mock_commercial, deposit_db):
    db = deposit_db
    mock_commercial.side_effect = _mock_commercial(_stock_map())
    plan, _order = _setup_plan(db)
    seg = db.query(RackSegment).first()
    seg.order_id = None
    plan.status = PLAN_STATUS_STAGING
    db.commit()
    item = db.query(OrderConsolidationPlanItem).filter_by(plan_id=int(plan.id)).first()
    with pytest.raises(ConsolidationStagingError, match="Brak przypisanej półki"):
        stage_plan_item(db, plan_id=int(plan.id), plan_item_id=int(item.id), tenant_id=1)


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_staging_pick_allowed(mock_commercial, deposit_db):
    db = deposit_db
    mock_commercial.side_effect = _mock_commercial(_stock_map())
    plan, order = _setup_plan(db)
    assert order_in_consolidation_staging_pick(db, int(order.id))
    assert_order_wms_fulfillment_not_blocked(order, db, for_picking=True)


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_cancel_clears_staging(mock_commercial, deposit_db):
    db = deposit_db
    mock_commercial.side_effect = _mock_commercial(_stock_map())
    plan, order = _setup_plan(db)
    cancel_consolidation_plan(db, plan_id=int(plan.id), tenant_id=1, reason="test")
    db.commit()
    seg = db.query(RackSegment).first()
    assert seg.order_id is None
