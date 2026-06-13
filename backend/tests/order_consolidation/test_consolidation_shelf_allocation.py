"""P5.7 — smart consolidation shelf allocation tests."""

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
    PLAN_STATUS_READY_FOR_STAGING,
    PLAN_STATUS_STAGING,
)
from backend.services.order_consolidation.plan_service import (
    generate_consolidation_plan,
    refresh_consolidation_plan_progress,
)
from backend.services.order_consolidation.shelf_allocation_service import (
    NO_FREE_CONSOLIDATION_SHELF,
    allocate_consolidation_shelf,
)
from backend.services.order_consolidation.staging_service import (
    ConsolidationNoFreeShelfError,
    release_rack_segments_for_order,
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
def alloc_db():
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
    db.add(Tenant(id=2, name="Firma B", default_warehouse_id=4))
    for wid, name, tid in [(1, "Warszawa", 1), (2, "Poznań", 1), (3, "Gdańsk", 1), (4, "Kraków", 2)]:
        db.add(Warehouse(id=wid, tenant_id=tid, name=name))
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
    db.commit()
    yield db
    db.close()


def _add_rack_with_levels(
    db,
    *,
    tenant_id: int,
    warehouse_id: int,
    rack_name: str,
    levels: list[tuple[int, int]],
) -> ConsolidationRack:
    """levels: list of (level_index, segment_count)."""
    rack = ConsolidationRack(tenant_id=tenant_id, warehouse_id=warehouse_id, name=rack_name)
    db.add(rack)
    db.flush()
    for level_index, seg_count in levels:
        level = ConsolidationRackLevel(
            rack_id=int(rack.id),
            level_index=level_index,
            name=chr(ord("A") + level_index),
            is_segmented=seg_count > 1,
        )
        db.add(level)
        db.flush()
        for seg_idx in range(seg_count):
            db.add(
                RackSegment(
                    level_id=int(level.id),
                    segment_index=seg_idx,
                    order_id=None,
                    fill_percent=0.0,
                )
            )
    db.commit()
    db.refresh(rack)
    return rack


def _order_with_lines(db, number: str, tenant_id: int = 1):
    order = Order(
        tenant_id=tenant_id,
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


def test_prefers_lowest_level_free_segment(alloc_db):
    db = alloc_db
    _add_rack_with_levels(db, tenant_id=1, warehouse_id=2, rack_name="RK-01", levels=[(2, 1), (0, 1), (1, 1)])

    chosen = allocate_consolidation_shelf(db, tenant_id=1, warehouse_id=2)
    assert chosen is not None
    level = db.query(ConsolidationRackLevel).filter_by(id=int(chosen.level_id)).one()
    assert int(level.level_index) == 0


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_start_staging_picks_lowest_level(mock_commercial, alloc_db):
    db = alloc_db
    mock_commercial.side_effect = _mock_commercial(_stock_map())
    _add_rack_with_levels(db, tenant_id=1, warehouse_id=2, rack_name="RK-01", levels=[(2, 1), (0, 1)])

    order = _order_with_lines(db, "AL-1")
    generate_consolidation_plan(db, int(order.id))
    db.commit()
    plan = db.query(OrderConsolidationPlan).filter_by(order_id=int(order.id)).first()
    _receive_all_transfers(db, plan)

    result = start_consolidation_staging(db, plan_id=int(plan.id), tenant_id=1)
    db.commit()
    seg = db.query(RackSegment).filter_by(id=int(result["segment_id"])).one()
    level = db.query(ConsolidationRackLevel).filter_by(id=int(seg.level_id)).one()
    assert int(level.level_index) == 0
    assert plan.status == PLAN_STATUS_STAGING


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_no_free_shelves_keeps_ready_for_staging(mock_commercial, alloc_db):
    db = alloc_db
    mock_commercial.side_effect = _mock_commercial(_stock_map())
    _add_rack_with_levels(db, tenant_id=1, warehouse_id=2, rack_name="RK-01", levels=[(0, 1)])
    seg = db.query(RackSegment).first()
    seg.order_id = 999
    db.commit()

    order = _order_with_lines(db, "NF-1")
    generate_consolidation_plan(db, int(order.id))
    db.commit()
    plan = db.query(OrderConsolidationPlan).filter_by(order_id=int(order.id)).first()
    _receive_all_transfers(db, plan)

    with pytest.raises(ConsolidationNoFreeShelfError) as exc_info:
        start_consolidation_staging(db, plan_id=int(plan.id), tenant_id=1)
    assert exc_info.value.code == NO_FREE_CONSOLIDATION_SHELF
    db.refresh(plan)
    assert plan.status == PLAN_STATUS_READY_FOR_STAGING


def test_warehouse_isolation(alloc_db):
    db = alloc_db
    _add_rack_with_levels(db, tenant_id=1, warehouse_id=3, rack_name="RK-GDN", levels=[(0, 1)])
    _add_rack_with_levels(db, tenant_id=1, warehouse_id=2, rack_name="RK-POZ", levels=[(1, 1)])

    chosen = allocate_consolidation_shelf(db, tenant_id=1, warehouse_id=2)
    assert chosen is not None
    level = db.query(ConsolidationRackLevel).filter_by(id=int(chosen.level_id)).one()
    rack = db.query(ConsolidationRack).filter_by(id=int(level.rack_id)).one()
    assert int(rack.warehouse_id) == 2
    assert rack.name == "RK-POZ"


def test_multi_tenant_isolation(alloc_db):
    db = alloc_db
    _add_rack_with_levels(db, tenant_id=2, warehouse_id=4, rack_name="RK-T2", levels=[(0, 1)])
    _add_rack_with_levels(db, tenant_id=1, warehouse_id=2, rack_name="RK-T1", levels=[(0, 1)])

    assert allocate_consolidation_shelf(db, tenant_id=1, warehouse_id=2) is not None
    assert allocate_consolidation_shelf(db, tenant_id=2, warehouse_id=4) is not None
    assert allocate_consolidation_shelf(db, tenant_id=1, warehouse_id=4) is None


def test_prefers_same_rack_with_active_staging(alloc_db):
    db = alloc_db
    rack_a = _add_rack_with_levels(db, tenant_id=1, warehouse_id=2, rack_name="RK-A", levels=[(0, 2)])
    _add_rack_with_levels(db, tenant_id=1, warehouse_id=2, rack_name="RK-B", levels=[(0, 1)])

    level_a = (
        db.query(ConsolidationRackLevel)
        .filter_by(rack_id=int(rack_a.id), level_index=0)
        .one()
    )
    segments = (
        db.query(RackSegment)
        .filter_by(level_id=int(level_a.id))
        .order_by(RackSegment.segment_index)
        .all()
    )
    segments[0].order_id = 100
    db.add(
        Order(
            id=100,
            tenant_id=1,
            warehouse_id=1,
            number="STG-100",
            status="NEW",
            fulfillment_assignment_phase=PHASE_FULFILLMENT_ASSIGNED,
        )
    )
    db.add(
        OrderConsolidationPlan(
            order_id=100,
            target_warehouse_id=2,
            status=PLAN_STATUS_STAGING,
        )
    )
    db.commit()

    chosen = allocate_consolidation_shelf(db, tenant_id=1, warehouse_id=2)
    assert chosen is not None
    assert int(chosen.level_id) == int(level_a.id)
    assert int(chosen.segment_index) == 1


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_shelf_release_on_cancel_and_packing(mock_commercial, alloc_db):
    db = alloc_db
    mock_commercial.side_effect = _mock_commercial(_stock_map())
    _add_rack_with_levels(db, tenant_id=1, warehouse_id=2, rack_name="RK-01", levels=[(0, 2)])

    order_cancel = _order_with_lines(db, "RL-C")
    generate_consolidation_plan(db, int(order_cancel.id))
    db.commit()
    plan_cancel = db.query(OrderConsolidationPlan).filter_by(order_id=int(order_cancel.id)).first()
    _receive_all_transfers(db, plan_cancel)
    start_consolidation_staging(db, plan_id=int(plan_cancel.id), tenant_id=1)
    db.commit()
    seg_cancel = db.query(RackSegment).filter_by(order_id=int(order_cancel.id)).one()
    cancel_consolidation_plan(db, plan_id=int(plan_cancel.id), tenant_id=1, reason="test")
    db.commit()
    db.refresh(seg_cancel)
    assert seg_cancel.order_id is None

    order_pack = _order_with_lines(db, "RL-P")
    generate_consolidation_plan(db, int(order_pack.id))
    db.commit()
    plan_pack = db.query(OrderConsolidationPlan).filter_by(order_id=int(order_pack.id)).first()
    _receive_all_transfers(db, plan_pack)
    start_consolidation_staging(db, plan_id=int(plan_pack.id), tenant_id=1)
    db.commit()
    seg_pack = db.query(RackSegment).filter_by(order_id=int(order_pack.id)).one()
    assert seg_pack.order_id == int(order_pack.id)

    on_packing_started(order_pack, db)
    db.commit()
    db.refresh(seg_pack)
    assert seg_pack.order_id is None
    assert release_rack_segments_for_order(db, int(order_pack.id)) == 0
