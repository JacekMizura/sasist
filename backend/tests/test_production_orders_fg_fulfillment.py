"""
Phase 4 — ORDERS MO progress → source fulfillment → buffer PW → packing.

  python -m pytest backend/tests/test_production_orders_fg_fulfillment.py -q
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

import pytest
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker

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
    PRODUCTION_ORDER_SOURCE_ITEM_FULFILLED,
    PRODUCTION_ORDER_SOURCE_ITEM_PARTIAL,
    PRODUCTION_ORDER_SOURCE_ITEM_RESERVED,
    PRODUCTION_ORDER_SOURCE_MANUAL,
    PRODUCTION_ORDER_SOURCE_ORDERS,
    ProductionOrder,
    ProductionOrderLineSnapshot,
    ProductionOrderSourceItem,
)
from backend.models.stock_document import StockDocument, StockDocumentItem
from backend.models.stock_operation import StockOperation
from backend.models.stock_reservation import StockReservation
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.schemas.production_execution import OrderProductionProgressBody
from backend.services.production_execution.order_execution_service import (
    finish_order_production,
    update_order_production_progress,
)
from backend.services.production_execution.orders_fg_fulfillment_service import (
    allocate_produced_delta_to_order_sources,
    receive_orders_mo_fg_to_buffer,
    resolve_orders_mo_buffer_location_id,
    sum_source_fulfilled_quantity,
)
from backend.services.production_execution.pw_putaway_handoff import create_order_pw_document_for_putaway
from backend.services.production_order_service import ProductionOrderError
from backend.services.stock_disposition import STOCK_DISPOSITION_SALEABLE
from backend.services.stock_document_service import compute_can_wms_putaway
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
        "backend.services.production_execution.orders_fg_fulfillment_service.append_receipt_operation",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "backend.services.production_execution.pw_putaway_handoff.require_warehouse_series",
        lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("no series")),
    )
    monkeypatch.setattr(
        "backend.services.production_execution.pw_putaway_handoff.append_receipt_operation",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "backend.services.production_execution.pw_putaway_handoff.ensure_default_pz_receiving_location_if_missing",
        lambda db, doc: setattr(doc, "location_id", 99) or None,
    )
    monkeypatch.setattr(
        "backend.services.production_execution.cost_service.compute_order_unit_cost",
        lambda *_a, **_k: 10.0,
    )
    monkeypatch.setattr(
        "backend.services.production_execution.order_execution_service.serialize_order",
        lambda db, order, **_kw: order,
    )
    monkeypatch.setattr(
        "backend.services.stock_document_service.recompute_putaway_status_for_document",
        lambda doc, _lines, db=None: None,
    )


def _bootstrap(*, with_buffer: bool = True):
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
        StockDocument,
        StockDocumentItem,
        StockOperation,
        StockReservation,
        FulfillmentEvent,
        OrderItemPickAllocation,
    ):
        model.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(Tenant(id=1, name="T", default_warehouse_id=1))
    db.add(Warehouse(id=1, tenant_id=1, name="WH", requires_putaway=False))
    db.add(Location(id=1, warehouse_id=1, name="PICK", location_type="NORMAL", is_active=True))
    db.add(Location(id=50, warehouse_id=1, name="BUFOR_PRODUKCJA_A", location_type="NORMAL", is_active=True))
    db.add(Location(id=99, warehouse_id=1, name="DOCK-IN", location_type="DOCK", is_active=True))
    for sid, name in ((10, "Produkcja A"), (11, "Do pakowania"), (12, "Problem")):
        db.add(
            OrderUiStatus(
                id=sid, tenant_id=1, warehouse_id=1, name=name, color="#000", main_group="NEW"
            )
        )
    db.add(Product(id=100, tenant_id=1, name="Krzesło", sku="KRZ"))
    db.add(Product(id=201, tenant_id=1, name="Noga", sku="NOG"))
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
            composition_id=1, component_product_id=201, quantity=1.0, waste_percent=0.0, sort_order=0
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
            finished_goods_buffer_location_id=50 if with_buffer else None,
            production_order_trigger_scope="SINGLE_ELEMENT",
        )
    )
    db.commit()
    return db


def _make_mo(db, *, planned: float = 5.0, location_id: int | None = 50) -> ProductionOrder:
    mo = ProductionOrder(
        tenant_id=1,
        number="MO/2026/1",
        composition_id=1,
        product_id=100,
        warehouse_id=1,
        location_id=location_id,
        planned_quantity=float(planned),
        produced_quantity=0.0,
        status="in_progress",
        source_type=PRODUCTION_ORDER_SOURCE_ORDERS,
        picking_config_id=1,
        production_source_status_id=10,
    )
    db.add(mo)
    db.flush()
    db.add(
        ProductionOrderLineSnapshot(
            production_order_id=int(mo.id),
            component_product_id=201,
            quantity_per_unit=1.0,
            total_required_quantity=float(planned),
            consumed_quantity=0.0,
            product_name_snapshot="Noga",
        )
    )
    db.commit()
    db.refresh(mo)
    return mo


def _add_source(
    db,
    mo: ProductionOrder,
    *,
    order_id: int,
    qty: float,
    priority_color: str | None = None,
    created_at: datetime | None = None,
) -> tuple[Order, ProductionOrderSourceItem]:
    o = Order(
        id=order_id,
        tenant_id=1,
        warehouse_id=1,
        number=f"O{order_id}",
        order_ui_status_id=10,
        priority_color=priority_color,
        created_at=created_at or datetime.utcnow(),
    )
    db.add(o)
    db.flush()
    it = OrderItem(id=order_id * 10, order_id=order_id, product_id=100, quantity=float(qty))
    db.add(it)
    db.flush()
    src = ProductionOrderSourceItem(
        tenant_id=1,
        production_order_id=int(mo.id),
        order_id=order_id,
        order_item_id=int(it.id),
        product_id=100,
        requested_quantity=float(qty),
        fulfilled_quantity=0.0,
        status=PRODUCTION_ORDER_SOURCE_ITEM_RESERVED,
    )
    db.add(src)
    db.commit()
    return o, src


def _buffer_stock(db) -> float:
    row = (
        db.query(Inventory)
        .filter(Inventory.product_id == 100, Inventory.location_id == 50)
        .first()
    )
    return float(row.quantity or 0) if row else 0.0


def test_progress_allocates_sources_a_then_b():
    db = _bootstrap()
    mo = _make_mo(db, planned=5)
    _add_source(db, mo, order_id=1, qty=2, created_at=datetime(2026, 1, 1))
    _add_source(db, mo, order_id=2, qty=3, created_at=datetime(2026, 1, 2))

    update_order_production_progress(
        db, tenant_id=1, order_id=int(mo.id), body=OrderProductionProgressBody(add_quantity=1)
    )
    db.commit()
    s1 = db.query(ProductionOrderSourceItem).filter_by(order_id=1).one()
    s2 = db.query(ProductionOrderSourceItem).filter_by(order_id=2).one()
    assert s1.fulfilled_quantity == pytest.approx(1.0)
    assert s1.status == PRODUCTION_ORDER_SOURCE_ITEM_PARTIAL
    assert s2.fulfilled_quantity == pytest.approx(0.0)
    assert db.query(Order).get(1).order_ui_status_id == 10

    update_order_production_progress(
        db, tenant_id=1, order_id=int(mo.id), body=OrderProductionProgressBody(add_quantity=1)
    )
    db.commit()
    s1 = db.query(ProductionOrderSourceItem).filter_by(order_id=1).one()
    assert s1.fulfilled_quantity == pytest.approx(2.0)
    assert s1.status == PRODUCTION_ORDER_SOURCE_ITEM_FULFILLED
    assert db.query(Order).get(1).order_ui_status_id == 11
    assert db.query(Order).get(2).order_ui_status_id == 10

    update_order_production_progress(
        db, tenant_id=1, order_id=int(mo.id), body=OrderProductionProgressBody(add_quantity=1)
    )
    db.commit()
    s2 = db.query(ProductionOrderSourceItem).filter_by(order_id=2).one()
    assert s2.fulfilled_quantity == pytest.approx(1.0)
    assert s2.status == PRODUCTION_ORDER_SOURCE_ITEM_PARTIAL


def test_priority_gets_fulfillment_first():
    db = _bootstrap()
    mo = _make_mo(db, planned=2)
    _add_source(
        db, mo, order_id=1, qty=1, priority_color="gray", created_at=datetime(2026, 1, 1)
    )
    _add_source(
        db, mo, order_id=2, qty=1, priority_color="red", created_at=datetime(2026, 1, 2)
    )
    update_order_production_progress(
        db, tenant_id=1, order_id=int(mo.id), body=OrderProductionProgressBody(add_quantity=1)
    )
    db.commit()
    assert db.query(ProductionOrderSourceItem).filter_by(order_id=2).one().fulfilled_quantity == 1
    assert db.query(ProductionOrderSourceItem).filter_by(order_id=1).one().fulfilled_quantity == 0
    assert db.query(Order).get(2).order_ui_status_id == 11


def test_partial_does_not_change_status():
    db = _bootstrap()
    mo = _make_mo(db, planned=3)
    _add_source(db, mo, order_id=1, qty=3)
    update_order_production_progress(
        db, tenant_id=1, order_id=int(mo.id), body=OrderProductionProgressBody(add_quantity=2)
    )
    db.commit()
    assert db.query(Order).get(1).order_ui_status_id == 10
    src = db.query(ProductionOrderSourceItem).one()
    assert src.status == PRODUCTION_ORDER_SOURCE_ITEM_PARTIAL


def test_status_after_once_on_full_fulfillment():
    db = _bootstrap()
    mo = _make_mo(db, planned=1)
    _add_source(db, mo, order_id=1, qty=1)
    update_order_production_progress(
        db, tenant_id=1, order_id=int(mo.id), body=OrderProductionProgressBody(add_quantity=1)
    )
    db.commit()
    assert db.query(Order).get(1).order_ui_status_id == 11
    # Re-running allocation with zero delta must not change again
    allocate_produced_delta_to_order_sources(db, mo=mo, delta_qty=0)
    assert db.query(Order).get(1).order_ui_status_id == 11


def test_fulfilled_sum_never_exceeds_produced():
    db = _bootstrap()
    mo = _make_mo(db, planned=5)
    _add_source(db, mo, order_id=1, qty=2)
    _add_source(db, mo, order_id=2, qty=3)
    update_order_production_progress(
        db, tenant_id=1, order_id=int(mo.id), body=OrderProductionProgressBody(add_quantity=2)
    )
    db.commit()
    db.refresh(mo)
    sources = db.query(ProductionOrderSourceItem).all()
    assert sum_source_fulfilled_quantity(sources) <= float(mo.produced_quantity) + 1e-6


def test_acceptance_three_orders_progressive_buffer():
    db = _bootstrap()
    mo = _make_mo(db, planned=3)
    for i in range(100, 103):
        _add_source(db, mo, order_id=i, qty=1, created_at=datetime(2026, 1, i - 99))

    for oid in (100, 101, 102):
        update_order_production_progress(
            db, tenant_id=1, order_id=int(mo.id), body=OrderProductionProgressBody(add_quantity=1)
        )
        db.commit()
        assert db.query(Order).get(oid).order_ui_status_id == 11
        assert _buffer_stock(db) == pytest.approx(float(oid - 99))

    db.refresh(mo)
    assert mo.produced_quantity == pytest.approx(3.0)
    pw = db.query(StockDocument).filter(StockDocument.id == mo.pw_stock_document_id).one()
    assert int(pw.location_id) == 50
    assert str(pw.putaway_status).upper() == "DONE"
    assert str(pw.relocation_status).upper() == "DONE"
    assert compute_can_wms_putaway(pw) is False
    assert _buffer_stock(db) == pytest.approx(3.0)

    finish_order_production(db, tenant_id=1, order_id=int(mo.id))
    db.commit()
    db.refresh(mo)
    assert mo.status == "completed"
    assert _buffer_stock(db) == pytest.approx(3.0)  # no double receipt


def test_manual_pw_still_uses_putaway_staging(monkeypatch):
    db = _bootstrap()

    def _fake_create(db, **kwargs):
        from backend.models.stock_document import StockDocument, StockDocumentItem
        from datetime import date

        doc = StockDocument(
            tenant_id=1,
            warehouse_id=1,
            location_id=99,
            document_type="PW",
            creation_source="PRODUCTION",
            production_order_id=kwargs.get("production_order_id"),
            status="draft",
            receiving_status="DONE",
            putaway_status="NOT_STARTED",
            relocation_status="OPEN",
        )
        db.add(doc)
        db.flush()
        db.add(
            StockDocumentItem(
                document_id=int(doc.id),
                product_id=100,
                ordered_quantity=2.0,
                received_quantity=2.0,
                quantity=2.0,
                purchase_price_net=10.0,
                batch_number="",
                expiry_date=date(9999, 12, 31),
            )
        )
        db.flush()
        return doc

    monkeypatch.setattr(
        "backend.services.production_execution.pw_putaway_handoff._create_pw_for_putaway",
        _fake_create,
    )
    mo = ProductionOrder(
        tenant_id=1,
        number="MO-MAN",
        composition_id=1,
        product_id=100,
        warehouse_id=1,
        planned_quantity=2.0,
        produced_quantity=2.0,
        status="in_progress",
        source_type=PRODUCTION_ORDER_SOURCE_MANUAL,
    )
    db.add(mo)
    db.commit()
    pw_id = create_order_pw_document_for_putaway(db, order=mo)
    db.commit()
    pw = db.query(StockDocument).filter(StockDocument.id == pw_id).one()
    assert int(pw.location_id) == 99
    assert str(pw.putaway_status).upper() == "NOT_STARTED"
    assert str(pw.relocation_status).upper() == "OPEN"


def test_missing_buffer_raises_controlled_error():
    db = _bootstrap(with_buffer=False)
    mo = _make_mo(db, planned=1, location_id=None)
    _add_source(db, mo, order_id=1, qty=1)
    with pytest.raises(ProductionOrderError) as ei:
        update_order_production_progress(
            db, tenant_id=1, order_id=int(mo.id), body=OrderProductionProgressBody(add_quantity=1)
        )
    assert ei.value.code == "missing_buffer_location"
    assert db.query(StockDocument).count() == 0
    assert _buffer_stock(db) == 0


def test_packing_sees_production_fulfilled_qty():
    db = _bootstrap()
    mo = _make_mo(db, planned=1)
    o, src = _add_source(db, mo, order_id=1, qty=1)
    update_order_production_progress(
        db, tenant_id=1, order_id=int(mo.id), body=OrderProductionProgressBody(add_quantity=1)
    )
    db.commit()
    it = db.query(OrderItem).filter(OrderItem.id == src.order_item_id).one()
    db.refresh(o)
    assert order_item_required_pack_qty(db, o, it) == 1
    alloc = db.query(OrderItemPickAllocation).filter_by(order_item_id=int(it.id)).one()
    assert int(alloc.location_id) == 50
    assert float(alloc.quantity) == pytest.approx(1.0)
    fe = db.query(FulfillmentEvent).filter_by(order_item_id=int(it.id), type=FE_PICK).one()
    assert float(fe.quantity) == pytest.approx(1.0)


def test_progress_idempotent_fulfillment_via_delta_only():
    """Recomputing with same produced does not double-fulfill when delta=0."""
    db = _bootstrap()
    mo = _make_mo(db, planned=2)
    _add_source(db, mo, order_id=1, qty=2)
    update_order_production_progress(
        db, tenant_id=1, order_id=int(mo.id), body=OrderProductionProgressBody(add_quantity=1)
    )
    db.commit()
    src = db.query(ProductionOrderSourceItem).one()
    assert src.fulfilled_quantity == pytest.approx(1.0)
    allocate_produced_delta_to_order_sources(db, mo=mo, delta_qty=0, buffer_location_id=50)
    db.commit()
    src = db.query(ProductionOrderSourceItem).one()
    assert src.fulfilled_quantity == pytest.approx(1.0)
