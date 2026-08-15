"""
Regression: Phase 2 readiness gate vs Phase 8 component shortage retry (UAT #1266).

  python -m pytest backend/tests/test_picking_entry_gate_phase8_component_collision.py -q
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
    PRODUCTION_ORDER_SOURCE_ITEM_ACTIVE_STATUSES,
    PRODUCTION_ORDER_SOURCE_ITEM_CANCELLED,
    PRODUCTION_ORDER_SOURCE_ITEM_RESERVED,
    PRODUCTION_ORDER_SOURCE_ITEM_SHORTAGE,
    ProductionOrder,
    ProductionOrderLineSnapshot,
    ProductionOrderSourceItem,
)
from backend.models.stock_reservation import StockReservation
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.services.picking_entry_gate_service import MODE_ACTIVE, run_picking_entry_gate
from backend.services.production_order_trigger import on_component_availability_increased
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
        return f"MO/TEST/{_mo_n['n']}"

    monkeypatch.setattr(
        "backend.services.production_order_trigger.trigger_service._next_order_number",
        _next_mo,
    )


def _bootstrap(*, component_qty: float = 0.0):
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
            name="BUF",
            type="floor",
            location_type="DOCK",
            is_active=True,
        )
    )
    # 1=Wózki, 2=Awaiting, 3=Produkcja, 4=after, 5=BRAKI
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
    # Picking entry source status
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
    if component_qty > 1e-9:
        db.add(
            Inventory(
                id=1,
                tenant_id=1,
                warehouse_id=1,
                product_id=192,
                location_id=1,
                quantity=float(component_qty),
                batch_number="",
                expiry_date=date(9999, 12, 31),
                stock_disposition=STOCK_DISPOSITION_SALEABLE,
            )
        )
    db.commit()
    return db


def _make_order(db, *, oid: int = 1266, qty: float = 1.0) -> Order:
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


def _add_component(db, *, qty: float, inv_id: int = 99):
    inv = db.query(Inventory).filter(Inventory.id == inv_id).first()
    if inv is None:
        db.add(
            Inventory(
                id=inv_id,
                tenant_id=1,
                warehouse_id=1,
                product_id=192,
                location_id=1,
                quantity=float(qty),
                batch_number="",
                expiry_date=date(9999, 12, 31),
                stock_disposition=STOCK_DISPOSITION_SALEABLE,
            )
        )
    else:
        inv.quantity = float(qty)
    db.commit()


def test_a_fg_shortage_all_component_shortage_ends_on_braki_not_awaiting():
    """A: gate + ALL_SHORTAGE → BRAKI, never awaiting."""
    db = _bootstrap(component_qty=0.0)
    order = _make_order(db)
    res = _run_gate(db, order)
    db.commit()
    order = db.query(Order).filter(Order.id == 1266).one()
    assert order.order_ui_status_id == 5  # BRAKI
    assert res is not None
    assert any("status_component_shortage:5" in s for s in (res.side_effects or []))
    assert not any(str(s).startswith("status_awaiting:") for s in (res.side_effects or []))
    srcs = db.query(ProductionOrderSourceItem).filter(ProductionOrderSourceItem.order_id == 1266).all()
    assert len(srcs) == 1
    assert srcs[0].status == PRODUCTION_ORDER_SOURCE_ITEM_SHORTAGE
    mo = db.query(ProductionOrder).filter(ProductionOrder.id == srcs[0].production_order_id).one()
    assert mo.status == "cancelled"
    assert float(mo.planned_quantity or 0) <= 1e-9


def test_b_c_d_e_phase8_one_demand_reattach_idempotent():
    """B–E: Phase 8 reuses shortage source; one MO planned; double event noop."""
    db = _bootstrap(component_qty=0.0)
    order = _make_order(db)
    _run_gate(db, order)
    db.commit()
    src_before = (
        db.query(ProductionOrderSourceItem)
        .filter(ProductionOrderSourceItem.order_id == 1266)
        .one()
    )
    old_src_id = int(src_before.id)
    old_mo_id = int(src_before.production_order_id)

    _add_component(db, qty=2.0)
    out1 = on_component_availability_increased(
        db,
        tenant_id=1,
        warehouse_id=1,
        component_product_ids=[192],
        reason="uat_p8",
    )
    db.commit()
    assert out1.get("restored", 0) >= 1

    order = db.query(Order).filter(Order.id == 1266).one()
    assert order.order_ui_status_id == 3  # Produkcja — not awaiting

    srcs = (
        db.query(ProductionOrderSourceItem)
        .filter(ProductionOrderSourceItem.order_item_id == 12660)
        .all()
    )
    active = [s for s in srcs if str(s.status) in PRODUCTION_ORDER_SOURCE_ITEM_ACTIVE_STATUSES]
    shortage = [s for s in srcs if str(s.status) == PRODUCTION_ORDER_SOURCE_ITEM_SHORTAGE]
    assert len(active) == 1
    assert len(shortage) == 0
    assert int(active[0].id) == old_src_id  # reattach / reuse
    assert int(active[0].production_order_id) != old_mo_id
    assert str(active[0].status) == PRODUCTION_ORDER_SOURCE_ITEM_RESERVED

    new_mo = db.query(ProductionOrder).filter(ProductionOrder.id == active[0].production_order_id).one()
    assert new_mo.status in ("draft", "planned")
    assert abs(float(new_mo.planned_quantity or 0) - 1.0) < 1e-6

    old_mo = db.query(ProductionOrder).filter(ProductionOrder.id == old_mo_id).one()
    assert old_mo.status == "cancelled"

    # E: second availability event — no duplicate source / MO / planned bump
    planned_before = float(new_mo.planned_quantity or 0)
    mo_count_before = db.query(ProductionOrder).count()
    src_count_before = db.query(ProductionOrderSourceItem).count()
    out2 = on_component_availability_increased(
        db,
        tenant_id=1,
        warehouse_id=1,
        component_product_ids=[192],
        reason="uat_p8_repeat",
    )
    db.commit()
    assert out2.get("restored", 0) == 0
    assert db.query(ProductionOrder).count() == mo_count_before
    assert db.query(ProductionOrderSourceItem).count() == src_count_before
    new_mo = db.query(ProductionOrder).filter(ProductionOrder.id == new_mo.id).one()
    assert abs(float(new_mo.planned_quantity or 0) - planned_before) < 1e-6
    order = db.query(Order).filter(Order.id == 1266).one()
    assert order.order_ui_status_id == 3


def test_f_partial_component_recovery_keeps_remaining_shortage():
    """F: material for 1 of 2 orders — one restored, one stays shortage."""
    db = _bootstrap(component_qty=0.0)
    _make_order(db, oid=1, qty=1.0)
    _make_order(db, oid=2, qty=1.0)
    for oid in (1, 2):
        o = db.query(Order).filter(Order.id == oid).one()
        _run_gate(db, o)
    db.commit()
    assert all(
        db.query(Order).filter(Order.id == oid).one().order_ui_status_id == 5 for oid in (1, 2)
    )

    # BOM needs 2 ST-003 per FG → stock 2 covers exactly one order
    _add_component(db, qty=2.0)
    out = on_component_availability_increased(
        db,
        tenant_id=1,
        warehouse_id=1,
        component_product_ids=[192],
        reason="partial",
    )
    db.commit()
    restored = [r for r in (out.get("items") or []) if r.get("result") == "RESTORED"]
    assert len(restored) == 1
    statuses = {
        oid: db.query(Order).filter(Order.id == oid).one().order_ui_status_id for oid in (1, 2)
    }
    assert sorted(statuses.values()) == [3, 5]
    still_short = (
        db.query(ProductionOrderSourceItem)
        .filter(ProductionOrderSourceItem.status == PRODUCTION_ORDER_SOURCE_ITEM_SHORTAGE)
        .count()
    )
    assert still_short == 1
    active = (
        db.query(ProductionOrderSourceItem)
        .filter(
            ProductionOrderSourceItem.status.in_(tuple(PRODUCTION_ORDER_SOURCE_ITEM_ACTIVE_STATUSES))
        )
        .count()
    )
    assert active == 1


def test_g_no_awaiting_overwrite_and_single_logical_demand():
    """G: after gate, no awaiting side-effect; after retry, no leftover shortage."""
    db = _bootstrap(component_qty=0.0)
    order = _make_order(db)
    res = _run_gate(db, order)
    db.commit()
    assert "status_awaiting:2" not in (res.side_effects or [])
    _add_component(db, qty=2.0)
    on_component_availability_increased(
        db, tenant_id=1, warehouse_id=1, component_product_ids=[192], reason="g"
    )
    db.commit()
    leftover = (
        db.query(ProductionOrderSourceItem)
        .filter(
            ProductionOrderSourceItem.order_item_id == 12660,
            ProductionOrderSourceItem.status == PRODUCTION_ORDER_SOURCE_ITEM_SHORTAGE,
        )
        .count()
    )
    assert leftover == 0
    cancelled_or_active = (
        db.query(ProductionOrderSourceItem)
        .filter(ProductionOrderSourceItem.order_item_id == 12660)
        .all()
    )
    assert len(cancelled_or_active) == 1
    assert cancelled_or_active[0].status in (
        PRODUCTION_ORDER_SOURCE_ITEM_RESERVED,
        PRODUCTION_ORDER_SOURCE_ITEM_CANCELLED,
    ) or cancelled_or_active[0].status in PRODUCTION_ORDER_SOURCE_ITEM_ACTIVE_STATUSES
