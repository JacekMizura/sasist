"""
Phase 3 — material validation + reservations for order-driven MOs.

  python -m pytest backend/tests/test_production_order_material_validation.py -q
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

import pytest
from sqlalchemy import create_engine, event, text
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
from backend.services.production_order_trigger import retry_order_driven_production_shortages
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


def _bootstrap(
    *,
    backrest_qty: float = 7.0,
    leg_qty: float = 28.0,
    waste_percent: float = 0.0,
    yield_quantity: float = 1.0,
    legs_per_chair: float = 4.0,
    wh2_stock: bool = False,
):
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

    with engine.begin() as conn:
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
    db.add(Warehouse(id=1, tenant_id=1, name="WH1", requires_putaway=False))
    db.add(Warehouse(id=2, tenant_id=1, name="WH2", requires_putaway=False))
    for lid, wid, name in ((1, 1, "PICK-1"), (2, 2, "PICK-2"), (50, 1, "BUF")):
        db.add(
            Location(
                id=lid,
                warehouse_id=wid,
                name=name,
                type="pick",
                location_type="NORMAL",
                is_active=True,
            )
        )
    for sid, name in (
        (10, "Produkcja A"),
        (11, "Po produkcji"),
        (12, "Problem produkcji"),
        (13, "Inny"),
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
    db.add(Product(id=201, tenant_id=1, name="Oparcie", sku="OPA"))
    db.add(Product(id=202, tenant_id=1, name="Noga", sku="NOG"))
    db.add(
        ProductComposition(
            id=1,
            tenant_id=1,
            product_id=100,
            name="Krzesło BOM",
            composition_mode="manufacturing",
            is_active=True,
            yield_quantity=float(yield_quantity),
        )
    )
    db.flush()
    db.add(
        ProductCompositionLine(
            composition_id=1,
            component_product_id=201,
            quantity=1.0,
            waste_percent=float(waste_percent),
            sort_order=0,
        )
    )
    db.add(
        ProductCompositionLine(
            composition_id=1,
            component_product_id=202,
            quantity=float(legs_per_chair),
            waste_percent=float(waste_percent),
            sort_order=1,
        )
    )
    inv_id = 1
    if backrest_qty > 0:
        db.add(
            Inventory(
                id=inv_id,
                tenant_id=1,
                warehouse_id=1,
                location_id=1,
                product_id=201,
                quantity=float(backrest_qty),
                stock_disposition=STOCK_DISPOSITION_SALEABLE,
                batch_number="",
                expiry_date=date(9999, 12, 31),
            )
        )
        inv_id += 1
    if leg_qty > 0:
        db.add(
            Inventory(
                id=inv_id,
                tenant_id=1,
                warehouse_id=1,
                location_id=1,
                product_id=202,
                quantity=float(leg_qty),
                stock_disposition=STOCK_DISPOSITION_SALEABLE,
                batch_number="",
                expiry_date=date(9999, 12, 31),
            )
        )
        inv_id += 1
    if wh2_stock:
        db.add(
            Inventory(
                id=inv_id,
                tenant_id=1,
                warehouse_id=2,
                location_id=2,
                product_id=201,
                quantity=100.0,
                stock_disposition=STOCK_DISPOSITION_SALEABLE,
                batch_number="",
                expiry_date=date(9999, 12, 31),
            )
        )
        inv_id += 1
        db.add(
            Inventory(
                id=inv_id,
                tenant_id=1,
                warehouse_id=2,
                location_id=2,
                product_id=202,
                quantity=100.0,
                stock_disposition=STOCK_DISPOSITION_SALEABLE,
                batch_number="",
                expiry_date=date(9999, 12, 31),
            )
        )

    db.add(
        PickingConfig(
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
    )
    db.commit()
    return db


def _make_order(
    db,
    *,
    order_id: int,
    number: str,
    qty: float = 1.0,
    priority_color: str | None = None,
    created_at: datetime | None = None,
    warehouse_id: int = 1,
):
    o = Order(
        id=order_id,
        tenant_id=1,
        warehouse_id=warehouse_id,
        number=number,
        priority_color=priority_color,
        created_at=created_at or datetime.utcnow(),
    )
    db.add(o)
    db.flush()
    it = OrderItem(id=order_id * 10, order_id=order_id, product_id=100, quantity=float(qty))
    db.add(it)
    db.commit()
    db.refresh(o)
    return o, it


def _reserved_qty(db, product_id: int) -> float:
    rows = (
        db.query(StockReservation)
        .filter(
            StockReservation.product_id == int(product_id),
            StockReservation.status == "reserved",
        )
        .all()
    )
    return sum(float(r.quantity or 0) for r in rows)


def test_full_material_cover_all_reserved():
    db = _bootstrap(backrest_qty=10, leg_qty=40)
    for i in range(1, 4):
        o, _ = _make_order(db, order_id=i, number=f"O{i}", qty=1)
        apply_order_panel_ui_status(db, order=o, sub_status_id=10)
    db.commit()
    mo = db.query(ProductionOrder).filter_by(source_type=PRODUCTION_ORDER_SOURCE_ORDERS).one()
    assert mo.planned_quantity == pytest.approx(3.0)
    sources = db.query(ProductionOrderSourceItem).all()
    assert len(sources) == 3
    assert all(s.status == PRODUCTION_ORDER_SOURCE_ITEM_RESERVED for s in sources)
    assert _reserved_qty(db, 201) == pytest.approx(3.0)
    assert _reserved_qty(db, 202) == pytest.approx(12.0)


def test_partial_7_of_10_acceptance():
    db = _bootstrap(backrest_qty=7, leg_qty=28)
    base = datetime(2026, 1, 1, 10, 0, 0)
    for i in range(1, 11):
        o, _ = _make_order(
            db,
            order_id=i,
            number=f"O{i}",
            qty=1,
            created_at=base + timedelta(minutes=i),
        )
        apply_order_panel_ui_status(db, order=o, sub_status_id=10)
    db.commit()

    mos = (
        db.query(ProductionOrder)
        .filter(
            ProductionOrder.source_type == PRODUCTION_ORDER_SOURCE_ORDERS,
            ProductionOrder.status.in_(("draft", "planned")),
        )
        .all()
    )
    assert len(mos) == 1
    mo = mos[0]
    assert mo.planned_quantity == pytest.approx(7.0)
    reserved = (
        db.query(ProductionOrderSourceItem)
        .filter(ProductionOrderSourceItem.status == PRODUCTION_ORDER_SOURCE_ITEM_RESERVED)
        .all()
    )
    shortage = (
        db.query(ProductionOrderSourceItem)
        .filter(ProductionOrderSourceItem.status == PRODUCTION_ORDER_SOURCE_ITEM_SHORTAGE)
        .all()
    )
    assert len(reserved) == 7
    assert len(shortage) == 3
    for s in shortage:
        order = db.query(Order).filter(Order.id == s.order_id).one()
        assert int(order.order_ui_status_id) == 12
    assert _reserved_qty(db, 201) == pytest.approx(7.0)
    assert _reserved_qty(db, 202) == pytest.approx(28.0)


def test_priority_order_wins_over_older():
    db = _bootstrap(backrest_qty=1, leg_qty=4)
    older, _ = _make_order(
        db,
        order_id=1,
        number="OLD",
        qty=1,
        priority_color="gray",
        created_at=datetime(2026, 1, 1),
    )
    apply_order_panel_ui_status(db, order=older, sub_status_id=10)
    newer_prio, _ = _make_order(
        db,
        order_id=2,
        number="PRIO",
        qty=1,
        priority_color="red",
        created_at=datetime(2026, 1, 2),
    )
    apply_order_panel_ui_status(db, order=newer_prio, sub_status_id=10)
    db.commit()

    by_order = {
        int(s.order_id): s
        for s in db.query(ProductionOrderSourceItem).all()
    }
    assert by_order[2].status == PRODUCTION_ORDER_SOURCE_ITEM_RESERVED
    assert by_order[1].status == PRODUCTION_ORDER_SOURCE_ITEM_SHORTAGE
    assert db.query(Order).get(1).order_ui_status_id == 12
    assert db.query(Order).get(2).order_ui_status_id == 10


def test_zero_stock_all_shortage():
    db = _bootstrap(backrest_qty=0, leg_qty=0)
    o, _ = _make_order(db, order_id=1, number="A", qty=1)
    out = apply_order_panel_ui_status(db, order=o, sub_status_id=10)
    db.commit()
    assert int(o.order_ui_status_id) == 12
    sources = db.query(ProductionOrderSourceItem).all()
    assert len(sources) == 1
    assert sources[0].status == PRODUCTION_ORDER_SOURCE_ITEM_SHORTAGE
    open_mos = (
        db.query(ProductionOrder)
        .filter(ProductionOrder.status.in_(("draft", "planned")))
        .count()
    )
    assert open_mos == 0


def test_two_mos_do_not_double_reserve_same_stock():
    db = _bootstrap(backrest_qty=6, leg_qty=24)
    a, _ = _make_order(db, order_id=1, number="A", qty=4)
    apply_order_panel_ui_status(db, order=a, sub_status_id=10)
    db.commit()
    mo1 = db.query(ProductionOrder).one()
    assert mo1.planned_quantity == pytest.approx(4.0)
    assert _reserved_qty(db, 201) == pytest.approx(4.0)

    mo1.status = "collecting"
    mo1.reservations_locked_at = datetime.utcnow()
    db.commit()

    b, _ = _make_order(db, order_id=2, number="B", qty=2)
    apply_order_panel_ui_status(db, order=b, sub_status_id=10)
    db.commit()

    mo2 = (
        db.query(ProductionOrder)
        .filter(ProductionOrder.id != mo1.id)
        .order_by(ProductionOrder.id.desc())
        .first()
    )
    assert mo2 is not None
    assert float(mo2.planned_quantity or 0) == pytest.approx(2.0)
    assert _reserved_qty(db, 201) == pytest.approx(6.0)
    assert _reserved_qty(db, 202) == pytest.approx(24.0)


def test_withdraw_before_start_releases_reservation():
    db = _bootstrap(backrest_qty=5, leg_qty=20)
    o, _ = _make_order(db, order_id=1, number="A", qty=2)
    apply_order_panel_ui_status(db, order=o, sub_status_id=10)
    db.commit()
    assert _reserved_qty(db, 201) == pytest.approx(2.0)
    apply_order_panel_ui_status(db, order=o, sub_status_id=13)
    db.commit()
    assert _reserved_qty(db, 201) == pytest.approx(0.0)
    assert db.query(ProductionOrder).filter(ProductionOrder.status == "cancelled").count() == 1


def test_retry_after_restock_restores_shortage():
    db = _bootstrap(backrest_qty=1, leg_qty=4)
    o1, _ = _make_order(db, order_id=1, number="A", qty=1, created_at=datetime(2026, 1, 1))
    o2, _ = _make_order(db, order_id=2, number="B", qty=1, created_at=datetime(2026, 1, 2))
    apply_order_panel_ui_status(db, order=o1, sub_status_id=10)
    apply_order_panel_ui_status(db, order=o2, sub_status_id=10)
    db.commit()
    assert db.query(Order).get(2).order_ui_status_id == 12

    # Restock enough for the second chair
    db.add(
        Inventory(
            id=50,
            tenant_id=1,
            warehouse_id=1,
            location_id=1,
            product_id=201,
            quantity=1.0,
            stock_disposition=STOCK_DISPOSITION_SALEABLE,
            batch_number="",
            expiry_date=date(9999, 12, 31),
        )
    )
    db.add(
        Inventory(
            id=51,
            tenant_id=1,
            warehouse_id=1,
            location_id=1,
            product_id=202,
            quantity=4.0,
            stock_disposition=STOCK_DISPOSITION_SALEABLE,
            batch_number="",
            expiry_date=date(9999, 12, 31),
        )
    )
    db.commit()

    out = retry_order_driven_production_shortages(db, tenant_id=1, warehouse_id=1)
    db.commit()
    assert out["restored"] >= 1
    assert db.query(Order).get(2).order_ui_status_id == 10
    active = (
        db.query(ProductionOrderSourceItem)
        .filter(
            ProductionOrderSourceItem.order_id == 2,
            ProductionOrderSourceItem.status == PRODUCTION_ORDER_SOURCE_ITEM_RESERVED,
        )
        .count()
    )
    assert active == 1


def test_waste_and_yield_affect_max_producible():
    # 1 backrest, 4 legs per chair with 0 waste/yield=1 → max 1 with stock 1/4
    # With waste 100% on lines: per unit doubles → stock 2/8 needed for 1 chair
    db = _bootstrap(backrest_qty=1, leg_qty=4, waste_percent=100.0, yield_quantity=1.0)
    o, _ = _make_order(db, order_id=1, number="A", qty=1)
    apply_order_panel_ui_status(db, order=o, sub_status_id=10)
    db.commit()
    assert db.query(Order).get(1).order_ui_status_id == 12

    db2 = _bootstrap(backrest_qty=2, leg_qty=8, waste_percent=100.0, yield_quantity=1.0)
    o2, _ = _make_order(db2, order_id=1, number="A", qty=1)
    apply_order_panel_ui_status(db2, order=o2, sub_status_id=10)
    db2.commit()
    mo = db2.query(ProductionOrder).filter(ProductionOrder.status.in_(("draft", "planned"))).one()
    assert mo.planned_quantity == pytest.approx(1.0)
    assert _reserved_qty(db2, 201) == pytest.approx(2.0)
    assert _reserved_qty(db2, 202) == pytest.approx(8.0)


def test_other_warehouse_stock_ignored():
    db = _bootstrap(backrest_qty=0, leg_qty=0, wh2_stock=True)
    o, _ = _make_order(db, order_id=1, number="A", qty=1, warehouse_id=1)
    apply_order_panel_ui_status(db, order=o, sub_status_id=10)
    db.commit()
    assert db.query(Order).get(1).order_ui_status_id == 12


def test_manual_mo_unaffected():
    db = _bootstrap(backrest_qty=10, leg_qty=40)
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
    o, _ = _make_order(db, order_id=1, number="A", qty=1)
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


def test_start_collecting_locks_existing_reservations():
    from backend.services.reservations.reservation_service import lock_production_reservations

    db = _bootstrap(backrest_qty=5, leg_qty=20)
    o, _ = _make_order(db, order_id=1, number="A", qty=1)
    apply_order_panel_ui_status(db, order=o, sub_status_id=10)
    db.commit()
    mo = db.query(ProductionOrder).one()
    assert mo.materials_reserved is True
    lock_production_reservations(db, tenant_id=1, production_order_id=int(mo.id))
    mo.status = "collecting"
    db.commit()
    db.refresh(mo)
    assert mo.reservations_locked_at is not None
    rows = (
        db.query(StockReservation)
        .filter(
            StockReservation.production_order_id == mo.id,
            StockReservation.status == "reserved",
        )
        .all()
    )
    assert rows
    assert all(r.locked_at is not None for r in rows)
