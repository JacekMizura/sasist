"""
Foundation: order-driven production on existing ProductionOrder + picking production mode.

  python -m pytest backend/tests/test_production_order_sources.py -q
"""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.product import Product
from backend.models.production import (
    PRODUCTION_ORDER_SOURCE_MANUAL,
    PRODUCTION_ORDER_SOURCE_ORDERS,
    ProductionOrder,
    ProductionOrderLineSnapshot,
    ProductionOrderSourceItem,
)
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.services.production_order_service import serialize_order
from backend.services.production_order_source_service import (
    ProductionOrderSourceError,
    attach_order_source_item,
)


def _base_engine():
    return create_engine("sqlite:///:memory:")


def _seed_orders_db(engine):
    for model in (
        Tenant,
        Warehouse,
        Product,
        Order,
        OrderItem,
        ProductionOrder,
        ProductionOrderLineSnapshot,
        ProductionOrderSourceItem,
    ):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(Tenant(id=1, name="T", default_warehouse_id=1))
    db.add(Warehouse(id=1, tenant_id=1, name="WH"))
    db.add(Product(id=10, tenant_id=1, name="FG", sku="FG-1"))
    db.add(Order(id=100, tenant_id=1, warehouse_id=1, number="ORD-100"))
    db.add(Order(id=101, tenant_id=1, warehouse_id=1, number="ORD-101"))
    db.add(Order(id=102, tenant_id=1, warehouse_id=1, number="ORD-102"))
    for oid, iid in ((100, 1001), (101, 1002), (102, 1003)):
        db.add(OrderItem(id=iid, order_id=oid, product_id=10, quantity=2))
    mo = ProductionOrder(
        id=50,
        tenant_id=1,
        number="MO-ORD",
        product_id=10,
        warehouse_id=1,
        planned_quantity=6.0,
        produced_quantity=0.0,
        status="planned",
        source_type=PRODUCTION_ORDER_SOURCE_ORDERS,
    )
    db.add(mo)
    db.commit()
    return db


def test_existing_mo_defaults_to_manual_source_type():
    engine = _base_engine()
    for model in (Tenant, Warehouse, Product, ProductionOrder, ProductionOrderLineSnapshot, ProductionOrderSourceItem):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        db.add(Tenant(id=1, name="T", default_warehouse_id=1))
        db.add(Warehouse(id=1, tenant_id=1, name="WH"))
        db.add(Product(id=1, tenant_id=1, name="P"))
        mo = ProductionOrder(
            tenant_id=1,
            number="MO-LEGACY",
            product_id=1,
            warehouse_id=1,
            planned_quantity=1.0,
            produced_quantity=0.0,
            status="planned",
            # omit source_type — ORM / server default MANUAL
        )
        db.add(mo)
        db.commit()
        db.refresh(mo)
        assert str(mo.source_type or PRODUCTION_ORDER_SOURCE_MANUAL) == PRODUCTION_ORDER_SOURCE_MANUAL
        read = serialize_order(db, mo)
        assert read.source_type == "MANUAL"
        assert read.source_order_count == 0
        assert read.source_requested_quantity_total == 0.0
    finally:
        db.close()


def test_mo_orders_can_have_three_distinct_order_items():
    engine = _base_engine()
    db = _seed_orders_db(engine)
    try:
        mo = db.query(ProductionOrder).filter(ProductionOrder.id == 50).one()
        for iid, qty in ((1001, 2.0), (1002, 2.0), (1003, 2.0)):
            attach_order_source_item(
                db, tenant_id=1, production_order=mo, order_item_id=iid, requested_quantity=qty
            )
        db.commit()
        sources = (
            db.query(ProductionOrderSourceItem)
            .filter(ProductionOrderSourceItem.production_order_id == 50)
            .all()
        )
        assert len(sources) == 3
        read = serialize_order(db, mo, with_order_sources=True)
        assert read.source_order_count == 3
        assert read.source_requested_quantity_total == pytest.approx(6.0)
        assert len(read.order_sources) == 3
    finally:
        db.close()


def test_duplicate_order_item_source_rejected():
    engine = _base_engine()
    db = _seed_orders_db(engine)
    try:
        mo = db.query(ProductionOrder).filter(ProductionOrder.id == 50).one()
        attach_order_source_item(
            db, tenant_id=1, production_order=mo, order_item_id=1001, requested_quantity=1.0
        )
        db.flush()
        with pytest.raises(ProductionOrderSourceError) as ctx:
            attach_order_source_item(
                db, tenant_id=1, production_order=mo, order_item_id=1001, requested_quantity=1.0
            )
        assert ctx.value.code == "duplicate_source"
    finally:
        db.close()


def test_requested_fulfilled_aggregates():
    engine = _base_engine()
    db = _seed_orders_db(engine)
    try:
        mo = db.query(ProductionOrder).filter(ProductionOrder.id == 50).one()
        a = attach_order_source_item(
            db, tenant_id=1, production_order=mo, order_item_id=1001, requested_quantity=3.0
        )
        b = attach_order_source_item(
            db, tenant_id=1, production_order=mo, order_item_id=1002, requested_quantity=5.0
        )
        a.fulfilled_quantity = 1.5
        b.fulfilled_quantity = 2.0
        db.flush()
        read = serialize_order(db, mo)
        assert read.source_requested_quantity_total == pytest.approx(8.0)
        assert read.source_fulfilled_quantity_total == pytest.approx(3.5)
    finally:
        db.close()
