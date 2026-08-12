"""
Phase 5 — print execution interface for ORDERS MOs.

  python -m pytest backend/tests/test_production_print_execution.py -q
"""

from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace

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
    PRODUCTION_ORDER_SOURCE_ITEM_RESERVED,
    PRODUCTION_ORDER_SOURCE_MANUAL,
    PRODUCTION_ORDER_SOURCE_ORDERS,
    ProductionOrder,
    ProductionOrderLineSnapshot,
    ProductionOrderSourceItem,
)
from backend.models.stock_document import StockDocument, StockDocumentItem
from backend.models.stock_reservation import StockReservation
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.services.production_execution.print_execution_service import (
    resolve_configured_execution_method,
    resolve_production_order_by_scan,
    start_print_execution_order,
)
from backend.services.production_execution.production_card_pdf_service import (
    _order_card_context,
    build_order_production_card_html,
)
from backend.services.production_order_service import ProductionOrderError


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
        "backend.services.production_execution.print_execution_service.serialize_order",
        lambda db, order, **_kw: SimpleNamespace(
            id=int(order.id),
            number=str(order.number),
            status=str(order.status),
            rw_stock_document_id=order.rw_stock_document_id,
            execution_interface=getattr(order, "execution_interface", None),
            materials_reserved=bool(getattr(order, "materials_reserved", False)),
        ),
    )
    monkeypatch.setattr(
        "backend.services.production_execution.print_execution_service._init_order_collection_tasks",
        lambda _db, order: {
            "tasks": [
                {
                    "task_key": "201",
                    "component_product_id": 201,
                    "required_qty": float(order.planned_quantity or 0) * 4,
                    "collected_qty": 0,
                },
                {
                    "task_key": "202",
                    "component_product_id": 202,
                    "required_qty": float(order.planned_quantity or 0),
                    "collected_qty": 0,
                },
            ]
        },
    )
    monkeypatch.setattr(
        "backend.services.production_execution.print_execution_service.validate_stock_shortages",
        lambda *_a, **_k: [],
    )
    monkeypatch.setattr(
        "backend.services.reservations.reservation_service.lock_production_reservations",
        lambda db, **kw: setattr(
            db.query(ProductionOrder).filter(ProductionOrder.id == kw["production_order_id"]).one(),
            "reservations_locked_at",
            datetime.utcnow(),
        ),
    )
    monkeypatch.setattr(
        "backend.services.production_execution.print_execution_service._consume_order_materials",
        lambda db, order, **kw: setattr(order, "rw_stock_document_id", 9001) or SimpleNamespace(id=9001),
    )
    monkeypatch.setattr(
        "backend.services.reservations.reservation_service.consume_production_reservations",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "backend.document_templates.adapters.production_card_adapter.document_engine_available",
        lambda *_a, **_k: False,
    )


def _bootstrap(*, execution_method: str = "PRINT"):
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
        StockDocument,
        StockDocumentItem,
    ):
        model.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(Tenant(id=1, name="T", default_warehouse_id=1))
    db.add(Warehouse(id=1, tenant_id=1, name="WH", requires_putaway=False))
    db.add(Location(id=1, warehouse_id=1, name="B1-A-1", location_type="NORMAL", is_active=True))
    db.add(Location(id=2, warehouse_id=1, name="B1-A-2", location_type="NORMAL", is_active=True))
    db.add(Location(id=50, warehouse_id=1, name="BUFOR", location_type="NORMAL", is_active=True))
    for sid, name in ((10, "Produkcja A"), (11, "Do pakowania"), (12, "Problem")):
        db.add(
            OrderUiStatus(
                id=sid, tenant_id=1, warehouse_id=1, name=name, color="#000", main_group="NEW"
            )
        )
    db.add(Product(id=100, tenant_id=1, name="Krzesło", sku="KRZ", ean="5901001001001"))
    db.add(Product(id=201, tenant_id=1, name="Noga krzesła", sku="NOG", ean="5902002002002"))
    db.add(Product(id=202, tenant_id=1, name="Oparcie", sku="OPA", ean="5903003003003"))
    db.add(
        ProductComposition(
            id=1,
            tenant_id=1,
            product_id=100,
            name="BOM",
            composition_mode="manufacturing",
            is_active=True,
            yield_quantity=1.0,
        )
    )
    db.flush()
    db.add(
        ProductCompositionLine(
            composition_id=1, component_product_id=201, quantity=4.0, waste_percent=0.0, sort_order=0
        )
    )
    db.add(
        ProductCompositionLine(
            composition_id=1, component_product_id=202, quantity=1.0, waste_percent=0.0, sort_order=1
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
            production_execution_method=execution_method,
        )
    )
    db.commit()
    return db


def _make_mo(db, *, planned: float = 5.0, materials_reserved: bool = True) -> ProductionOrder:
    mo = ProductionOrder(
        tenant_id=1,
        number="MO/PRINT/1",
        composition_id=1,
        product_id=100,
        warehouse_id=1,
        location_id=50,
        planned_quantity=float(planned),
        produced_quantity=0.0,
        status="planned",
        source_type=PRODUCTION_ORDER_SOURCE_ORDERS,
        picking_config_id=1,
        production_source_status_id=10,
        materials_reserved=materials_reserved,
    )
    db.add(mo)
    db.flush()
    db.add(
        ProductionOrderLineSnapshot(
            production_order_id=int(mo.id),
            component_product_id=201,
            quantity_per_unit=4.0,
            total_required_quantity=float(planned) * 4,
            consumed_quantity=0.0,
            product_name_snapshot="Noga krzesła",
            product_sku_snapshot="NOG",
        )
    )
    db.add(
        ProductionOrderLineSnapshot(
            production_order_id=int(mo.id),
            component_product_id=202,
            quantity_per_unit=1.0,
            total_required_quantity=float(planned),
            consumed_quantity=0.0,
            product_name_snapshot="Oparcie",
            product_sku_snapshot="OPA",
        )
    )
    db.commit()
    db.refresh(mo)
    return mo


def _reserve(db, mo: ProductionOrder, *, product_id: int, location_id: int, qty: float) -> None:
    db.add(
        StockReservation(
            tenant_id=1,
            warehouse_id=1,
            product_id=product_id,
            location_id=location_id,
            quantity=float(qty),
            status="reserved",
            reservation_kind="production",
            production_order_id=int(mo.id),
        )
    )
    db.commit()


def _add_source(db, mo: ProductionOrder, *, order_id: int, qty: float, priority_color: str | None = None):
    o = Order(
        id=order_id,
        tenant_id=1,
        warehouse_id=1,
        number=f"ZAM-{order_id}",
        order_ui_status_id=10,
        priority_color=priority_color,
        created_at=datetime.utcnow(),
    )
    db.add(o)
    db.flush()
    oi = OrderItem(id=order_id * 10, order_id=order_id, product_id=100, quantity=float(qty))
    db.add(oi)
    db.flush()
    db.add(
        ProductionOrderSourceItem(
            tenant_id=1,
            production_order_id=int(mo.id),
            order_id=order_id,
            order_item_id=int(oi.id),
            product_id=100,
            requested_quantity=float(qty),
            fulfilled_quantity=0.0,
            status=PRODUCTION_ORDER_SOURCE_ITEM_RESERVED,
        )
    )
    db.commit()


def test_configured_method_from_picking_config():
    db = _bootstrap(execution_method="PRINT")
    mo = _make_mo(db)
    assert resolve_configured_execution_method(db, mo) == "PRINT"
    db.close()


def test_pdf_preview_does_not_change_stock_or_status(monkeypatch):
    db = _bootstrap()
    mo = _make_mo(db)
    _reserve(db, mo, product_id=201, location_id=1, qty=25)
    _reserve(db, mo, product_id=201, location_id=2, qty=15)
    _reserve(db, mo, product_id=202, location_id=1, qty=5)
    _add_source(db, mo, order_id=1, qty=2, priority_color="red")
    _add_source(db, mo, order_id=2, qty=3)

    before_inv = db.query(Inventory).count()
    before_status = mo.status
    before_rw = mo.rw_stock_document_id
    before_locked = mo.reservations_locked_at

    monkeypatch.setattr(
        "backend.services.production_execution.production_card_pdf_service.build_production_pick_plan",
        lambda *_a, **_k: SimpleNamespace(lines=[]),
    )
    html = build_order_production_card_html(db, tenant_id=1, order_id=int(mo.id))
    assert "MO/PRINT/1" in html
    assert "Krzesło" in html
    assert "Noga" in html
    assert "B1-A-1" in html
    assert "25" in html
    assert "B1-A-2" in html
    assert "15" in html
    assert "Zamówienia" in html
    assert "ZAM-1" in html
    assert "🔥" in html

    db.refresh(mo)
    assert mo.status == before_status
    assert mo.rw_stock_document_id == before_rw
    assert mo.reservations_locked_at == before_locked
    assert db.query(Inventory).count() == before_inv
    db.close()


def test_print_start_locks_and_creates_one_rw():
    db = _bootstrap()
    mo = _make_mo(db)
    _reserve(db, mo, product_id=201, location_id=1, qty=20)
    _reserve(db, mo, product_id=202, location_id=1, qty=5)

    out = start_print_execution_order(
        db, tenant_id=1, order_id=int(mo.id), started_by_user_id=7, consume_materials=True
    )
    db.refresh(mo)
    assert mo.execution_interface == "PRINT"
    assert mo.reservations_locked_at is not None
    assert mo.rw_stock_document_id == 9001
    assert mo.status == "in_progress"
    assert out.rw_stock_document_id == 9001
    db.close()


def test_print_restart_is_idempotent_no_second_rw(monkeypatch):
    db = _bootstrap()
    mo = _make_mo(db)
    _reserve(db, mo, product_id=201, location_id=1, qty=20)
    _reserve(db, mo, product_id=202, location_id=1, qty=5)
    start_print_execution_order(
        db, tenant_id=1, order_id=int(mo.id), started_by_user_id=7, consume_materials=True
    )
    db.refresh(mo)
    first_rw = mo.rw_stock_document_id

    consume_calls = {"n": 0}

    def _consume(db, order, **kw):
        consume_calls["n"] += 1
        order.rw_stock_document_id = 9999
        return SimpleNamespace(id=9999)

    monkeypatch.setattr(
        "backend.services.production_execution.print_execution_service._consume_order_materials",
        _consume,
    )
    start_print_execution_order(
        db, tenant_id=1, order_id=int(mo.id), started_by_user_id=7, consume_materials=True
    )
    db.refresh(mo)
    assert consume_calls["n"] == 0
    assert mo.rw_stock_document_id == first_rw
    db.close()


def test_print_start_blocked_without_materials():
    db = _bootstrap()
    mo = _make_mo(db, materials_reserved=False)
    with pytest.raises(ProductionOrderError) as exc:
        start_print_execution_order(
            db, tenant_id=1, order_id=int(mo.id), started_by_user_id=1, consume_materials=True
        )
    assert exc.value.code == "component_shortage"
    db.refresh(mo)
    assert mo.status == "planned"
    assert mo.rw_stock_document_id is None
    db.close()


def test_print_not_configured_for_wms_method():
    db = _bootstrap(execution_method="WMS")
    mo = _make_mo(db)
    with pytest.raises(ProductionOrderError) as exc:
        start_print_execution_order(db, tenant_id=1, order_id=int(mo.id), consume_materials=True)
    assert exc.value.code == "print_not_configured"
    db.close()


def test_manual_mo_rejected_for_print_start():
    db = _bootstrap()
    mo = _make_mo(db)
    mo.source_type = PRODUCTION_ORDER_SOURCE_MANUAL
    db.commit()
    with pytest.raises(ProductionOrderError) as exc:
        start_print_execution_order(db, tenant_id=1, order_id=int(mo.id), consume_materials=True)
    assert exc.value.code == "invalid_source_type"
    db.close()


def test_resolve_scan_by_mo_number():
    db = _bootstrap()
    mo = _make_mo(db)
    out = resolve_production_order_by_scan(db, tenant_id=1, warehouse_id=1, code="MO/PRINT/1")
    assert out.id == mo.id
    db.close()


def test_order_card_context_allocations_and_priority_flame(monkeypatch):
    db = _bootstrap()
    mo = _make_mo(db)
    _reserve(db, mo, product_id=201, location_id=1, qty=25)
    _reserve(db, mo, product_id=201, location_id=2, qty=15)
    _reserve(db, mo, product_id=202, location_id=1, qty=5)
    _add_source(db, mo, order_id=7, qty=5, priority_color="orange")
    monkeypatch.setattr(
        "backend.services.production_execution.production_card_pdf_service.build_production_pick_plan",
        lambda *_a, **_k: SimpleNamespace(lines=[]),
    )
    ctx = _order_card_context(db, tenant_id=1, order_id=int(mo.id))
    assert ctx["header_planned_qty"] == "5"
    assert ctx["header_barcode_value"] == "MO/PRINT/1"
    noga = next(c for c in ctx["components"] if "Noga" in c["name"])
    assert noga["required_qty"] == "40"
    codes = {a["location_code"]: a["quantity"] for a in noga["location_allocations"]}
    assert codes["B1-A-1"] == "25"
    assert codes["B1-A-2"] == "15"
    assert ctx["show_source_orders"] is True
    assert ctx["source_orders"][0]["is_priority"] is True
    db.close()
