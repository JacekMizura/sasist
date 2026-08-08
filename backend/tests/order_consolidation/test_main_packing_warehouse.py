"""Main packing warehouse (= consolidation_warehouse_id) for multi-WH sorting zone flow."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.order import Order
from backend.models.order_consolidation_plan import OrderConsolidationPlan, OrderConsolidationPlanItem
from backend.models.order_item import OrderItem
from backend.models.product import Product
from backend.models.tenant import Tenant
from backend.models.tenant_fulfillment_configuration import TenantFulfillmentConfiguration
from backend.models.tenant_warehouse import TenantWarehouse
from backend.models.warehouse import Warehouse
from backend.schemas.fulfillment_configuration import FulfillmentConfigurationUpdate
from backend.services.fulfillment_assignment.phase_constants import (
    PHASE_CONSOLIDATION_REQUIRED,
    PHASE_FULFILLMENT_ASSIGNED,
)
from backend.services.fulfillment_configuration_service import (
    FulfillmentConfigurationError,
    update_fulfillment_configuration,
)
from backend.services.order_consolidation.constants import (
    RESULT_CONSOLIDATION_NOT_REQUIRED,
    RESULT_PLAN_CREATED,
)
from backend.services.order_consolidation.feasibility_service import (
    analyze_order_consolidation_feasibility,
    resolve_preferred_consolidation_target_id,
)
from backend.services.order_consolidation.plan_service import generate_consolidation_plan


@pytest.fixture
def packing_wh_db():
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

    Session = sessionmaker(bind=engine)
    db = Session()

    db.add(Tenant(id=1, name="Firma A", default_warehouse_id=1))
    db.add(Tenant(id=2, name="Firma B", default_warehouse_id=4))
    for wid, name, tid in [(1, "Warszawa", 1), (2, "Poznań", 1), (3, "Gdańsk", 1), (4, "Kraków", 2)]:
        db.add(Warehouse(id=wid, tenant_id=tid, name=name))
    for tid, wid, prio in [(1, 1, 10), (1, 2, 5), (1, 3, 20), (2, 4, 10)]:
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
            consolidation_warehouse_id=None,
        )
    )
    for pid, name in [(101, "Produkt A"), (102, "Produkt B"), (103, "Produkt C")]:
        db.add(Product(id=pid, tenant_id=1, name=name, sku=f"SKU-{pid}"))
    db.commit()

    try:
        yield db
    finally:
        db.close()


def _stock_split():
    """A only in WH1, B only in WH2, C only in WH3."""
    return {
        (1, 1, 101): 10.0,
        (1, 2, 102): 10.0,
        (1, 3, 103): 10.0,
    }


def _stock_single_wh2():
    return {
        (1, 2, 101): 10.0,
        (1, 2, 102): 10.0,
    }


def _mock_commercial(stock: dict):
    def _fn(db, *, tenant_id, warehouse_id, product_id):
        return float(stock.get((int(tenant_id), int(warehouse_id), int(product_id)), 0.0))

    return _fn


def _order_with_lines(db, *, number: str, lines: list[tuple[int, int]], warehouse_id: int = 1) -> Order:
    order = Order(
        tenant_id=1,
        warehouse_id=warehouse_id,
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


def test_main_packing_warehouse_unset_keeps_fallback(packing_wh_db):
    db = packing_wh_db
    cfg = db.query(TenantFulfillmentConfiguration).filter_by(tenant_id=1).first()
    assert cfg.consolidation_warehouse_id is None

    order = _order_with_lines(db, number="U-1", lines=[(101, 1), (102, 1)], warehouse_id=1)
    preferred = resolve_preferred_consolidation_target_id(db, order)
    assert preferred == 1  # order.warehouse_id fallback


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_main_packing_warehouse_set_routes_multi_wh_order(mock_commercial, packing_wh_db):
    db = packing_wh_db
    update_fulfillment_configuration(
        db,
        1,
        FulfillmentConfigurationUpdate(consolidation_warehouse_id=3),
    )
    mock_commercial.side_effect = _mock_commercial(_stock_split())
    order = _order_with_lines(db, number="M-1", lines=[(101, 1), (102, 1), (103, 1)])

    analysis = analyze_order_consolidation_feasibility(db, int(order.id))
    assert analysis.single_warehouse_fulfillment_id is None
    assert analysis.best_consolidation_candidate == 3

    result = generate_consolidation_plan(db, int(order.id))
    db.commit()
    db.refresh(order)

    assert result.outcome == RESULT_PLAN_CREATED
    assert order.fulfillment_assignment_phase == PHASE_CONSOLIDATION_REQUIRED
    assert order.warehouse_id == 3
    plan = db.query(OrderConsolidationPlan).filter_by(order_id=int(order.id)).first()
    assert plan is not None
    assert int(plan.target_warehouse_id) == 3


@patch("backend.services.order_consolidation.feasibility_service.commercially_sellable_qty")
def test_single_warehouse_order_not_changed_by_main_packing_setting(mock_commercial, packing_wh_db):
    db = packing_wh_db
    update_fulfillment_configuration(
        db,
        1,
        FulfillmentConfigurationUpdate(consolidation_warehouse_id=3),
    )
    mock_commercial.side_effect = _mock_commercial(_stock_single_wh2())
    order = _order_with_lines(db, number="S-1", lines=[(101, 1), (102, 1)], warehouse_id=1)

    result = generate_consolidation_plan(db, int(order.id))
    db.commit()
    db.refresh(order)

    assert result.outcome == RESULT_CONSOLIDATION_NOT_REQUIRED
    assert order.fulfillment_assignment_phase == PHASE_FULFILLMENT_ASSIGNED
    assert order.warehouse_id == 2  # single-WH fulfillment by priority, not main packing WH=3


def test_cannot_save_main_packing_warehouse_from_other_tenant(packing_wh_db):
    db = packing_wh_db
    with pytest.raises(FulfillmentConfigurationError):
        update_fulfillment_configuration(
            db,
            1,
            FulfillmentConfigurationUpdate(consolidation_warehouse_id=4),  # tenant 2
        )
    cfg = db.query(TenantFulfillmentConfiguration).filter_by(tenant_id=1).first()
    assert cfg.consolidation_warehouse_id is None


def test_clear_main_packing_warehouse_is_valid(packing_wh_db):
    db = packing_wh_db
    update_fulfillment_configuration(
        db,
        1,
        FulfillmentConfigurationUpdate(consolidation_warehouse_id=2),
    )
    update_fulfillment_configuration(
        db,
        1,
        FulfillmentConfigurationUpdate(consolidation_warehouse_id=None),
    )
    cfg = db.query(TenantFulfillmentConfiguration).filter_by(tenant_id=1).first()
    assert cfg.consolidation_warehouse_id is None


def test_invalid_main_packing_warehouse_falls_back_without_error(packing_wh_db):
    """Deleted / no longer eligible preferred WH must not break existing orders."""
    db = packing_wh_db
    cfg = db.query(TenantFulfillmentConfiguration).filter_by(tenant_id=1).first()
    cfg.consolidation_warehouse_id = 2
    tw = (
        db.query(TenantWarehouse)
        .filter(TenantWarehouse.tenant_id == 1, TenantWarehouse.warehouse_id == 2)
        .first()
    )
    tw.fulfillment_eligible = False
    db.commit()

    order = _order_with_lines(db, number="X-1", lines=[(101, 1)], warehouse_id=1)
    preferred = resolve_preferred_consolidation_target_id(db, order)
    assert preferred == 1
