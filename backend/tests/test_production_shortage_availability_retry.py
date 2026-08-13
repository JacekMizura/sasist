"""
Phase 8 — automatic ORDERS shortage retry on component availability increase.

  python -m pytest backend/tests/test_production_shortage_availability_retry.py -q
"""

from __future__ import annotations

from datetime import date, datetime

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
    PRODUCTION_ORDER_SOURCE_ITEM_FULFILLED,
    PRODUCTION_ORDER_SOURCE_ITEM_RESERVED,
    PRODUCTION_ORDER_SOURCE_ITEM_SHORTAGE,
    PRODUCTION_ORDER_SOURCE_MANUAL,
    PRODUCTION_ORDER_SOURCE_ORDERS,
    PRODUCTION_ORDER_SOURCE_PLANNING,
    ProductionOrder,
    ProductionOrderLineSnapshot,
    ProductionOrderSourceItem,
)
from backend.models.stock_reservation import StockReservation
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.services.order_panel_ui_status_service import apply_order_panel_ui_status
from backend.services.production_order_trigger import (
    on_component_availability_increased,
    retry_order_driven_production_shortages,
)
from backend.services.production_order_trigger.availability_retry_service import (
    notify_component_availability_increased,
)
from backend.services.reservations.lifecycle_service import release_reservation
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
def _patch_side_effects(monkeypatch):
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


def _bootstrap(*, backrest_qty: float = 0.0, leg_qty: float = 0.0, dual_hall: bool = False):
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
    db.add(Tenant(id=2, name="T2", default_warehouse_id=3))
    db.add(Warehouse(id=1, tenant_id=1, name="WH1", requires_putaway=False))
    db.add(Warehouse(id=2, tenant_id=1, name="WH2", requires_putaway=False))
    db.add(Warehouse(id=3, tenant_id=2, name="WH3", requires_putaway=False))
    for lid, wid, name in ((1, 1, "PICK-1"), (2, 2, "PICK-2"), (3, 3, "PICK-3"), (50, 1, "BUF")):
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
    for sid, name, wid in (
        (10, "Produkcja Hala A", 1),
        (11, "Po produkcji A", 1),
        (12, "Brak komponentów A", 1),
        (13, "Inny", 1),
        (20, "Produkcja Hala B", 1),
        (21, "Po produkcji B", 1),
        (22, "Brak komponentów B", 1),
    ):
        db.add(
            OrderUiStatus(
                id=sid,
                tenant_id=1,
                warehouse_id=wid,
                name=name,
                color="#000",
                main_group="NEW",
            )
        )
    db.add(Product(id=100, tenant_id=1, name="Krzesło", sku="KRZ"))
    db.add(Product(id=201, tenant_id=1, name="Oparcie", sku="OPA"))
    db.add(Product(id=202, tenant_id=1, name="Noga", sku="NOG"))
    db.add(Product(id=999, tenant_id=1, name="Inny komponent", sku="INN"))
    db.add(
        ProductComposition(
            id=1,
            tenant_id=1,
            product_id=100,
            name="Krzesło BOM",
            composition_mode="manufacturing",
            is_active=True,
            yield_quantity=1.0,
        )
    )
    db.flush()
    db.add(
        ProductCompositionLine(
            composition_id=1, component_product_id=201, quantity=1.0, waste_percent=0.0, sort_order=0
        )
    )
    db.add(
        ProductCompositionLine(
            composition_id=1, component_product_id=202, quantity=4.0, waste_percent=0.0, sort_order=1
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
    if dual_hall:
        db.add(
            PickingConfig(
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
        )
    inv_id = 1
    for pid, qty in ((201, backrest_qty), (202, leg_qty)):
        if qty > 0:
            db.add(
                Inventory(
                    id=inv_id,
                    tenant_id=1,
                    warehouse_id=1,
                    location_id=1,
                    product_id=pid,
                    quantity=float(qty),
                    stock_disposition=STOCK_DISPOSITION_SALEABLE,
                    batch_number="",
                    expiry_date=date(9999, 12, 31),
                )
            )
            inv_id += 1
    db.commit()
    return db


def _make_order(db, *, order_id: int, number: str, qty: float = 1.0, priority_color: str | None = None):
    o = Order(
        id=order_id,
        tenant_id=1,
        warehouse_id=1,
        number=number,
        priority_color=priority_color,
        order_date=datetime(2026, 1, 1) + __import__("datetime").timedelta(days=order_id),
    )
    db.add(o)
    db.flush()
    it = OrderItem(id=order_id * 10, order_id=order_id, product_id=100, quantity=float(qty))
    db.add(it)
    db.commit()
    db.refresh(o)
    return o, it


def _add_stock(db, *, product_id: int, qty: float, warehouse_id: int = 1, location_id: int = 1, inv_id: int = 900):
    row = (
        db.query(Inventory)
        .filter(
            Inventory.tenant_id == 1,
            Inventory.warehouse_id == warehouse_id,
            Inventory.product_id == product_id,
            Inventory.location_id == location_id,
        )
        .first()
    )
    if row:
        row.quantity = float(row.quantity or 0) + float(qty)
        db.add(row)
    else:
        db.add(
            Inventory(
                id=inv_id,
                tenant_id=1,
                warehouse_id=warehouse_id,
                location_id=location_id,
                product_id=product_id,
                quantity=float(qty),
                stock_disposition=STOCK_DISPOSITION_SALEABLE,
                batch_number="",
                expiry_date=date(9999, 12, 31),
            )
        )
    db.commit()


def test_shortage_auto_resume_after_component_stock():
    db = _bootstrap(backrest_qty=0, leg_qty=0)
    o, _ = _make_order(db, order_id=1, number="A")
    apply_order_panel_ui_status(db, order=o, sub_status_id=10)
    db.commit()
    assert db.query(Order).get(1).order_ui_status_id == 12
    assert db.query(ProductionOrderSourceItem).one().status == PRODUCTION_ORDER_SOURCE_ITEM_SHORTAGE

    _add_stock(db, product_id=201, qty=1, inv_id=501)
    _add_stock(db, product_id=202, qty=4, inv_id=502)
    out = on_component_availability_increased(
        db, tenant_id=1, warehouse_id=1, component_product_ids=[202], reason="test_stock"
    )
    db.commit()
    assert out["restored"] >= 1
    assert db.query(Order).get(1).order_ui_status_id == 10
    assert (
        db.query(ProductionOrderSourceItem)
        .filter(ProductionOrderSourceItem.status == PRODUCTION_ORDER_SOURCE_ITEM_RESERVED)
        .count()
        >= 1
    )


def test_unrelated_component_does_not_resume():
    db = _bootstrap(backrest_qty=0, leg_qty=0)
    o, _ = _make_order(db, order_id=1, number="A")
    apply_order_panel_ui_status(db, order=o, sub_status_id=10)
    db.commit()
    _add_stock(db, product_id=999, qty=100, inv_id=510)
    out = on_component_availability_increased(
        db, tenant_id=1, warehouse_id=1, component_product_ids=[999], reason="other_component"
    )
    assert out["processed"] == 0
    assert db.query(Order).get(1).order_ui_status_id == 12


def test_other_warehouse_ignored():
    db = _bootstrap(backrest_qty=0, leg_qty=0)
    o, _ = _make_order(db, order_id=1, number="A")
    apply_order_panel_ui_status(db, order=o, sub_status_id=10)
    db.commit()
    _add_stock(db, product_id=201, qty=1, warehouse_id=2, location_id=2, inv_id=520)
    _add_stock(db, product_id=202, qty=4, warehouse_id=2, location_id=2, inv_id=521)
    out = on_component_availability_increased(
        db, tenant_id=1, warehouse_id=2, component_product_ids=[201, 202], reason="wh2"
    )
    # Candidates filtered by warehouse on MO — WH1 shortage not in WH2 scan
    assert out["restored"] == 0
    assert db.query(Order).get(1).order_ui_status_id == 12


def test_partial_10_shortage_material_for_3():
    db = _bootstrap(backrest_qty=0, leg_qty=0)
    orders = []
    for i in range(1, 11):
        o, _ = _make_order(db, order_id=i, number=f"O{i}")
        apply_order_panel_ui_status(db, order=o, sub_status_id=10)
        orders.append(o)
    db.commit()
    assert all(db.query(Order).get(i).order_ui_status_id == 12 for i in range(1, 11))

    # Material for exactly 3 chairs
    _add_stock(db, product_id=201, qty=3, inv_id=530)
    _add_stock(db, product_id=202, qty=12, inv_id=531)
    out = on_component_availability_increased(
        db, tenant_id=1, warehouse_id=1, component_product_ids=[201, 202], reason="partial"
    )
    db.commit()
    restored_orders = [r for r in out["items"] if r.get("result") == "RESTORED"]
    assert len(restored_orders) == 3
    still = sum(1 for i in range(1, 11) if db.query(Order).get(i).order_ui_status_id == 12)
    assert still == 7


def test_priority_wins_partial():
    db = _bootstrap(backrest_qty=0, leg_qty=0)
    low, _ = _make_order(db, order_id=1, number="LOW", priority_color="green")
    high, _ = _make_order(db, order_id=2, number="HIGH", priority_color="red")
    apply_order_panel_ui_status(db, order=low, sub_status_id=10)
    apply_order_panel_ui_status(db, order=high, sub_status_id=10)
    db.commit()
    _add_stock(db, product_id=201, qty=1, inv_id=540)
    _add_stock(db, product_id=202, qty=4, inv_id=541)
    out = on_component_availability_increased(
        db, tenant_id=1, warehouse_id=1, component_product_ids=[202], reason="prio"
    )
    db.commit()
    assert out["restored"] == 1
    assert db.query(Order).get(2).order_ui_status_id == 10  # HIGH
    assert db.query(Order).get(1).order_ui_status_id == 12  # LOW remains shortage


def test_hall_a_and_hall_b_return_to_own_status():
    db = _bootstrap(backrest_qty=0, leg_qty=0, dual_hall=True)
    a, _ = _make_order(db, order_id=1, number="A")
    b, _ = _make_order(db, order_id=2, number="B")
    apply_order_panel_ui_status(db, order=a, sub_status_id=10)
    apply_order_panel_ui_status(db, order=b, sub_status_id=20)
    db.commit()
    assert db.query(Order).get(1).order_ui_status_id == 12
    assert db.query(Order).get(2).order_ui_status_id == 22

    _add_stock(db, product_id=201, qty=2, inv_id=550)
    _add_stock(db, product_id=202, qty=8, inv_id=551)
    out = on_component_availability_increased(
        db, tenant_id=1, warehouse_id=1, component_product_ids=[201, 202], reason="halls"
    )
    db.commit()
    assert out["restored"] == 2
    assert db.query(Order).get(1).order_ui_status_id == 10
    assert db.query(Order).get(2).order_ui_status_id == 20
    by_order = {r["order_id"]: r for r in out["items"] if r.get("result") == "RESTORED"}
    assert by_order[1]["target_status_id"] == 10
    assert by_order[2]["target_status_id"] == 20


def test_idempotent_double_event():
    db = _bootstrap(backrest_qty=0, leg_qty=0)
    o, _ = _make_order(db, order_id=1, number="A")
    apply_order_panel_ui_status(db, order=o, sub_status_id=10)
    db.commit()
    _add_stock(db, product_id=201, qty=1, inv_id=560)
    _add_stock(db, product_id=202, qty=4, inv_id=561)
    r1 = on_component_availability_increased(
        db, tenant_id=1, warehouse_id=1, component_product_ids=[202], reason="e1"
    )
    db.commit()
    r2 = on_component_availability_increased(
        db, tenant_id=1, warehouse_id=1, component_product_ids=[202], reason="e2"
    )
    db.commit()
    assert r1["restored"] >= 1
    assert r2["restored"] == 0
    assert db.query(ProductionOrder).filter(ProductionOrder.status.in_(("draft", "planned"))).count() == 1


def test_fulfilled_not_retried():
    db = _bootstrap(backrest_qty=10, leg_qty=40)
    o, it = _make_order(db, order_id=1, number="A")
    apply_order_panel_ui_status(db, order=o, sub_status_id=10)
    db.commit()
    src = db.query(ProductionOrderSourceItem).one()
    src.status = PRODUCTION_ORDER_SOURCE_ITEM_FULFILLED
    src.fulfilled_quantity = 1.0
    mo = db.query(ProductionOrder).one()
    mo.status = "completed"
    o.order_ui_status_id = 12  # simulate stuck badge — still must not re-create demand
    db.commit()
    out = on_component_availability_increased(
        db, tenant_id=1, warehouse_id=1, component_product_ids=[202], reason="ful"
    )
    assert out["restored"] == 0
    assert (
        db.query(ProductionOrderSourceItem)
        .filter(ProductionOrderSourceItem.status.in_(("open", "reserved", "partial")))
        .count()
        == 0
    )


def test_manual_retry_shares_core_with_auto():
    db = _bootstrap(backrest_qty=0, leg_qty=0)
    o, _ = _make_order(db, order_id=1, number="A")
    apply_order_panel_ui_status(db, order=o, sub_status_id=10)
    db.commit()
    _add_stock(db, product_id=201, qty=1, inv_id=570)
    _add_stock(db, product_id=202, qty=4, inv_id=571)
    manual = retry_order_driven_production_shortages(
        db, tenant_id=1, warehouse_id=1, component_product_ids=[202]
    )
    db.commit()
    assert manual["restored"] >= 1


def test_reservation_release_notifies_and_resumes():
    """Cancel MO A (release reservations) → Order B shortage auto-resumes."""
    from backend.services.production_order_service import cancel_production_order

    db = _bootstrap(backrest_qty=1, leg_qty=4)
    a, _ = _make_order(db, order_id=1, number="A")
    apply_order_panel_ui_status(db, order=a, sub_status_id=10)
    db.commit()
    assert db.query(Order).get(1).order_ui_status_id == 10
    mo_a = db.query(ProductionOrder).filter(ProductionOrder.status.in_(("draft", "planned"))).one()

    b, _ = _make_order(db, order_id=2, number="B")
    apply_order_panel_ui_status(db, order=b, sub_status_id=10)
    db.commit()
    assert db.query(Order).get(2).order_ui_status_id == 12

    # Free materials by cancelling A’s MO (releases reservations → availability event).
    cancel_production_order(db, tenant_id=1, order_id=int(mo_a.id))
    db.commit()
    assert db.query(Order).get(2).order_ui_status_id == 10


def test_still_shortage_when_stock_insufficient():
    db = _bootstrap(backrest_qty=0, leg_qty=0)
    o, _ = _make_order(db, order_id=1, number="A")
    apply_order_panel_ui_status(db, order=o, sub_status_id=10)
    db.commit()
    _add_stock(db, product_id=201, qty=1, inv_id=580)
    # legs still 0
    out = on_component_availability_increased(
        db, tenant_id=1, warehouse_id=1, component_product_ids=[201], reason="partial_comp"
    )
    db.commit()
    assert out["restored"] == 0
    assert db.query(Order).get(1).order_ui_status_id == 12


def test_manual_and_planning_mo_unaffected():
    db = _bootstrap(backrest_qty=0, leg_qty=0)
    db.add(
        ProductionOrder(
            tenant_id=1,
            number="MO-MAN",
            composition_id=1,
            product_id=100,
            warehouse_id=1,
            planned_quantity=5.0,
            status="planned",
            source_type=PRODUCTION_ORDER_SOURCE_MANUAL,
        )
    )
    db.add(
        ProductionOrder(
            tenant_id=1,
            number="MO-PLAN",
            composition_id=1,
            product_id=100,
            warehouse_id=1,
            planned_quantity=3.0,
            status="planned",
            source_type=PRODUCTION_ORDER_SOURCE_PLANNING,
        )
    )
    db.commit()
    o, _ = _make_order(db, order_id=1, number="A")
    apply_order_panel_ui_status(db, order=o, sub_status_id=10)
    db.commit()
    _add_stock(db, product_id=201, qty=1, inv_id=590)
    _add_stock(db, product_id=202, qty=4, inv_id=591)
    on_component_availability_increased(
        db, tenant_id=1, warehouse_id=1, component_product_ids=[202], reason="reg"
    )
    db.commit()
    assert db.query(ProductionOrder).filter_by(number="MO-MAN").one().planned_quantity == pytest.approx(5.0)
    assert db.query(ProductionOrder).filter_by(number="MO-PLAN").one().planned_quantity == pytest.approx(3.0)


def test_notify_wrapper_skips_refresh_reason():
    db = _bootstrap(backrest_qty=0, leg_qty=0)
    o, _ = _make_order(db, order_id=1, number="A")
    apply_order_panel_ui_status(db, order=o, sub_status_id=10)
    db.commit()
    _add_stock(db, product_id=201, qty=1, inv_id=600)
    _add_stock(db, product_id=202, qty=4, inv_id=601)
    out = notify_component_availability_increased(
        db,
        tenant_id=1,
        warehouse_id=1,
        component_product_ids=[202],
        reason="orders_mo_material_refresh",
    )
    assert out is None
    assert db.query(Order).get(1).order_ui_status_id == 12
