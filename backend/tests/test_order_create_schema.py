"""
POST /orders create — schema drift + rollback safety.

  python -m pytest backend/tests/test_order_create_schema.py -q
"""

from __future__ import annotations

from datetime import datetime

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker

from backend.db.schema_upgrade import ensure_orders_picking_handoff_mode_column
from backend.models.order import Order
from backend.models.order_fulfillment_assignment_audit import OrderFulfillmentAssignmentAudit
from backend.models.order_item import OrderItem
from backend.models.order_ui_status import OrderUiStatus
from backend.models.product import Product
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wm_price_tier import WmPriceTier
from backend.services.order_list_service import ensure_orders_create_schema


def _base_engine():
    engine = create_engine("sqlite:///:memory:")
    for m in (
        Tenant,
        Warehouse,
        Order,
        OrderItem,
        Product,
        OrderUiStatus,
        OrderFulfillmentAssignmentAudit,
        WmPriceTier,
    ):
        m.__table__.create(engine, checkfirst=True)
    return engine


def _strip_handoff_column(engine):
    """Legacy schema: orders without picking_handoff_mode."""
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE orders RENAME TO orders_full"))
        cols = [c["name"] for c in inspect(engine).get_columns("orders_full")]
        keep = [c for c in cols if c != "picking_handoff_mode"]
        col_defs = ", ".join(f'"{c}"' for c in keep)
        conn.execute(text(f"CREATE TABLE orders AS SELECT {col_defs} FROM orders_full"))
        conn.execute(text("DROP TABLE orders_full"))
    assert "picking_handoff_mode" not in {c["name"] for c in inspect(engine).get_columns("orders")}


def test_case2_legacy_schema_ensure_then_insert():
    """CASE 2+3: missing handoff → ensure → INSERT OK; handoff stays NULL."""
    engine = _base_engine()
    _strip_handoff_column(engine)

    order = Order(
        tenant_id=1,
        warehouse_id=1,
        number="N1",
        status="NEW",
        order_date=datetime.utcnow(),
        created_at=datetime.utcnow(),
        value=1.0,
        currency="PLN",
    )
    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(Tenant(id=1, name="T", default_warehouse_id=1))
    db.add(Warehouse(id=1, tenant_id=1, name="WH"))
    db.commit()

    with pytest.raises(OperationalError) as ei:
        db.add(order)
        db.flush()
    assert "picking_handoff_mode" in str(ei.value.orig)
    db.rollback()

    ensure_orders_create_schema(engine)
    assert "picking_handoff_mode" in {c["name"] for c in inspect(engine).get_columns("orders")}

    order2 = Order(
        tenant_id=1,
        warehouse_id=1,
        number="N2",
        status="NEW",
        order_date=datetime.utcnow(),
        created_at=datetime.utcnow(),
        value=1.0,
        currency="PLN",
    )
    db.add(order2)
    db.flush()
    assert order2.id is not None
    assert order2.picking_handoff_mode is None
    assert order2.cart_id is None
    assert order2.basket_id is None
    assert order2.picking_session_id is None
    db.commit()


def test_case4_item_insert_failure_rolls_back_order():
    """CASE 4: failure after order flush → rollback leaves no order."""
    engine = _base_engine()
    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(Tenant(id=1, name="T", default_warehouse_id=1))
    db.add(Warehouse(id=1, tenant_id=1, name="WH"))
    db.commit()

    order = Order(
        tenant_id=1,
        warehouse_id=1,
        number="RB-1",
        status="NEW",
        order_date=datetime.utcnow(),
        created_at=datetime.utcnow(),
        value=1.0,
        currency="PLN",
    )
    db.add(order)
    db.flush()
    oid = int(order.id)
    try:
        raise RuntimeError("simulated item insert failure")
    except Exception:
        db.rollback()

    assert db.query(Order).filter(Order.id == oid).first() is None


def test_ensure_picking_handoff_idempotent():
    engine = _base_engine()
    ensure_orders_picking_handoff_mode_column(engine)
    ensure_orders_picking_handoff_mode_column(engine)
    assert "picking_handoff_mode" in {c["name"] for c in inspect(engine).get_columns("orders")}
