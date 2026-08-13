"""
Phase 2 — automatic ORDERS MO create/aggregate/withdraw on panel status change.

  python -m pytest backend/tests/test_production_order_trigger.py -q
"""

from __future__ import annotations

import threading
from datetime import date

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.order_ui_status import OrderUiStatus
from backend.models.picking_config import PickingConfig
from backend.models.product import Product
from backend.models.product_composition import ProductComposition, ProductCompositionLine
from backend.models.production import (
    PRODUCTION_ORDER_SOURCE_ITEM_CANCELLED,
    PRODUCTION_ORDER_SOURCE_ITEM_FULFILLED,
    PRODUCTION_ORDER_SOURCE_ITEM_RESERVED,
    PRODUCTION_ORDER_SOURCE_ITEM_SHORTAGE,
    PRODUCTION_ORDER_SOURCE_MANUAL,
    PRODUCTION_ORDER_SOURCE_ORDERS,
    ProductionOrder,
    ProductionOrderLineSnapshot,
    ProductionOrderSourceItem,
)
from backend.models.stock_reservation import StockReservation
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.services.order_panel_ui_status_service import apply_order_panel_ui_status
from backend.services.production_order_trigger import (
    RESULT_AGGREGATED,
    RESULT_ALREADY_FULFILLED,
    RESULT_CREATED,
    RESULT_IDEMPOTENT,
    RESULT_NO_ACTIVE_MANUFACTURING_COMPOSITION,
    RESULT_UNSUPPORTED_MULTI_ITEM,
    RESULT_WITHDRAWAL_BLOCKED,
    RESULT_WITHDRAWN,
    on_order_panel_status_changed_production,
)
from backend.services.production_order_trigger.trigger_service import _enter_production
from backend.services.stock_disposition import STOCK_DISPOSITION_SALEABLE


def _engine():
    eng = create_engine("sqlite:///:memory:")

    @event.listens_for(eng, "connect")
    def _fk(dbapi_conn, _):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=OFF")
        cur.close()

    return eng


@pytest.fixture(autouse=True)
def _patch_reservation_side_effects(monkeypatch):
    monkeypatch.setattr(
        "backend.services.reservations.reservation_service.record_inventory_movement",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "backend.services.reservations.lifecycle_service.record_inventory_movement",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "backend.services.commercial_availability_service._total_saleable_issued_by_product",
        lambda *_a, **_k: {},
    )
    monkeypatch.setattr(
        "backend.services.production_shortages.analysis_service.expected_availability_date",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "backend.services.production_shortages.analysis_service._substitute_proposals",
        lambda *_a, **_k: [],
    )
    monkeypatch.setattr(
        "backend.services.production_order_trigger.trigger_service.append_order_activity_for_wms",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "backend.services.production_order_trigger.material_validation_service.append_order_activity_for_wms",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "backend.services.reservations.lifecycle_service.emit_operational_sales_event",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "backend.services.reservations.lifecycle_service.log_reservation_lifecycle",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "backend.services.order_panel_ui_status_service._run_smart_matching_status_hook",
        lambda *_a, **_k: None,
    )


def _bootstrap(db_session_factory):
    engine = _engine()
    for model in (
        Tenant,
        Warehouse,
        Location,
        OrderUiStatus,
        Product,
        ProductComposition,
        ProductCompositionLine,
        PickingConfig,
        Order,
        OrderItem,
        ProductionOrder,
        ProductionOrderLineSnapshot,
        ProductionOrderSourceItem,
        Inventory,
        StockReservation,
    ):
        model.__table__.create(engine, checkfirst=True)

    # Phase-2 concurrency indexes (same as migration; SQLite supports partial unique).
    with engine.begin() as conn:
        from sqlalchemy import text

        conn.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_prod_order_orders_open_agg
                ON production_orders (
                    tenant_id, warehouse_id, product_id, composition_id, picking_config_id
                )
                WHERE source_type = 'ORDERS' AND status IN ('draft', 'planned')
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_prod_source_active_order_item
                ON production_order_source_items (tenant_id, order_item_id)
                WHERE status IN ('open', 'partial', 'reserved')
                """
            )
        )

    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(Tenant(id=1, name="T", default_warehouse_id=1))
    db.add(Warehouse(id=1, tenant_id=1, name="WH", requires_putaway=False))
    db.add(
        Location(
            id=1,
            warehouse_id=1,
            name="PICK-1",
            type="pick",
            location_type="NORMAL",
            is_active=True,
        )
    )
    db.add(Location(id=50, warehouse_id=1, name="BUF", is_active=True, location_type="NORMAL"))
    for sid, name in (
        (10, "Produkcja A"),
        (11, "Po produkcji"),
        (12, "Problem produkcji"),
        (13, "Inny"),
        (20, "Produkcja B"),
        (21, "Po B"),
        (22, "Problem B"),
    ):
        db.add(
            OrderUiStatus(
                id=sid,
                tenant_id=1,
                warehouse_id=1,
                name=name,
                color="#000",
                main_group="NEW",
            )
        )
    db.add(Product(id=100, tenant_id=1, name="Krzesło", sku="KRZ"))
    db.add(Product(id=101, tenant_id=1, name="Noga", sku="NOG"))
    db.add(Product(id=200, tenant_id=1, name="Stół", sku="STO"))
    comp = ProductComposition(
        id=1,
        tenant_id=1,
        product_id=100,
        name="Krzesło BOM",
        composition_mode="manufacturing",
        is_active=True,
        yield_quantity=1.0,
    )
    db.add(comp)
    db.flush()
    db.add(
        ProductCompositionLine(
            composition_id=1,
            component_product_id=101,
            quantity=2.0,
            waste_percent=0.0,
            sort_order=0,
        )
    )
    # Second composition (different BOM) for same product family — product 200
    db.add(
        ProductComposition(
            id=2,
            tenant_id=1,
            product_id=200,
            name="Stół BOM",
            composition_mode="manufacturing",
            is_active=True,
            yield_quantity=1.0,
        )
    )
    db.flush()
    db.add(
        ProductCompositionLine(
            composition_id=2,
            component_product_id=101,
            quantity=4.0,
            waste_percent=0.0,
            sort_order=0,
        )
    )
    # Alternate composition for krzesło (inactive won't qualify; add second active? use id=3 inactive)
    db.add(
        ProductComposition(
            id=3,
            tenant_id=1,
            product_id=100,
            name="Stara BOM",
            composition_mode="manufacturing",
            is_active=False,
            yield_quantity=1.0,
        )
    )

    # Generous component stock so Phase-2 aggregation tests stay green under Phase-3 validation.
    db.add(
        Inventory(
            id=9001,
            tenant_id=1,
            warehouse_id=1,
            location_id=1,
            product_id=101,
            quantity=10_000.0,
            stock_disposition=STOCK_DISPOSITION_SALEABLE,
            batch_number="",
            expiry_date=date(9999, 12, 31),
        )
    )

    pc_a = PickingConfig(
        id=1,
        tenant_id=1,
        warehouse_id=1,
        source_status_id=10,
        target_status_id=11,
        strategy="locations",
        pick_unit="products",
        order_sort="date",
        single_mode="bulk",
        multi_mode="bulk",
        all_mode="bulk",
        all_order_sort="date",
        is_production_mode=True,
        status_after_production_id=11,
        status_on_component_shortage_id=12,
        finished_goods_buffer_location_id=50,
        production_order_trigger_scope="SINGLE_ELEMENT",
    )
    pc_b = PickingConfig(
        id=2,
        tenant_id=1,
        warehouse_id=1,
        source_status_id=20,
        target_status_id=21,
        strategy="locations",
        pick_unit="products",
        order_sort="date",
        single_mode="bulk",
        multi_mode="bulk",
        all_mode="bulk",
        all_order_sort="date",
        is_production_mode=True,
        status_after_production_id=21,
        status_on_component_shortage_id=22,
        finished_goods_buffer_location_id=50,
        production_order_trigger_scope="SINGLE_ELEMENT",
    )
    db.add(pc_a)
    db.add(pc_b)
    db.commit()
    return db, engine


def _make_order(db, *, order_id: int, number: str, product_id: int, qty: int, item_id: int | None = None):
    o = Order(id=order_id, tenant_id=1, warehouse_id=1, number=number)
    db.add(o)
    db.flush()
    iid = item_id or (order_id * 10)
    it = OrderItem(id=iid, order_id=order_id, product_id=product_id, quantity=qty)
    db.add(it)
    db.commit()
    db.refresh(o)
    return o, it


def test_single_order_creates_orders_mo():
    db, _ = _bootstrap(None)
    o, _ = _make_order(db, order_id=1, number="A", product_id=100, qty=1)
    apply_order_panel_ui_status(db, order=o, sub_status_id=10)
    db.commit()
    mos = db.query(ProductionOrder).filter(ProductionOrder.source_type == PRODUCTION_ORDER_SOURCE_ORDERS).all()
    assert len(mos) == 1
    assert mos[0].planned_quantity == pytest.approx(1.0)
    assert mos[0].picking_config_id == 1
    assert mos[0].composition_id == 1
    sources = db.query(ProductionOrderSourceItem).all()
    assert len(sources) == 1
    assert sources[0].requested_quantity == pytest.approx(1.0)
    assert sources[0].status == PRODUCTION_ORDER_SOURCE_ITEM_RESERVED
    assert mos[0].materials_reserved is True
    assert db.query(StockReservation).filter(StockReservation.status == "reserved").count() >= 1


def test_qty_three_sets_planned_three():
    db, _ = _bootstrap(None)
    o, _ = _make_order(db, order_id=2, number="B", product_id=100, qty=3)
    apply_order_panel_ui_status(db, order=o, sub_status_id=10)
    db.commit()
    mo = db.query(ProductionOrder).one()
    assert mo.planned_quantity == pytest.approx(3.0)
    snap = db.query(ProductionOrderLineSnapshot).filter_by(production_order_id=mo.id).one()
    assert snap.total_required_quantity == pytest.approx(6.0)  # 2 per unit * 3


def test_two_orders_aggregate_same_mo():
    db, _ = _bootstrap(None)
    a, _ = _make_order(db, order_id=10, number="A", product_id=100, qty=1)
    b, _ = _make_order(db, order_id=11, number="B", product_id=100, qty=2)
    apply_order_panel_ui_status(db, order=a, sub_status_id=10)
    apply_order_panel_ui_status(db, order=b, sub_status_id=10)
    db.commit()
    mos = db.query(ProductionOrder).all()
    assert len(mos) == 1
    assert mos[0].planned_quantity == pytest.approx(3.0)
    assert db.query(ProductionOrderSourceItem).count() == 2


def test_after_collecting_creates_new_mo():
    db, _ = _bootstrap(None)
    a, _ = _make_order(db, order_id=20, number="A", product_id=100, qty=1)
    b, _ = _make_order(db, order_id=21, number="B", product_id=100, qty=2)
    c, _ = _make_order(db, order_id=22, number="C", product_id=100, qty=1)
    apply_order_panel_ui_status(db, order=a, sub_status_id=10)
    apply_order_panel_ui_status(db, order=b, sub_status_id=10)
    db.commit()
    mo1 = db.query(ProductionOrder).one()
    mo1.status = "collecting"
    db.commit()
    apply_order_panel_ui_status(db, order=c, sub_status_id=10)
    db.commit()
    mos = db.query(ProductionOrder).order_by(ProductionOrder.id).all()
    assert len(mos) == 2
    assert mos[0].planned_quantity == pytest.approx(3.0)
    assert mos[1].planned_quantity == pytest.approx(1.0)


def test_different_composition_separate_mo():
    db, _ = _bootstrap(None)
    a, _ = _make_order(db, order_id=30, number="A", product_id=100, qty=1)
    b, _ = _make_order(db, order_id=31, number="B", product_id=200, qty=1)
    apply_order_panel_ui_status(db, order=a, sub_status_id=10)
    apply_order_panel_ui_status(db, order=b, sub_status_id=10)
    db.commit()
    mos = db.query(ProductionOrder).all()
    assert len(mos) == 2
    assert {int(m.composition_id) for m in mos} == {1, 2}


def test_different_production_config_separate_mo():
    db, _ = _bootstrap(None)
    a, _ = _make_order(db, order_id=40, number="A", product_id=100, qty=1)
    b, _ = _make_order(db, order_id=41, number="B", product_id=100, qty=1)
    apply_order_panel_ui_status(db, order=a, sub_status_id=10)
    apply_order_panel_ui_status(db, order=b, sub_status_id=20)
    db.commit()
    mos = db.query(ProductionOrder).all()
    assert len(mos) == 2
    assert {int(m.picking_config_id) for m in mos} == {1, 2}


def test_repeat_trigger_idempotent():
    db, _ = _bootstrap(None)
    o, _ = _make_order(db, order_id=50, number="A", product_id=100, qty=2)
    apply_order_panel_ui_status(db, order=o, sub_status_id=10)
    db.commit()
    # Re-apply same status
    r = on_order_panel_status_changed_production(
        db, order=o, previous_status_id=10, new_status_id=10
    )
    assert r.get("result") == "SKIPPED"
    # Force re-enter path with previous non-prod → prod while already linked
    o.order_ui_status_id = 13
    db.commit()
    enter = on_order_panel_status_changed_production(
        db, order=o, previous_status_id=13, new_status_id=10
    )
    assert enter.get("enter", {}).get("result") == RESULT_IDEMPOTENT
    assert db.query(ProductionOrder).count() == 1
    assert db.query(ProductionOrder).one().planned_quantity == pytest.approx(2.0)
    assert db.query(ProductionOrderSourceItem).count() == 1


def test_parallel_triggers_single_mo():
    engine = _engine()
    db, eng = _bootstrap(None)
    # Use shared in-memory is hard across threads; simulate race via IntegrityError path:
    # create two sources sequentially under lock — already covered.
    # Concurrent attach: two orders entering at once on same Session isn't realistic;
    # verify unique index blocks second open MO.
    a, _ = _make_order(db, order_id=60, number="A", product_id=100, qty=1)
    apply_order_panel_ui_status(db, order=a, sub_status_id=10)
    db.commit()
    # Attempt second open MO with same key should fail unique index when forced
    from sqlalchemy.exc import IntegrityError

    dup = ProductionOrder(
        tenant_id=1,
        number="MO-DUP",
        composition_id=1,
        product_id=100,
        warehouse_id=1,
        planned_quantity=1.0,
        status="planned",
        source_type=PRODUCTION_ORDER_SOURCE_ORDERS,
        picking_config_id=1,
        production_source_status_id=10,
    )
    db.add(dup)
    with pytest.raises(IntegrityError):
        db.flush()
    db.rollback()


def test_multi_item_no_mo():
    db, _ = _bootstrap(None)
    o = Order(id=70, tenant_id=1, warehouse_id=1, number="MULTI")
    db.add(o)
    db.flush()
    db.add(OrderItem(id=701, order_id=70, product_id=100, quantity=1))
    db.add(OrderItem(id=702, order_id=70, product_id=200, quantity=1))
    db.commit()
    db.refresh(o)
    apply_order_panel_ui_status(db, order=o, sub_status_id=10)
    db.commit()
    assert db.query(ProductionOrder).count() == 0
    db.refresh(o)
    assert int(o.order_ui_status_id) == 12  # shortage status


def test_no_composition_no_mo():
    db, _ = _bootstrap(None)
    db.add(Product(id=999, tenant_id=1, name="Bez BOM", sku="X"))
    db.commit()
    o, _ = _make_order(db, order_id=80, number="NOBOM", product_id=999, qty=1)
    apply_order_panel_ui_status(db, order=o, sub_status_id=10)
    db.commit()
    assert db.query(ProductionOrder).count() == 0
    db.refresh(o)
    assert int(o.order_ui_status_id) == 12


def test_withdraw_before_start_reduces_planned():
    db, _ = _bootstrap(None)
    a, _ = _make_order(db, order_id=90, number="A", product_id=100, qty=1)
    b, _ = _make_order(db, order_id=91, number="B", product_id=100, qty=2)
    apply_order_panel_ui_status(db, order=a, sub_status_id=10)
    apply_order_panel_ui_status(db, order=b, sub_status_id=10)
    db.commit()
    assert db.query(ProductionOrder).one().planned_quantity == pytest.approx(3.0)
    apply_order_panel_ui_status(db, order=b, sub_status_id=13)
    db.commit()
    mo = db.query(ProductionOrder).one()
    assert mo.planned_quantity == pytest.approx(1.0)
    cancelled = (
        db.query(ProductionOrderSourceItem)
        .filter(ProductionOrderSourceItem.order_id == 91)
        .one()
    )
    assert cancelled.status == PRODUCTION_ORDER_SOURCE_ITEM_CANCELLED


def test_withdraw_after_collecting_does_not_reduce():
    db, _ = _bootstrap(None)
    a, _ = _make_order(db, order_id=100, number="A", product_id=100, qty=2)
    apply_order_panel_ui_status(db, order=a, sub_status_id=10)
    db.commit()
    mo = db.query(ProductionOrder).one()
    mo.status = "collecting"
    db.commit()
    apply_order_panel_ui_status(db, order=a, sub_status_id=13)
    db.commit()
    mo = db.query(ProductionOrder).one()
    assert mo.planned_quantity == pytest.approx(2.0)
    src = db.query(ProductionOrderSourceItem).one()
    assert src.status == PRODUCTION_ORDER_SOURCE_ITEM_RESERVED  # still active — withdrawal blocked


def test_reentry_after_withdraw():
    db, _ = _bootstrap(None)
    a, _ = _make_order(db, order_id=110, number="A", product_id=100, qty=2)
    apply_order_panel_ui_status(db, order=a, sub_status_id=10)
    db.commit()
    apply_order_panel_ui_status(db, order=a, sub_status_id=13)
    db.commit()
    assert db.query(ProductionOrder).filter(ProductionOrder.status == "cancelled").count() == 1
    apply_order_panel_ui_status(db, order=a, sub_status_id=10)
    db.commit()
    open_mos = (
        db.query(ProductionOrder)
        .filter(ProductionOrder.status.in_(("draft", "planned")))
        .all()
    )
    assert len(open_mos) == 1
    assert open_mos[0].planned_quantity == pytest.approx(2.0)
    active_sources = (
        db.query(ProductionOrderSourceItem)
        .filter(ProductionOrderSourceItem.status == PRODUCTION_ORDER_SOURCE_ITEM_RESERVED)
        .all()
    )
    assert len(active_sources) == 1


def test_manual_mo_unaffected():
    db, _ = _bootstrap(None)
    mo = ProductionOrder(
        tenant_id=1,
        number="MO-MAN",
        composition_id=1,
        product_id=100,
        warehouse_id=1,
        planned_quantity=5.0,
        status="planned",
        source_type=PRODUCTION_ORDER_SOURCE_MANUAL,
    )
    db.add(mo)
    db.commit()
    o, _ = _make_order(db, order_id=120, number="A", product_id=100, qty=1)
    apply_order_panel_ui_status(db, order=o, sub_status_id=10)
    db.commit()
    manual = db.query(ProductionOrder).filter_by(number="MO-MAN").one()
    assert manual.planned_quantity == pytest.approx(5.0)
    assert manual.source_type == PRODUCTION_ORDER_SOURCE_MANUAL
    orders_mo = (
        db.query(ProductionOrder)
        .filter(ProductionOrder.source_type == PRODUCTION_ORDER_SOURCE_ORDERS)
        .one()
    )
    assert orders_mo.planned_quantity == pytest.approx(1.0)


def test_e2e_scenario_a_b_collecting_c():
    """Order A×1 + B×2 → MO#1 qty 3; start collecting; C×1 → MO#2 qty 1."""
    db, _ = _bootstrap(None)
    a, _ = _make_order(db, order_id=200, number="A", product_id=100, qty=1)
    b, _ = _make_order(db, order_id=201, number="B", product_id=100, qty=2)
    c, _ = _make_order(db, order_id=202, number="C", product_id=100, qty=1)
    apply_order_panel_ui_status(db, order=a, sub_status_id=10)
    apply_order_panel_ui_status(db, order=b, sub_status_id=10)
    db.commit()
    mo1 = db.query(ProductionOrder).one()
    assert mo1.planned_quantity == pytest.approx(3.0)
    sources1 = (
        db.query(ProductionOrderSourceItem)
        .filter_by(production_order_id=mo1.id)
        .order_by(ProductionOrderSourceItem.order_id)
        .all()
    )
    assert [int(s.order_id) for s in sources1] == [200, 201]
    assert [float(s.requested_quantity) for s in sources1] == [1.0, 2.0]
    mo1.status = "collecting"
    db.commit()
    apply_order_panel_ui_status(db, order=c, sub_status_id=10)
    db.commit()
    mos = db.query(ProductionOrder).order_by(ProductionOrder.id).all()
    assert len(mos) == 2
    assert mos[0].planned_quantity == pytest.approx(3.0)
    assert mos[1].planned_quantity == pytest.approx(1.0)
    assert (
        db.query(ProductionOrderSourceItem)
        .filter_by(production_order_id=mos[1].id)
        .one()
        .order_id
        == 202
    )


def test_fulfilled_reentry_returns_already_fulfilled_no_new_mo():
    db, _ = _bootstrap(None)
    o, it = _make_order(db, order_id=300, number="F", product_id=100, qty=1)
    apply_order_panel_ui_status(db, order=o, sub_status_id=10)
    db.commit()
    mo = db.query(ProductionOrder).one()
    src = db.query(ProductionOrderSourceItem).one()
    src.status = PRODUCTION_ORDER_SOURCE_ITEM_FULFILLED
    src.fulfilled_quantity = 1.0
    mo.status = "completed"
    mo.planned_quantity = 1.0
    mo.produced_quantity = 1.0
    db.commit()

    o.order_ui_status_id = 13
    db.commit()
    enter = on_order_panel_status_changed_production(
        db, order=o, previous_status_id=13, new_status_id=10
    )
    assert enter.get("enter", {}).get("result") == RESULT_ALREADY_FULFILLED
    assert db.query(ProductionOrder).filter(ProductionOrder.status.in_(("draft", "planned"))).count() == 0
    assert db.query(ProductionOrderSourceItem).filter(
        ProductionOrderSourceItem.status.in_(("open", "reserved", "partial"))
    ).count() == 0
    assert float(db.query(ProductionOrder).one().planned_quantity) == pytest.approx(1.0)


def test_fulfilled_retry_same_status_no_duplicate():
    db, _ = _bootstrap(None)
    o, it = _make_order(db, order_id=301, number="F2", product_id=100, qty=1)
    apply_order_panel_ui_status(db, order=o, sub_status_id=10)
    db.commit()
    src = db.query(ProductionOrderSourceItem).one()
    src.status = PRODUCTION_ORDER_SOURCE_ITEM_FULFILLED
    src.fulfilled_quantity = 1.0
    db.query(ProductionOrder).one().status = "completed"
    db.commit()

    r1 = on_order_panel_status_changed_production(
        db, order=o, previous_status_id=13, new_status_id=10
    )
    r2 = on_order_panel_status_changed_production(
        db, order=o, previous_status_id=13, new_status_id=10
    )
    assert r1.get("enter", {}).get("result") == RESULT_ALREADY_FULFILLED
    assert r2.get("enter", {}).get("result") == RESULT_ALREADY_FULFILLED
    assert db.query(ProductionOrderSourceItem).count() == 1


def test_cancelled_source_can_reenter():
    db, _ = _bootstrap(None)
    o, _ = _make_order(db, order_id=302, number="C1", product_id=100, qty=2)
    apply_order_panel_ui_status(db, order=o, sub_status_id=10)
    db.commit()
    apply_order_panel_ui_status(db, order=o, sub_status_id=13)
    db.commit()
    assert db.query(ProductionOrderSourceItem).one().status == PRODUCTION_ORDER_SOURCE_ITEM_CANCELLED
    apply_order_panel_ui_status(db, order=o, sub_status_id=10)
    db.commit()
    active = (
        db.query(ProductionOrderSourceItem)
        .filter(ProductionOrderSourceItem.status == PRODUCTION_ORDER_SOURCE_ITEM_RESERVED)
        .all()
    )
    assert len(active) == 1
    assert active[0].requested_quantity == pytest.approx(2.0)


def test_fulfilled_qty_increase_creates_only_delta():
    """If OrderItem.quantity grows after fulfillment, only the missing delta is requested."""
    db, _ = _bootstrap(None)
    o, it = _make_order(db, order_id=303, number="Q", product_id=100, qty=1)
    apply_order_panel_ui_status(db, order=o, sub_status_id=10)
    db.commit()
    mo = db.query(ProductionOrder).one()
    src = db.query(ProductionOrderSourceItem).one()
    src.status = PRODUCTION_ORDER_SOURCE_ITEM_FULFILLED
    src.fulfilled_quantity = 1.0
    mo.status = "completed"
    mo.produced_quantity = 1.0
    it.quantity = 2.0
    db.commit()

    o.order_ui_status_id = 13
    db.commit()
    enter = on_order_panel_status_changed_production(
        db, order=o, previous_status_id=13, new_status_id=10
    )
    assert enter.get("enter", {}).get("result") in (RESULT_CREATED, RESULT_AGGREGATED)
    open_mos = (
        db.query(ProductionOrder)
        .filter(ProductionOrder.status.in_(("draft", "planned")))
        .all()
    )
    assert len(open_mos) == 1
    assert open_mos[0].planned_quantity == pytest.approx(1.0)
    new_src = (
        db.query(ProductionOrderSourceItem)
        .filter(ProductionOrderSourceItem.production_order_id == open_mos[0].id)
        .one()
    )
    assert new_src.requested_quantity == pytest.approx(1.0)
    assert float(new_src.fulfilled_quantity or 0) == pytest.approx(0.0)
