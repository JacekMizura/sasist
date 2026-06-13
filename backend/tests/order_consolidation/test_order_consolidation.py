"""P5 — order consolidation foundation tests."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.order import Order
from backend.models.order_consolidation_plan import OrderConsolidationPlan, OrderConsolidationPlanItem
from backend.models.order_item import OrderItem
from backend.models.product import Product
from backend.models.stock_document import StockDocument, StockDocumentItem
from backend.models.tenant import Tenant
from backend.models.tenant_fulfillment_configuration import TenantFulfillmentConfiguration
from backend.models.tenant_warehouse import TenantWarehouse
from backend.models.warehouse import Warehouse
from backend.services.fulfillment_assignment.phase_constants import (
    PHASE_CONSOLIDATION_REQUIRED,
    PHASE_CONSOLIDATING,
    PHASE_FULFILLMENT_ASSIGNED,
    is_consolidation_wave_blocked,
)
from backend.services.order_consolidation.constants import (
    ITEM_STATUS_IN_TRANSIT,
    ITEM_STATUS_MM_CREATED,
    ITEM_STATUS_RECEIVED,
    ITEM_STATUS_WAITING,
    PLAN_STATUS_COMPLETED,
    PLAN_STATUS_IN_PROGRESS,
    RESULT_CONSOLIDATION_NOT_REQUIRED,
    RESULT_PLAN_CREATED,
)
from backend.services.order_consolidation.feasibility_service import (
    analyze_order_consolidation_feasibility,
    resolve_preferred_consolidation_target_id,
)
from backend.services.order_consolidation.plan_service import (
    generate_consolidation_plan,
    generate_mm_drafts_for_plan,
    refresh_consolidation_plan_progress,
)
from backend.services.wave_service import CONSOLIDATION_WAVE_BLOCKED_PHASES


@pytest.fixture
def consolidation_db():
    engine = create_engine("sqlite:///:memory:")

    Tenant.__table__.create(engine, checkfirst=True)
    Warehouse.__table__.create(engine, checkfirst=True)
    TenantWarehouse.__table__.create(engine, checkfirst=True)
    TenantFulfillmentConfiguration.__table__.create(engine, checkfirst=True)
    Product.__table__.create(engine, checkfirst=True)
    Order.__table__.create(engine, checkfirst=True)
    OrderItem.__table__.create(engine, checkfirst=True)
    OrderConsolidationPlan.__table__.create(engine, checkfirst=True)
    OrderConsolidationPlanItem.__table__.create(engine, checkfirst=True)
    StockDocument.__table__.create(engine, checkfirst=True)
    StockDocumentItem.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    db = Session()

    db.add(Tenant(id=1, name="Firma A", default_warehouse_id=1))
    db.add(Tenant(id=2, name="Firma B", default_warehouse_id=4))
    for wid, name in [(1, "Warszawa"), (2, "Poznań"), (3, "Gdańsk"), (4, "Kraków")]:
        db.add(Warehouse(id=wid, tenant_id=1 if wid < 4 else 2, name=name))
    for tid, wid, prio in [
        (1, 1, 10),
        (1, 2, 5),
        (1, 3, 20),
        (2, 4, 10),
    ]:
        db.add(
            TenantWarehouse(
                tenant_id=tid,
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
    for pid, name in [(101, "Produkt A"), (102, "Produkt B"), (103, "Produkt C"), (104, "Produkt D")]:
        db.add(Product(id=pid, tenant_id=1, name=name, sku=f"SKU-{pid}"))
    db.commit()

    try:
        yield db
    finally:
        db.close()


def _stock_map():
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


def _order_with_lines(db, *, number: str, lines: list[tuple[int, int]]) -> Order:
    order = Order(
        tenant_id=1,
        warehouse_id=1,
        number=number,
        status="NEW",
        fulfillment_assignment_phase=PHASE_FULFILLMENT_ASSIGNED,
    )
    db.add(order)
    db.flush()
    for product_id, qty in lines:
        db.add(
            OrderItem(
                order_id=int(order.id),
                product_id=int(product_id),
                quantity=int(qty),
                is_bundle_parent=False,
            )
        )
    db.commit()
    return order


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_single_warehouse_no_consolidation(mock_commercial, consolidation_db):
    db = consolidation_db
    mock_commercial.side_effect = _mock_commercial(
        {
            (1, 2, 101): 5.0,
            (1, 2, 102): 5.0,
            (1, 2, 103): 5.0,
            (1, 2, 104): 5.0,
        }
    )
    order = _order_with_lines(
        db,
        number="S-1",
        lines=[(101, 1), (102, 1), (103, 1), (104, 1)],
    )
    result = generate_consolidation_plan(db, int(order.id))
    db.commit()
    db.refresh(order)

    assert result.outcome == RESULT_CONSOLIDATION_NOT_REQUIRED
    assert order.fulfillment_assignment_phase == PHASE_FULFILLMENT_ASSIGNED
    assert order.warehouse_id == 2


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_three_warehouses_consolidation_plan(mock_commercial, consolidation_db):
    db = consolidation_db
    mock_commercial.side_effect = _mock_commercial(_stock_map())
    order = _order_with_lines(
        db,
        number="M-1",
        lines=[(101, 1), (102, 1), (103, 1), (104, 1)],
    )
    analysis = analyze_order_consolidation_feasibility(db, int(order.id))
    assert analysis.best_consolidation_candidate == 2
    assert analysis.single_warehouse_fulfillment_id is None

    result = generate_consolidation_plan(db, int(order.id))
    db.commit()
    db.refresh(order)

    assert result.outcome == RESULT_PLAN_CREATED
    assert order.fulfillment_assignment_phase == PHASE_CONSOLIDATION_REQUIRED
    assert order.warehouse_id == 2

    plan = db.query(OrderConsolidationPlan).filter_by(order_id=int(order.id)).first()
    assert plan is not None
    assert int(plan.target_warehouse_id) == 2
    items = db.query(OrderConsolidationPlanItem).filter_by(plan_id=int(plan.id)).all()
    transfers = [it for it in items if int(it.source_warehouse_id) != int(it.target_warehouse_id)]
    assert len(transfers) == 2
    sources = {int(it.source_warehouse_id) for it in transfers}
    assert sources == {1, 3}


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_consolidation_target_fallback_resolver(mock_commercial, consolidation_db):
    db = consolidation_db
    cfg = db.query(TenantFulfillmentConfiguration).filter_by(tenant_id=1).first()
    cfg.consolidation_warehouse_id = None
    db.commit()

    mock_commercial.side_effect = _mock_commercial(_stock_map())
    order = _order_with_lines(db, number="F-1", lines=[(101, 1), (102, 1), (103, 1), (104, 1)])
    order.warehouse_id = 2
    db.commit()

    target = resolve_preferred_consolidation_target_id(db, order)
    assert target == 2


@patch("backend.services.order_consolidation.plan_service.assign_series_number_to_stock_document")
@patch("backend.services.order_consolidation.plan_service.get_or_create_mm_placeholder_fks", return_value=(1, 1))
@patch(
    "backend.services.order_consolidation.plan_service.assert_relocation_document_series_configured",
    return_value=SimpleNamespace(code="MM", id="series-1"),
)
@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_generate_mm_drafts(
    mock_commercial,
    _mock_series,
    _mock_placeholders,
    _mock_assign,
    consolidation_db,
):
    db = consolidation_db
    mock_commercial.side_effect = _mock_commercial(_stock_map())
    order = _order_with_lines(db, number="MM-1", lines=[(101, 1), (102, 1), (103, 1), (104, 1)])
    generate_consolidation_plan(db, int(order.id))
    db.commit()
    plan = db.query(OrderConsolidationPlan).filter_by(order_id=int(order.id)).first()

    result = generate_mm_drafts_for_plan(db, int(plan.id))
    db.commit()
    db.refresh(order)

    assert result.documents_created == 2
    assert order.fulfillment_assignment_phase == PHASE_CONSOLIDATING
    assert plan.status == PLAN_STATUS_IN_PROGRESS
    mm_items = (
        db.query(OrderConsolidationPlanItem)
        .filter(
            OrderConsolidationPlanItem.plan_id == int(plan.id),
            OrderConsolidationPlanItem.status.in_((ITEM_STATUS_MM_CREATED, ITEM_STATUS_IN_TRANSIT)),
        )
        .all()
    )
    assert len(mm_items) == 2
    assert all(it.stock_document_id is not None for it in mm_items)


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_consolidation_completion(mock_commercial, consolidation_db):
    db = consolidation_db
    mock_commercial.side_effect = _mock_commercial(_stock_map())
    order = _order_with_lines(db, number="C-1", lines=[(101, 1), (102, 1), (103, 1), (104, 1)])
    generate_consolidation_plan(db, int(order.id))
    db.commit()
    plan = db.query(OrderConsolidationPlan).filter_by(order_id=int(order.id)).first()

    for it in db.query(OrderConsolidationPlanItem).filter_by(plan_id=int(plan.id)).all():
        if it.status != ITEM_STATUS_WAITING or int(it.source_warehouse_id) == int(it.target_warehouse_id):
            continue
        d = StockDocument(
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
        db.add(d)
        db.flush()
        it.stock_document_id = int(d.id)
        it.status = ITEM_STATUS_MM_CREATED
    db.commit()

    refresh_consolidation_plan_progress(db, int(plan.id))
    db.commit()
    db.refresh(plan)
    db.refresh(order)

    assert plan.status == PLAN_STATUS_COMPLETED
    assert order.fulfillment_assignment_phase == PHASE_FULFILLMENT_ASSIGNED


def test_wave_blocked_during_consolidation():
    assert is_consolidation_wave_blocked(PHASE_CONSOLIDATION_REQUIRED)
    assert is_consolidation_wave_blocked(PHASE_CONSOLIDATING)
    assert not is_consolidation_wave_blocked(PHASE_FULFILLMENT_ASSIGNED)
    assert PHASE_CONSOLIDATION_REQUIRED in CONSOLIDATION_WAVE_BLOCKED_PHASES


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_multi_tenant_isolation(mock_commercial, consolidation_db):
    db = consolidation_db
    mock_commercial.side_effect = _mock_commercial({(2, 4, 201): 5.0})
    db.add(Product(id=201, tenant_id=2, name="T2 prod", sku="T2"))
    order = Order(
        tenant_id=2,
        warehouse_id=4,
        number="T2-1",
        status="NEW",
        fulfillment_assignment_phase=PHASE_FULFILLMENT_ASSIGNED,
    )
    db.add(order)
    db.flush()
    db.add(OrderItem(order_id=int(order.id), product_id=201, quantity=1, is_bundle_parent=False))
    db.commit()

    analysis = analyze_order_consolidation_feasibility(db, int(order.id))
    assert analysis.tenant_id == 2
    assert analysis.single_warehouse_fulfillment_id == 4

    t1_plans = (
        db.query(OrderConsolidationPlan)
        .join(Order, Order.id == OrderConsolidationPlan.order_id)
        .filter(Order.tenant_id == 1)
        .count()
    )
    assert t1_plans == 0
