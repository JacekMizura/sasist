"""
Production-allocatable ATP SSOT + Phase 8 DOCK/putaway/foreign-hold semantics.

  python -m pytest backend/tests/test_production_material_allocatable_phase8.py -q
"""

from __future__ import annotations

import os
from datetime import date, datetime
from unittest.mock import patch

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
    PRODUCTION_ORDER_SOURCE_ORDERS,
    ProductionOrder,
    ProductionOrderLineSnapshot,
    ProductionOrderSourceItem,
)
from backend.models.stock_reservation import StockReservation
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.services.picking_entry_gate_service import MODE_ACTIVE, run_picking_entry_gate
from backend.services.production_order_trigger import on_component_availability_increased
from backend.services.production_shortages.analysis_service import analyze_composition_quantity
from backend.services.production_shortages.inventory_detail_service import component_stock_breakdown
from backend.services.reservations.allocation_service import allocate_product_quantity
from backend.services.reservations.availability_service import production_allocatable_qty
from backend.services.reservations.constants import RESERVATION_KIND_SALES_ORDER
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
        "backend.services.picking_entry_gate_service.record_domain_activity",
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
    _mo_n = {"n": 0}

    def _next_mo(*_a, **_k):
        _mo_n["n"] += 1
        return f"MO/ALLOC/{_mo_n['n']}"

    monkeypatch.setattr(
        "backend.services.production_order_trigger.trigger_service._next_order_number",
        _next_mo,
    )


def _bootstrap(*, requires_putaway: bool = True):
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
    db.add(Warehouse(id=1, tenant_id=1, name="WH1", requires_putaway=requires_putaway))
    db.add(
        Location(
            id=1,
            warehouse_id=1,
            name="PICK",
            type="pick",
            location_type="NORMAL",
            is_active=True,
        )
    )
    db.add(
        Location(
            id=2,
            warehouse_id=1,
            name="DOCK-IN",
            type="dock",
            location_type="DOCK",
            is_active=True,
        )
    )
    for sid, name in (
        (1, "Wózki"),
        (2, "Oczekuje na produkcję"),
        (3, "Produkcja"),
        (4, "Po produkcji"),
        (5, "BRAKI"),
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
    db.add(Product(id=193, tenant_id=1, name="ST-001", sku="ST-001"))
    db.add(Product(id=192, tenant_id=1, name="ST-003", sku="ST-003"))
    db.add(
        ProductComposition(
            id=1,
            tenant_id=1,
            product_id=193,
            name="BOM",
            composition_mode="manufacturing",
            is_active=True,
            yield_quantity=1.0,
        )
    )
    db.add(
        ProductCompositionLine(
            id=1,
            composition_id=1,
            component_product_id=192,
            quantity=2.0,
        )
    )
    db.add(
        PickingConfig(
            id=1,
            tenant_id=1,
            warehouse_id=1,
            source_status_id=1,
            target_status_id=1,
            strategy="locations",
            pick_unit="products",
            order_sort="date",
            single_mode="bulk",
            multi_mode="bulk",
            is_production_mode=False,
            is_active=True,
        )
    )
    db.add(
        PickingConfig(
            id=2,
            tenant_id=1,
            warehouse_id=1,
            name="Prod",
            source_status_id=3,
            target_status_id=4,
            strategy="locations",
            pick_unit="products",
            order_sort="date",
            single_mode="bulk",
            multi_mode="bulk",
            is_production_mode=True,
            is_active=True,
            status_after_production_id=4,
            status_on_component_shortage_id=5,
            status_awaiting_production_id=2,
            finished_goods_buffer_location_id=2,
            production_order_trigger_scope="SINGLE_ELEMENT",
            production_execution_method="WMS",
            after_production_action="STATUS_ONLY",
        )
    )
    db.commit()
    return db


def _make_order(db, *, oid: int = 2001, qty: float = 1.0) -> Order:
    o = Order(
        id=oid,
        tenant_id=1,
        warehouse_id=1,
        number=str(oid),
        status="NEW",
        order_ui_status_id=1,
        order_date=datetime(2026, 8, 15),
        created_at=datetime(2026, 8, 15),
    )
    db.add(o)
    db.flush()
    db.add(OrderItem(id=oid * 10, order_id=oid, product_id=193, quantity=float(qty)))
    db.commit()
    return db.query(Order).filter(Order.id == oid).one()


def _run_gate(db, order: Order):
    with patch.dict(os.environ, {"FEATURE_PICKING_ENTRY_READINESS_MODE": MODE_ACTIVE}):
        return run_picking_entry_gate(
            db,
            order=order,
            previous_status_id=None,
            new_status_id=1,
            force_mode=MODE_ACTIVE,
        )


def _set_inv(db, *, location_id: int, qty: float, inv_id: int):
    row = db.query(Inventory).filter(Inventory.id == inv_id).first()
    if row is None:
        db.add(
            Inventory(
                id=inv_id,
                tenant_id=1,
                warehouse_id=1,
                product_id=192,
                location_id=int(location_id),
                quantity=float(qty),
                batch_number="",
                expiry_date=date(9999, 12, 31),
                stock_disposition=STOCK_DISPOSITION_SALEABLE,
            )
        )
    else:
        row.location_id = int(location_id)
        row.quantity = float(qty)
    db.commit()


def _activity_spy(monkeypatch):
    events: list[str] = []

    def _capture(*_a, **kwargs):
        events.append(str(kwargs.get("event_type") or ""))

    monkeypatch.setattr(
        "backend.services.production_order_trigger.material_validation_service.append_order_activity_for_wms",
        _capture,
    )
    return events


def test_dock_on_hand_not_production_allocatable():
    db = _bootstrap(requires_putaway=True)
    _set_inv(db, location_id=2, qty=2.0, inv_id=1)  # DOCK only
    assert production_allocatable_qty(db, tenant_id=1, warehouse_id=1, product_id=192) == 0.0
    stock = component_stock_breakdown(db, tenant_id=1, warehouse_id=1, product_id=192)
    assert stock["on_hand_qty"] == 2.0
    assert stock["available_qty"] == 0.0


def test_putaway_makes_qty_allocatable_and_analysis_matches_allocator():
    db = _bootstrap(requires_putaway=True)
    _set_inv(db, location_id=1, qty=2.0, inv_id=1)  # PICK
    alloc = production_allocatable_qty(db, tenant_id=1, warehouse_id=1, product_id=192)
    assert alloc == 2.0
    stock = component_stock_breakdown(db, tenant_id=1, warehouse_id=1, product_id=192)
    assert stock["available_qty"] == 2.0
    slices = allocate_product_quantity(
        db,
        tenant_id=1,
        warehouse_id=1,
        product_id=192,
        quantity=2.0,
        exclude_order_id=None,
    )
    assert sum(s.quantity for s in slices) == 2.0
    assert stock["available_qty"] == alloc


def test_analysis_qty_equals_allocator_qty_same_setup():
    db = _bootstrap(requires_putaway=True)
    _set_inv(db, location_id=2, qty=5.0, inv_id=1)  # DOCK noise
    _set_inv(db, location_id=1, qty=3.0, inv_id=2)  # pickable
    composition = db.query(ProductComposition).filter(ProductComposition.id == 1).one()
    analysis = analyze_composition_quantity(
        db,
        tenant_id=1,
        warehouse_id=1,
        composition=composition,
        planned_quantity=1.0,
    )
    comps = {int(c["component_product_id"]): c for c in analysis["components"]}
    assert comps[192]["available_qty"] == 3.0
    assert production_allocatable_qty(db, tenant_id=1, warehouse_id=1, product_id=192) == 3.0


def test_phase8_dock_only_no_auto_resumed_stays_shortage(monkeypatch):
    events = _activity_spy(monkeypatch)
    db = _bootstrap(requires_putaway=True)
    order = _make_order(db)
    _run_gate(db, order)
    db.commit()
    src = db.query(ProductionOrderSourceItem).filter(ProductionOrderSourceItem.order_id == 2001).one()
    assert src.status == PRODUCTION_ORDER_SOURCE_ITEM_SHORTAGE
    assert order.order_ui_status_id == 5

    _set_inv(db, location_id=2, qty=2.0, inv_id=10)  # DOCK only
    out = on_component_availability_increased(
        db, tenant_id=1, warehouse_id=1, component_product_ids=[192], reason="pz_dock"
    )
    db.commit()
    assert int(out.get("restored") or 0) == 0
    assert "PRODUCTION_SHORTAGE_AUTO_RESUMED" not in events
    order = db.query(Order).filter(Order.id == 2001).one()
    src = db.query(ProductionOrderSourceItem).filter(ProductionOrderSourceItem.order_id == 2001).one()
    assert order.order_ui_status_id == 5
    assert src.status == PRODUCTION_ORDER_SOURCE_ITEM_SHORTAGE
    assert (
        db.query(StockReservation)
        .filter(StockReservation.reservation_kind == "PRODUCTION_ORDER")
        .count()
        == 0
    )


def test_phase8_after_putaway_reserves_and_auto_resumes(monkeypatch):
    events = _activity_spy(monkeypatch)
    db = _bootstrap(requires_putaway=True)
    order = _make_order(db)
    _run_gate(db, order)
    db.commit()
    src_id = (
        db.query(ProductionOrderSourceItem)
        .filter(ProductionOrderSourceItem.order_id == 2001)
        .one()
        .id
    )

    _set_inv(db, location_id=1, qty=2.0, inv_id=11)  # pickable putaway
    out = on_component_availability_increased(
        db, tenant_id=1, warehouse_id=1, component_product_ids=[192], reason="pz_putaway"
    )
    db.commit()
    assert int(out.get("restored") or 0) >= 1
    assert "PRODUCTION_SHORTAGE_AUTO_RESUMED" in events

    src = db.query(ProductionOrderSourceItem).filter(ProductionOrderSourceItem.id == src_id).one()
    assert src.status == PRODUCTION_ORDER_SOURCE_ITEM_RESERVED
    mo = db.query(ProductionOrder).filter(ProductionOrder.id == src.production_order_id).one()
    assert mo.materials_reserved is True
    assert float(mo.planned_quantity or 0) == 1.0
    order = db.query(Order).filter(Order.id == 2001).one()
    assert order.order_ui_status_id == 3  # Produkcja
    res_qty = (
        db.query(StockReservation)
        .filter(
            StockReservation.production_order_id == mo.id,
            StockReservation.status == "reserved",
        )
        .all()
    )
    assert sum(float(r.quantity or 0) for r in res_qty) == 2.0


def test_foreign_sales_order_holds_block_then_release_retries(monkeypatch):
    events = _activity_spy(monkeypatch)
    db = _bootstrap(requires_putaway=True)
    order = _make_order(db)
    _run_gate(db, order)
    db.commit()

    _set_inv(db, location_id=1, qty=4.0, inv_id=20)
    db.add(
        StockReservation(
            id=1,
            tenant_id=1,
            warehouse_id=1,
            product_id=192,
            location_id=1,
            quantity=4.0,
            status="reserved",
            reservation_kind=RESERVATION_KIND_SALES_ORDER,
            order_id=9999,
            batch_number="",
            expiry_date=date(9999, 12, 31),
            stock_disposition=STOCK_DISPOSITION_SALEABLE,
        )
    )
    db.commit()
    assert production_allocatable_qty(db, tenant_id=1, warehouse_id=1, product_id=192) == 0.0

    out1 = on_component_availability_increased(
        db, tenant_id=1, warehouse_id=1, component_product_ids=[192], reason="blocked"
    )
    db.commit()
    assert int(out1.get("restored") or 0) == 0
    assert "PRODUCTION_SHORTAGE_AUTO_RESUMED" not in events
    src = db.query(ProductionOrderSourceItem).filter(ProductionOrderSourceItem.order_id == 2001).one()
    assert src.status == PRODUCTION_ORDER_SOURCE_ITEM_SHORTAGE

    hold = db.query(StockReservation).filter(StockReservation.id == 1).one()
    hold.quantity = 2.0  # free 2 for production
    db.commit()
    assert production_allocatable_qty(db, tenant_id=1, warehouse_id=1, product_id=192) == 2.0

    out2 = on_component_availability_increased(
        db, tenant_id=1, warehouse_id=1, component_product_ids=[192], reason="hold_partial_release"
    )
    db.commit()
    assert int(out2.get("restored") or 0) >= 1
    assert "PRODUCTION_SHORTAGE_AUTO_RESUMED" in events
    src = db.query(ProductionOrderSourceItem).filter(ProductionOrderSourceItem.order_id == 2001).one()
    assert src.status == PRODUCTION_ORDER_SOURCE_ITEM_RESERVED
    mo = db.query(ProductionOrder).filter(ProductionOrder.id == src.production_order_id).one()
    assert mo.materials_reserved is True


def test_refresh_fail_leaves_shortage_not_reserved(monkeypatch):
    """Allocator raises → sources stay shortage, materials_reserved=false."""
    events = _activity_spy(monkeypatch)
    db = _bootstrap(requires_putaway=True)
    order = _make_order(db)
    _run_gate(db, order)
    db.commit()

    # Analysis would see pickable stock, but force allocate failure after analysis.
    _set_inv(db, location_id=1, qty=2.0, inv_id=30)

    def _boom(*_a, **_k):
        raise ValueError("Brak dostępnego stanu")

    monkeypatch.setattr(
        "backend.services.reservations.reservation_service.allocate_product_quantity",
        _boom,
    )
    out = on_component_availability_increased(
        db, tenant_id=1, warehouse_id=1, component_product_ids=[192], reason="alloc_fail"
    )
    db.commit()
    assert int(out.get("restored") or 0) == 0
    assert "PRODUCTION_SHORTAGE_AUTO_RESUMED" not in events
    src = db.query(ProductionOrderSourceItem).filter(ProductionOrderSourceItem.order_id == 2001).one()
    assert src.status == PRODUCTION_ORDER_SOURCE_ITEM_SHORTAGE
    order = db.query(Order).filter(Order.id == 2001).one()
    assert order.order_ui_status_id == 5


def test_phase8_retry_idempotent_after_restore(monkeypatch):
    events = _activity_spy(monkeypatch)
    db = _bootstrap(requires_putaway=True)
    order = _make_order(db)
    _run_gate(db, order)
    db.commit()
    _set_inv(db, location_id=1, qty=2.0, inv_id=40)
    on_component_availability_increased(
        db, tenant_id=1, warehouse_id=1, component_product_ids=[192], reason="first"
    )
    db.commit()
    src = db.query(ProductionOrderSourceItem).filter(ProductionOrderSourceItem.order_id == 2001).one()
    mo = db.query(ProductionOrder).filter(ProductionOrder.id == src.production_order_id).one()
    planned = float(mo.planned_quantity or 0)
    resumes = events.count("PRODUCTION_SHORTAGE_AUTO_RESUMED")

    out2 = on_component_availability_increased(
        db, tenant_id=1, warehouse_id=1, component_product_ids=[192], reason="second"
    )
    db.commit()
    assert int(out2.get("restored") or 0) == 0
    assert events.count("PRODUCTION_SHORTAGE_AUTO_RESUMED") == resumes
    mo2 = db.query(ProductionOrder).filter(ProductionOrder.id == mo.id).one()
    assert float(mo2.planned_quantity or 0) == planned
    assert (
        db.query(ProductionOrderSourceItem)
        .filter(ProductionOrderSourceItem.order_id == 2001)
        .count()
        == 1
    )


def test_partial_keeps_only_coverable_source_reserved(monkeypatch):
    """Two orders compete for ST-003×2 (covers one FG only)."""
    _activity_spy(monkeypatch)
    db = _bootstrap(requires_putaway=True)
    o1 = _make_order(db, oid=2101)
    o2 = _make_order(db, oid=2102)
    _run_gate(db, o1)
    _run_gate(db, o2)
    db.commit()
    _set_inv(db, location_id=1, qty=2.0, inv_id=50)  # only one FG worth
    on_component_availability_increased(
        db, tenant_id=1, warehouse_id=1, component_product_ids=[192], reason="partial"
    )
    db.commit()
    s1 = db.query(ProductionOrderSourceItem).filter(ProductionOrderSourceItem.order_id == 2101).one()
    s2 = db.query(ProductionOrderSourceItem).filter(ProductionOrderSourceItem.order_id == 2102).one()
    statuses = {s1.status, s2.status}
    assert PRODUCTION_ORDER_SOURCE_ITEM_RESERVED in statuses
    assert PRODUCTION_ORDER_SOURCE_ITEM_SHORTAGE in statuses
    reserved = s1 if s1.status == PRODUCTION_ORDER_SOURCE_ITEM_RESERVED else s2
    mo = db.query(ProductionOrder).filter(ProductionOrder.id == reserved.production_order_id).one()
    assert mo.materials_reserved is True
    assert float(mo.planned_quantity or 0) == 1.0
