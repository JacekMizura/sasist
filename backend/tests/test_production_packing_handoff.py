"""
Phase 6 — production → packing handoff (status_after, buffer consume, auto-open hint).

  python -m pytest backend/tests/test_production_packing_handoff.py -q
"""

from __future__ import annotations

from datetime import date, datetime

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from backend.db.schema_upgrade import ensure_picking_config_production_mode_columns
from backend.models.fulfillment_event import FE_PICK, FulfillmentEvent
from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.order_item_pick_allocation import OrderItemPickAllocation
from backend.models.order_ui_status import OrderUiStatus
from backend.models.picking_config import PickingConfig
from backend.models.product import Product
from backend.models.product_composition import ProductComposition, ProductCompositionLine
from backend.models.production import (
    PRODUCTION_ORDER_SOURCE_ITEM_RESERVED,
    PRODUCTION_ORDER_SOURCE_MANUAL,
    PRODUCTION_ORDER_SOURCE_ORDERS,
    ProductionOrder,
    ProductionOrderLineSnapshot,
    ProductionOrderSourceItem,
)
from backend.models.stock_document import StockDocument, StockDocumentItem
from backend.models.stock_operation import StockOperation
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.schemas.production_execution import OrderProductionProgressBody
from backend.schemas.production_config import ProductionConfigCreate
from backend.services.production_config_service import create_production_config
from backend.services.picking_config_service import validate_production_mode_batch
from backend.services.production_execution.order_execution_service import update_order_production_progress
from backend.services.production_execution.production_packing_handoff_service import (
    consume_production_buffer_stock_on_packing_finish,
    order_is_from_production,
)
from backend.services.stock_disposition import STOCK_DISPOSITION_SALEABLE
from backend.services.wms_packing_service import order_item_required_pack_qty


def _engine():
    eng = create_engine("sqlite:///:memory:")

    @event.listens_for(eng, "connect")
    def _fk(dbapi_conn, _):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=OFF")
        cur.close()

    return eng


@pytest.fixture(autouse=True)
def _patches(monkeypatch):
    monkeypatch.setattr(
        "backend.services.order_panel_ui_status_service._run_smart_matching_status_hook",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "backend.services.order_panel_ui_status_service._run_production_status_hook",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "backend.services.production_execution.orders_fg_fulfillment_service.append_order_activity_for_wms",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "backend.services.production_execution.orders_fg_fulfillment_service.require_warehouse_series",
        lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("no series")),
    )
    monkeypatch.setattr(
        "backend.services.production_execution.orders_fg_fulfillment_service.assign_series_number_to_stock_document",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "backend.services.production_execution.orders_fg_fulfillment_service.append_receipt_operation",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "backend.services.production_execution.orders_fg_fulfillment_service.upsert_dock_inventory_for_loose_receipt",
        lambda db, **kw: _upsert_inv(db, **kw),
    )
    monkeypatch.setattr(
        "backend.services.production_execution.cost_service.compute_order_unit_cost",
        lambda *_a, **_k: 10.0,
    )
    monkeypatch.setattr(
        "backend.services.braki_order_state_service.order_can_show_ready_pack",
        lambda *_a, **_k: True,
    )
    monkeypatch.setattr(
        "backend.services.recovery_workflow_service.can_order_be_packed",
        lambda *_a, **_k: True,
    )
    monkeypatch.setattr(
        "backend.services.production_execution.production_packing_handoff_service.try_auto_pack_newly_ready_orders",
        lambda *_a, **_k: {
            "attempted": False,
            "succeeded": False,
            "fallback_reason": None,
            "waybill_print_count": 0,
            "waybill_file_urls": [],
            "orders": [],
        },
    )

    def _serialize(db, order, **_kw):
        from backend.schemas.production import ProductionOrderRead

        return ProductionOrderRead(
            id=int(order.id),
            tenant_id=int(order.tenant_id),
            number=str(order.number or ""),
            product_id=int(order.product_id),
            warehouse_id=int(order.warehouse_id),
            planned_quantity=float(order.planned_quantity or 0),
            produced_quantity=float(order.produced_quantity or 0),
            status=str(order.status or "in_progress"),
            priority=int(getattr(order, "priority", 0) or 0),
            source_type=str(getattr(order, "source_type", None) or "ORDERS"),
            picking_config_id=getattr(order, "picking_config_id", None),
        )

    monkeypatch.setattr(
        "backend.services.production_execution.order_execution_service.serialize_order",
        _serialize,
    )


def _upsert_inv(db, *, tenant_id, warehouse_id, location_id, product_id, add_qty, **_kw):
    row = (
        db.query(Inventory)
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.location_id == int(location_id),
            Inventory.product_id == int(product_id),
        )
        .first()
    )
    if row is None:
        row = Inventory(
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            location_id=int(location_id),
            product_id=int(product_id),
            quantity=0.0,
            stock_disposition=STOCK_DISPOSITION_SALEABLE,
            batch_number="",
            expiry_date=date(9999, 12, 31),
        )
        db.add(row)
        db.flush()
    row.quantity = float(row.quantity or 0) + float(add_qty)
    db.add(row)
    return row


def _make_session():
    eng = _engine()
    for model in (
        Tenant,
        Warehouse,
        OrderUiStatus,
        Location,
        PickingConfig,
        Product,
        ProductComposition,
        ProductCompositionLine,
        Order,
        OrderItem,
        ProductionOrder,
        ProductionOrderLineSnapshot,
        ProductionOrderSourceItem,
        StockDocument,
        StockDocumentItem,
        StockOperation,
        Inventory,
        FulfillmentEvent,
        OrderItemPickAllocation,
    ):
        model.__table__.create(eng, checkfirst=True)
    ensure_picking_config_production_mode_columns(eng)
    Session = sessionmaker(bind=eng)
    db = Session()
    db.add(Tenant(id=1, name="T", default_warehouse_id=2))
    db.add(Warehouse(id=2, tenant_id=1, name="WH"))
    for sid, name, group in (
        (10, "Do produkcji", "NEW"),
        (11, "Do pakowania", "IN_PROGRESS"),
        (12, "Brak komponentów", "IN_PROGRESS"),
        (13, "Do zbierania", "NEW"),
        (14, "Zebrane", "IN_PROGRESS"),
        (20, "Prod B", "NEW"),
        (21, "Pack B", "IN_PROGRESS"),
        (22, "Brak B", "IN_PROGRESS"),
    ):
        db.add(
            OrderUiStatus(
                id=sid,
                tenant_id=1,
                warehouse_id=2,
                name=name,
                color="#000",
                main_group=group,
            )
        )
    db.add(Location(id=50, warehouse_id=2, name="BUFOR_PRODUKCJA_A", is_active=True, type="BUFFER"))
    db.add(Location(id=51, warehouse_id=2, name="SHELF", is_active=True, type="SHELF"))
    db.add(Product(id=100, tenant_id=1, name="Krzesło", sku="K1", ean="590"))
    db.add(
        ProductComposition(
            id=1,
            tenant_id=1,
            product_id=100,
            name="BOM",
            is_active=True,
            composition_mode="manufacturing",
        )
    )
    db.commit()
    return db


def _prod_create(**overrides) -> ProductionConfigCreate:
    base = dict(
        tenant_id=1,
        warehouse_id=2,
        name="Produkcja test",
        source_status_id=10,
        status_after_production_id=11,
        status_on_component_shortage_id=12,
        finished_goods_buffer_location_id=50,
        production_order_trigger_scope="SINGLE_ELEMENT",
        production_execution_method="WMS",
        after_production_action="STATUS_ONLY",
    )
    base.update(overrides)
    return ProductionConfigCreate(**base)


def _seed_orders_mo(db, *, after_action="STATUS_ONLY", order_number="123"):
    pc = create_production_config(
        db,
        _prod_create(after_production_action=after_action, name=f"Produkcja {order_number}"),
    )
    db.commit()
    order = Order(
        id=1001,
        tenant_id=1,
        warehouse_id=2,
        number=order_number,
        order_ui_status_id=10,
        fulfillment_state="PICKING",
        deleted_at=None,
        order_date=datetime.utcnow(),
    )
    db.add(order)
    oi = OrderItem(id=2001, order_id=1001, product_id=100, quantity=1, packing_quantity_packed=0)
    db.add(oi)
    mo = ProductionOrder(
        id=3001,
        tenant_id=1,
        number="MO-1",
        product_id=100,
        warehouse_id=2,
        composition_id=1,
        planned_quantity=1,
        produced_quantity=0,
        status="in_progress",
        source_type=PRODUCTION_ORDER_SOURCE_ORDERS,
        picking_config_id=int(pc.id),
        production_source_status_id=10,
    )
    db.add(mo)
    db.flush()
    db.add(
        ProductionOrderSourceItem(
            tenant_id=1,
            production_order_id=3001,
            order_id=1001,
            order_item_id=2001,
            product_id=100,
            requested_quantity=1,
            fulfilled_quantity=0,
            status=PRODUCTION_ORDER_SOURCE_ITEM_RESERVED,
        )
    )
    db.commit()
    return mo, order, oi, pc


def test_status_after_unique_among_production_configs():
    db = _make_session()
    create_production_config(db, _prod_create(source_status_id=10, status_after_production_id=11))
    with pytest.raises(ValueError, match="po wyprodukowaniu"):
        create_production_config(
            db,
            _prod_create(
                name="Hala B",
                source_status_id=20,
                status_after_production_id=11,
                status_on_component_shortage_id=22,
            ),
        )


def test_status_after_cannot_be_other_production_source():
    db = _make_session()
    with pytest.raises(ValueError, match="wejściowym innego trybu produkcji|po wyprodukowaniu"):
        validate_production_mode_batch(
            [
                type(
                    "C",
                    (),
                    {
                        "is_production_mode": True,
                        "source_status_id": 10,
                        "status_after_production_id": 20,
                    },
                )(),
                type(
                    "C",
                    (),
                    {
                        "is_production_mode": True,
                        "source_status_id": 20,
                        "status_after_production_id": 21,
                    },
                )(),
            ]
        )


def test_fulfilled_source_moves_to_status_after_and_packing_list():
    db = _make_session()
    mo, order, oi, _pc = _seed_orders_mo(db, after_action="STATUS_ONLY", order_number="1234")
    out = update_order_production_progress(
        db,
        tenant_id=1,
        order_id=int(mo.id),
        body=OrderProductionProgressBody(add_quantity=1),
        performed_by_user_id=1,
    )
    db.commit()
    db.refresh(order)
    assert int(order.order_ui_status_id) == 11
    assert str(order.fulfillment_state) == "READY_TO_PACK"
    assert str(order.picking_handoff_mode) == "CARTLESS"
    assert out.packing_handoff is not None
    assert out.packing_handoff.after_production_action == "STATUS_ONLY"
    assert len(out.packing_handoff.newly_ready_orders) == 1
    assert out.packing_handoff.newly_ready_orders[0].order_id == 1001

    # Packing cohort provenance (list_packing_orders needs full WMS feature tables in lean SQLite).
    assert int(order.order_ui_status_id) == 11
    assert order_item_required_pack_qty(db, order, oi) >= 1
    assert order_is_from_production(db, order) is True

    inv = (
        db.query(Inventory)
        .filter(Inventory.product_id == 100, Inventory.location_id == 50)
        .first()
    )
    assert inv is not None
    assert float(inv.quantity) >= 1 - 1e-6

    alloc = (
        db.query(OrderItemPickAllocation)
        .filter(OrderItemPickAllocation.order_id == 1001, OrderItemPickAllocation.location_id == 50)
        .first()
    )
    assert alloc is not None


def test_open_packing_hint_on_progress():
    db = _make_session()
    mo, _order, _oi, _pc = _seed_orders_mo(db, after_action="OPEN_PACKING")
    out = update_order_production_progress(
        db,
        tenant_id=1,
        order_id=int(mo.id),
        body=OrderProductionProgressBody(add_quantity=1),
        performed_by_user_id=1,
    )
    assert out.packing_handoff is not None
    assert out.packing_handoff.after_production_action == "OPEN_PACKING"
    assert len(out.packing_handoff.newly_ready_orders) == 1


def test_multi_source_one_delta_lists_multiple_ready_orders():
    db = _make_session()
    pc = create_production_config(
        db, _prod_create(after_production_action="OPEN_PACKING", name="Multi")
    )
    db.commit()
    for oid, oiid, num in ((1001, 2001, "A"), (1002, 2002, "B")):
        db.add(
            Order(
                id=oid,
                tenant_id=1,
                warehouse_id=2,
                number=num,
                order_ui_status_id=10,
                fulfillment_state="PICKING",
                order_date=datetime.utcnow(),
            )
        )
        db.add(OrderItem(id=oiid, order_id=oid, product_id=100, quantity=1, packing_quantity_packed=0))
    mo = ProductionOrder(
        id=3001,
        tenant_id=1,
        number="MO-M",
        product_id=100,
        warehouse_id=2,
        composition_id=1,
        planned_quantity=2,
        produced_quantity=0,
        status="in_progress",
        source_type=PRODUCTION_ORDER_SOURCE_ORDERS,
        picking_config_id=int(pc.id),
    )
    db.add(mo)
    db.flush()
    for oid, oiid in ((1001, 2001), (1002, 2002)):
        db.add(
            ProductionOrderSourceItem(
                tenant_id=1,
                production_order_id=3001,
                order_id=oid,
                order_item_id=oiid,
                product_id=100,
                requested_quantity=1,
                fulfilled_quantity=0,
                status=PRODUCTION_ORDER_SOURCE_ITEM_RESERVED,
            )
        )
    db.commit()
    out = update_order_production_progress(
        db,
        tenant_id=1,
        order_id=3001,
        body=OrderProductionProgressBody(add_quantity=2),
        performed_by_user_id=1,
    )
    assert out.packing_handoff is not None
    assert len(out.packing_handoff.newly_ready_orders) == 2


def test_buffer_stock_consumed_on_packing_finish():
    db = _make_session()
    mo, order, _oi, _pc = _seed_orders_mo(db)
    update_order_production_progress(
        db,
        tenant_id=1,
        order_id=int(mo.id),
        body=OrderProductionProgressBody(add_quantity=1),
        performed_by_user_id=1,
    )
    db.commit()
    inv = (
        db.query(Inventory)
        .filter(Inventory.product_id == 100, Inventory.location_id == 50)
        .first()
    )
    assert float(inv.quantity) >= 1 - 1e-6
    result = consume_production_buffer_stock_on_packing_finish(db, order=order)
    db.commit()
    assert result["result"] == "OK"
    assert float(result["consumed"]) >= 1 - 1e-6
    db.refresh(inv)
    assert float(inv.quantity) <= 1e-6
    # Idempotent
    result2 = consume_production_buffer_stock_on_packing_finish(db, order=order)
    assert result2["result"] == "OK"
    assert float(result2["consumed"]) <= 1e-9


def test_manual_mo_progress_no_packing_handoff():
    db = _make_session()
    mo = ProductionOrder(
        id=4001,
        tenant_id=1,
        number="MO-MNL",
        product_id=100,
        warehouse_id=2,
        composition_id=1,
        planned_quantity=1,
        produced_quantity=0,
        status="in_progress",
        source_type=PRODUCTION_ORDER_SOURCE_MANUAL,
    )
    db.add(mo)
    db.commit()
    out = update_order_production_progress(
        db,
        tenant_id=1,
        order_id=4001,
        body=OrderProductionProgressBody(add_quantity=1),
        performed_by_user_id=1,
    )
    assert out.packing_handoff is None
    assert float(out.produced_quantity) == 1.0
