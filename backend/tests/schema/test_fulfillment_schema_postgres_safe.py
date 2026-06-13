"""Fulfillment / order_items schema ensures — dialect-agnostic column detection."""

from __future__ import annotations

from sqlalchemy import create_engine, text

from backend.db.schema_upgrade import (
    ensure_order_items_fulfillment_sync_columns,
    ensure_order_items_wms_picking_line_status,
    ensure_orders_fulfillment_state_columns,
)


def _sqlite_order_items_engine():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE order_items (id INTEGER PRIMARY KEY, quantity REAL)"))
    return engine


def _sqlite_orders_engine():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE orders (id INTEGER PRIMARY KEY)"))
    return engine


def test_wms_picking_line_status_sqlite_uses_inspector_not_pragma():
    engine = _sqlite_order_items_engine()
    ensure_order_items_wms_picking_line_status(engine)
    with engine.connect() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(order_items)"))}
    assert "wms_picking_line_status" in cols


def test_fulfillment_sync_columns_sqlite():
    engine = _sqlite_order_items_engine()
    ensure_order_items_fulfillment_sync_columns(engine)
    with engine.connect() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(order_items)"))}
    assert "wms_shortage_declared_qty" in cols
    assert "oms_removed_qty" in cols
    assert "replaced_from_product_name" in cols


def test_orders_fulfillment_state_sqlite():
    engine = _sqlite_orders_engine()
    ensure_orders_fulfillment_state_columns(engine)
    with engine.connect() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(orders)"))}
    assert "fulfillment_state" in cols
    assert "picking_session_id" in cols
