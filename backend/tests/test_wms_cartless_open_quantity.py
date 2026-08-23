"""
Cartless open-qty SSOT: detail remaining and quick-pick must agree.

  python -m pytest backend/tests/test_wms_cartless_open_quantity.py -q
"""

from __future__ import annotations

from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.pick import Pick
from backend.models.picking_config import PickingConfig
from backend.models.product import Product
from backend.models.stock_reservation import StockReservation
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_operation_session import WmsOperationSession
from backend.services.stock_disposition import STOCK_DISPOSITION_SALEABLE
from backend.services.wms_basket_put import error_codes as ec
from backend.services.wms_basket_put.scan_service import BasketPutError
from backend.services.wms_cartless_picking.pick_service import record_cartless_quick_pick
from backend.services.wms_cartless_picking.scope import (
    cartless_order_item_open_qty,
    sum_picks_for_order_item_cartless,
)


LOC_ID = 501
PROD_ID = 193
SESSION_ID = 144


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (
        Tenant,
        Warehouse,
        Product,
        Location,
        Inventory,
        StockReservation,
        Order,
        OrderItem,
        Pick,
        WmsOperationSession,
        PickingConfig,
    ):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    session.add(
        Product(
            id=PROD_ID,
            tenant_id=1,
            name="Sznurówadła CAT 100 cm",
            sku="ST-001",
            ean="5905450181185",
        )
    )
    session.add(Location(id=LOC_ID, warehouse_id=1, name="B3-C-1", is_active=True))
    session.add(
        PickingConfig(
            tenant_id=1,
            warehouse_id=1,
            source_status_id=5,
            target_status_id=7,
            strategy="by_products",
            single_mode="bulk",
            multi_mode="bulk",
            max_single_orders=50,
            max_multi_orders=50,
        )
    )
    session.commit()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def _patch(monkeypatch):
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.pick_service._allowed_pick_location_ids_for_product",
        lambda *a, **k: {LOC_ID},
    )
    term = type(
        "T",
        (),
        {
            "allow_reserve_location_picking": True,
            "require_product_scan_at_least_once": False,
            "require_location_scan": False,
            "disable_force_location_scan_when_many_locations": False,
        },
    )()
    monkeypatch.setattr(
        "backend.services.wms_picking_terminal_settings_service.get_or_create_wms_picking_terminal_settings",
        lambda *a, **k: term,
    )
    monkeypatch.setattr(
        "backend.services.wms_picking_terminal_settings_service.resolve_gates_from_terminal_row",
        lambda *a, **k: type("G", (), {"require_product_scan": False, "require_location_scan": False})(),
    )
    monkeypatch.setattr(
        "backend.services.wms_picking_terminal_settings_service.assert_pick_terminal_gates",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_picking_terminal_settings_service.product_has_scannable_code",
        lambda *a, **k: True,
    )
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.pick_service.resolve_wms_picking_order_ids",
        lambda db, **k: [
            int(r.id)
            for r in db.query(Order).filter(Order.picking_session_id == SESSION_ID).all()
        ],
    )
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.pick_service.record_pick_event_for_wms_pick",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.pick_service.emit_wms_picked_item",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.pick_service.emit_wms_picking_started",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_basket_put.location_stock.effective_pickable_qty_at_location",
        lambda *a, **k: 212.0,
    )


def _session_open_qty(db, oi: OrderItem) -> float:
    """Same SSOT used by product-lines remaining_to_pick for cartless."""
    return cartless_order_item_open_qty(
        db,
        order_item_id=int(oi.id),
        required_qty=float(oi.quantity or 0),
        missing_qty=float(oi.wms_picking_line_missing_qty or 0),
    )


def _session(db) -> WmsOperationSession:
    from backend.services.cart_picking_lifecycle_service import SESSION_KIND_PICKING_ACTIVE

    sess = WmsOperationSession(
        id=SESSION_ID,
        tenant_id=1,
        warehouse_id=1,
        session_kind=SESSION_KIND_PICKING_ACTIVE,
        cart_id=None,
        operator_user_id=9,
        started_at=datetime.utcnow(),
        last_activity_at=datetime.utcnow(),
        completed_at=None,
    )
    db.add(sess)
    db.flush()
    return sess


def _order_line(db, *, session_id: int, qty: float = 2.0, status: str | None = None) -> Order:
    o = Order(
        id=9001,
        tenant_id=1,
        warehouse_id=1,
        number="S-144-193",
        order_ui_status_id=5,
        picking_session_id=int(session_id),
        cart_id=None,
        picking_started_at=datetime.utcnow(),
    )
    db.add(o)
    db.flush()
    oi = OrderItem(
        id=91001,
        order_id=int(o.id),
        product_id=PROD_ID,
        quantity=float(qty),
        wms_picking_line_status=status,
        wms_picking_line_missing_qty=0.0,
    )
    db.add(oi)
    db.flush()
    return o


def _stock(db, *, qty: float = 212.0) -> None:
    db.add(
        Inventory(
            tenant_id=1,
            warehouse_id=1,
            product_id=PROD_ID,
            location_id=LOC_ID,
            quantity=float(qty),
            stock_disposition=STOCK_DISPOSITION_SALEABLE,
        )
    )


def test_open_qty_two_picks_then_no_open(db):
    """required=2, stock=212, no picks → rem=2; pick×2 ok; 3rd → NO_OPEN_QUANTITY."""
    _session(db)
    o = _order_line(db, session_id=SESSION_ID, qty=2.0, status=None)
    _stock(db, qty=212.0)
    db.commit()

    oi = o.items[0]
    assert _session_open_qty(db, oi) == pytest.approx(2.0)

    record_cartless_quick_pick(
        db,
        tenant_id=1,
        warehouse_id=1,
        source_status_id=5,
        order_type="all",
        product_id=PROD_ID,
        location_id=LOC_ID,
        quantity=1.0,
        picking_session_id=SESSION_ID,
        operator_user_id=9,
    )
    db.flush()
    assert sum_picks_for_order_item_cartless(db, order_item_id=int(oi.id)) == pytest.approx(1.0)
    assert _session_open_qty(db, oi) == pytest.approx(1.0)

    record_cartless_quick_pick(
        db,
        tenant_id=1,
        warehouse_id=1,
        source_status_id=5,
        order_type="all",
        product_id=PROD_ID,
        location_id=LOC_ID,
        quantity=1.0,
        picking_session_id=SESSION_ID,
        operator_user_id=9,
    )
    db.flush()
    assert _session_open_qty(db, oi) == pytest.approx(0.0)

    with pytest.raises(BasketPutError) as ei:
        record_cartless_quick_pick(
            db,
            tenant_id=1,
            warehouse_id=1,
            source_status_id=5,
            order_type="all",
            product_id=PROD_ID,
            location_id=LOC_ID,
            quantity=1.0,
            picking_session_id=SESSION_ID,
            operator_user_id=9,
        )
    assert ei.value.code == ec.NO_OPEN_QUANTITY


def test_stale_picked_status_with_open_qty_still_pickable(db):
    """PRODUCTION: rem=2 from Pick SSOT but status='picked' must NOT yield NO_OPEN."""
    _session(db)
    o = _order_line(db, session_id=SESSION_ID, qty=2.0, status="picked")
    _stock(db, qty=212.0)
    db.commit()

    oi = o.items[0]
    assert _session_open_qty(db, oi) == pytest.approx(2.0)

    oid, oiid = record_cartless_quick_pick(
        db,
        tenant_id=1,
        warehouse_id=1,
        source_status_id=5,
        order_type="all",
        product_id=PROD_ID,
        location_id=LOC_ID,
        quantity=1.0,
        picking_session_id=SESSION_ID,
        operator_user_id=9,
    )
    assert oid > 0 and oiid > 0
    db.refresh(oi)
    assert _session_open_qty(db, oi) == pytest.approx(1.0)
    assert sum_picks_for_order_item_cartless(db, order_item_id=int(oi.id)) == pytest.approx(1.0)


def test_foreign_session_pick_does_not_block_current_line_open_qty(db):
    """Pick on a different order_item / session must not zero current open qty."""
    _session(db)
    o = _order_line(db, session_id=SESSION_ID, qty=2.0)
    # Legacy pick on unrelated order_item (different product line id) — not this oi.
    db.add(
        Order(
            id=8000,
            tenant_id=1,
            warehouse_id=1,
            number="OLD",
            order_ui_status_id=5,
            picking_session_id=99,
            cart_id=None,
        )
    )
    db.flush()
    db.add(
        OrderItem(id=80001, order_id=8000, product_id=PROD_ID, quantity=5.0)
    )
    db.add(
        Pick(
            tenant_id=1,
            warehouse_id=1,
            order_id=8000,
            order_item_id=80001,
            product_id=PROD_ID,
            location_id=LOC_ID,
            cart_id=None,
            quantity=5.0,
            status="picking",
            picked_at=None,
        )
    )
    db.commit()
    oi = o.items[0]
    assert _session_open_qty(db, oi) == pytest.approx(2.0)
